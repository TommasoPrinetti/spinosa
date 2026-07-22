export type OutputFormat = "human" | "json" | "quiet"

export interface SpinosaCliIo {
  out(message: string): void
  error(message: string): void
  confirm(prompt: string, defaultYes?: boolean): Promise<boolean>
  format: OutputFormat
}

export function createIo(args: { flags: Set<string> }): SpinosaCliIo {
  if (args.flags.has("json")) return jsonIo
  if (args.flags.has("quiet")) return quietIo
  return humanIo
}

const humanIo: SpinosaCliIo = {
  out: (message) => process.stdout.write(`${message}\n`),
  error: (message) => process.stderr.write(`${message}\n`),
  format: "human",
  confirm: async (prompt, defaultYes = true) => {
    const hint = defaultYes ? "Y/n" : "y/N"
    process.stdout.write(`${prompt} (${hint}) `)
    const answer = await new Promise<string>((resolve) => {
      const onData = (chunk: Buffer) => {
        process.stdin.removeListener("data", onData)
        resolve(chunk.toString().trim().toLowerCase())
      }
      process.stdin.on("data", onData)
    })
    if (answer === "y" || answer === "yes") return true
    if (answer === "n" || answer === "no") return false
    return defaultYes
  },
}

/** JSON mode: progress to stderr, final result via emitResult to stdout */
const jsonIo: SpinosaCliIo = {
  out: (message) => process.stderr.write(`${message}\n`),
  error: (message) => process.stderr.write(`${message}\n`),
  format: "json",
  confirm: async () => true,
}

/** Quiet mode: no output, exit code only */
const quietIo: SpinosaCliIo = {
  out: () => {},
  error: () => {},
  format: "quiet",
  confirm: async () => true,
}

/** Emit the final structured result. Always goes to stdout for machine parsing. */
export function emitResult(io: SpinosaCliIo, command: string, data: Record<string, unknown>, summary: string): void {
  if (io.format === "json") {
    process.stdout.write(`${JSON.stringify({ command, ...data })}\n`)
  } else if (io.format === "human") {
    if (summary) io.out(summary)
  }
}
