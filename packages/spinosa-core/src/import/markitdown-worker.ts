import { ProgressEmitter } from "../progress/progress"
import {
  processMarkitdownInProcess,
  type ClassifiedEntry,
  type PhaseResult,
} from "./pipeline"
import { decodeWorkerPayload } from "./worker-payload"

export interface MarkitdownWorkerInput {
  files: ClassifiedEntry[]
  logsDir: string
}

export function sendMarkitdownWorkerMessage(type: string, payload: Record<string, unknown> = {}): void {
  process.stdout.write(`${JSON.stringify({ type, ...payload })}\n`)
}

/** Hard-exit on cancel signals so parent stop latency stays low (same as OCR). */
function installHardExitHandlers(): void {
  const exitNow = (signal: string) => {
    try {
      sendMarkitdownWorkerMessage("error", { message: `MarkItDown worker aborted by ${signal}` })
    } catch {
      // stdout may already be closed
    }
    process.exit(1)
  }
  process.once("SIGTERM", () => exitNow("SIGTERM"))
  process.once("SIGINT", () => exitNow("SIGINT"))
}

/** Shared MarkItDown worker entry for `bun run markitdown-worker.ts` and `spinosa internal markitdown-worker`. */
export async function runMarkitdownWorkerMain(input: MarkitdownWorkerInput): Promise<PhaseResult> {
  installHardExitHandlers()
  const { files, logsDir } = input
  const prog = new ProgressEmitter()
  prog.on((e) =>
    sendMarkitdownWorkerMessage("progress", {
      current: e.current,
      total: e.total,
      relPath: e.relPath,
      phase: e.phase,
      ...(e.status ? { status: e.status } : {}),
    }),
  )

  const result = await processMarkitdownInProcess(
    files,
    logsDir,
    prog,
    (msg) => sendMarkitdownWorkerMessage("log", { message: msg }),
    undefined,
    {
      inProcess: true,
      // Nested OCR must share this process group so parent cancel kills both.
      ocrDetached: false,
    },
  )

  sendMarkitdownWorkerMessage("done", {
    converted: result.converted,
    skipped: result.skipped,
    failed: result.failed,
    renamed: result.renamed,
    recoverable: result.recoverable,
  })
  return result
}

async function main() {
  const input = decodeWorkerPayload(process.argv[2]) as MarkitdownWorkerInput
  if (!Array.isArray(input.files) || typeof input.logsDir !== "string") {
    throw new Error("markitdown worker payload must include files[] and logsDir")
  }
  await runMarkitdownWorkerMain(input)
  process.exit(0)
}

if (import.meta.main) {
  main().catch((err) => {
    sendMarkitdownWorkerMessage("error", { message: err instanceof Error ? err.message : String(err) })
    process.exit(1)
  })
}
