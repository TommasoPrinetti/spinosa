import { appendFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "path"

const LOG_PATH = path.join(homedir(), ".spinosa", "logs", "debug.ndjson")

/**
 * Write a structured debug log entry to ~/.spinosa/logs/debug.ndjson.
 *
 * Format: NDJSON (one JSON object per line) — compatible with the
 * existing spinosa log system (`spinosa.log`, `tui.ndjson`).
 *
 * Each entry is a JSON line: { ts: <epoch ms>, tag: string, ...data }
 *
 * Also prints to stderr for terminal visibility.
 */
export function dbg(tag: string, data: Record<string, unknown>): void {
  const entry = { ts: Date.now(), tag, ...data }
  const line = JSON.stringify(entry) + "\n"
  try {
    appendFileSync(LOG_PATH, line)
  } catch {
    // log file unavailable — best-effort
  }
  console.error(`[${tag}]`, ...Object.entries(data).flat())
}
