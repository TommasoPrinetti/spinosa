import type { RequestEvent } from "@sveltejs/kit"
import { spawn } from "node:child_process"
import { join } from "node:path"

export async function POST(event: RequestEvent) {
  const body = await event.request.json() as {
    paths: string[]; workspacePath: string; extensions: string[]
  }
  const { paths, workspacePath } = body

  console.log("[PROCESS] Received:", JSON.stringify({ paths, workspacePath }))
  console.log("[PROCESS] cwd:", process.cwd())
  console.log("[PROCESS] PATH:", process.env.PATH?.slice(0, 200))
  if (!paths?.length) return new Response("paths required", { status: 400 })
  if (!workspacePath) return new Response("workspacePath required", { status: 400 })

  const headers = { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" }

  // Spawn Bun worker — runs copySource in Bun where native addons (OCR) work
  const scriptPath = join(process.cwd(), "scripts", "process-worker.ts")
  const input = JSON.stringify(body)
  const bunPath = process.env.BUN_PATH || "bun"

  console.log("[PROCESS] Spawning:", bunPath, "run", scriptPath)
  const bun = spawn(bunPath, ["run", scriptPath, input], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, BUN_PATH: undefined },
  })

  // Forward stdout (SSE events) to the response
  const { PassThrough } = await import("node:stream")
  const pt = new PassThrough()
  bun.stdout.pipe(pt)

  // Log stderr (worker debug output)
  bun.stderr.on("data", (chunk: Buffer) => {
    console.log(chunk.toString().trim())
  })

  // Handle worker exit — send complete with partial results
  bun.on("exit", (code) => {
    console.log("[PROCESS] Worker exited with code", code)
    if (!pt.destroyed) {
      pt.write(`data: ${JSON.stringify({ type: "complete", result: { files_processed: 0 }, workspacePath })}\n\n`)
      pt.end()
    }
  })

  bun.on("error", (err) => {
    console.error("[PROCESS] Worker error:", err.message)
    if (!pt.destroyed) {
      pt.write(`data: ${JSON.stringify({ type: "error", message: err.message })}\n\n`)
      pt.end()
    }
  })

  // Safety timeout: 60s max wait
  setTimeout(() => {
    if (!pt.destroyed) {
      console.warn("[PROCESS] Safety timeout — forcing stream close")
      pt.write(`data: ${JSON.stringify({ type: "complete", result: { files_processed: 0 }, workspacePath })}\n\n`)
      pt.end()
    }
  }, 60_000)

  return new Response(pt as any, { headers })
}
