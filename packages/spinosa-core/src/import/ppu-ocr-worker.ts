import { runPpuOcrBatch, type PpuOcrFile } from "./ppu-ocr"

interface WorkerInput {
  files: PpuOcrFile[]
}

function send(type: string, payload: Record<string, unknown> = {}) {
  process.stdout.write(JSON.stringify({ type, ...payload }) + "\n")
}

async function main() {
  const input = JSON.parse(process.argv[2]) as WorkerInput
  const { files } = input

  const result = await runPpuOcrBatch(files, {
    onLog: (msg) => send("log", { message: msg }),
    onProgress: (current, total, relPath) => send("progress", { current, total, relPath }),
    onPageProgress: (current, total, relPath, page) => send("pageProgress", { current, total, relPath, page }),
  })

  send("done", { converted: result.converted, skipped: result.skipped })
  process.exit(0)
}

main().catch((err) => {
  send("error", { message: err instanceof Error ? err.message : String(err) })
  process.exit(1)
})
