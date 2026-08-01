import { runPpuOcrBatch, type PpuOcrFile } from "./ppu-ocr"

export interface OcrWorkerInput {
  files: PpuOcrFile[]
}

export function sendOcrWorkerMessage(type: string, payload: Record<string, unknown> = {}): void {
  process.stdout.write(`${JSON.stringify({ type, ...payload })}\n`)
}

/** Hard-exit on cancel signals so parent stop latency stays low. */
function installHardExitHandlers(): void {
  const exitNow = (signal: string) => {
    try {
      sendOcrWorkerMessage("error", { message: `OCR worker aborted by ${signal}` })
    } catch {
      // stdout may already be closed
    }
    process.exit(1)
  }
  process.once("SIGTERM", () => exitNow("SIGTERM"))
  process.once("SIGINT", () => exitNow("SIGINT"))
}

/** Shared OCR worker entry used by `bun run ppu-ocr-worker.ts` and `spinosa internal ocr-worker`. */
export async function runOcrWorkerMain(input: OcrWorkerInput): Promise<void> {
  installHardExitHandlers()
  const { files } = input
  // Models load once here (first job start), then stay warm for the whole batch.
  const result = await runPpuOcrBatch(files, {
    onLog: (msg) => sendOcrWorkerMessage("log", { message: msg }),
    onProgress: (current, total, relPath) => sendOcrWorkerMessage("progress", { current, total, relPath }),
    onPageProgress: (current, total, relPath, page) =>
      sendOcrWorkerMessage("pageProgress", { current, total, relPath, page }),
    onFileStart: (relPath) => sendOcrWorkerMessage("file-start", { relPath }),
    onFile: (file) =>
      sendOcrWorkerMessage("file", {
        relPath: file.rel,
        ok: file.ok,
        ...(file.error ? { error: file.error } : {}),
      }),
  })

  sendOcrWorkerMessage("done", {
    converted: result.converted,
    skipped: result.skipped,
    ...(result.errors ? { errors: result.errors } : {}),
  })
}

async function main() {
  const input = JSON.parse(process.argv[2] ?? "{}") as OcrWorkerInput
  if (!Array.isArray(input.files)) {
    throw new Error("ocr worker payload must include files: PpuOcrFile[]")
  }
  await runOcrWorkerMain(input)
  process.exit(0)
}

if (import.meta.main) {
  main().catch((err) => {
    sendOcrWorkerMessage("error", { message: err instanceof Error ? err.message : String(err) })
    process.exit(1)
  })
}
