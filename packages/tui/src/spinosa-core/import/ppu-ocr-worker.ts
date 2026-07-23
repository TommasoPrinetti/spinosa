import { runPpuOcrBatch, type PpuOcrFile } from "./ppu-ocr"

interface WorkerInput {
  files: PpuOcrFile[]
  engine?: "ppu-paddle-ocr" | "trocr"
}

function send(type: string, payload: Record<string, unknown> = {}) {
  process.stdout.write(JSON.stringify({ type, ...payload }) + "\n")
}

async function main() {
  const input = JSON.parse(process.argv[2]) as WorkerInput
  const { files } = input
  const engine = input.engine ?? process.env.SPINOSA_OCR_ENGINE ?? "ppu-paddle-ocr"

  if (engine === "trocr") {
    send("log", { message: `Using TrOCR engine for ${files.length} file(s)` })
    const { trocrBatch } = await import("./ppu-ocr-trocr")
    const result = await trocrBatch(files, {
      onLog: (msg) => send("log", { message: msg }),
    })
    send("done", { converted: result.converted, skipped: result.skipped })
    process.exit(0)
    return
  }

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
