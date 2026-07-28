import { appendFileSync, chmodSync, mkdirSync } from "node:fs"
import { homedir } from "node:os"
import path from "path"

const SENSITIVE_KEY = /(authorization|cookie|password|secret|token|api[_-]?key)/i
const PATH_KEY = /(^|_)(dir|directory|path|workspace)(s|id)?$/i

function logPath() {
  return path.join(process.env.SPINOSA_HOME ?? path.join(homedir(), ".spinosa"), "logs", "debug.ndjson")
}

function sanitize(value: unknown, key = ""): unknown {
  if (SENSITIVE_KEY.test(key)) return "[REDACTED]"
  if (Array.isArray(value)) return value.map((item) => sanitize(item, key))
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, sanitize(child, childKey)]))
  }
  if (typeof value !== "string") return value
  const text = value
    .replaceAll(homedir(), "~")
    .replace(/\b(Basic|Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [REDACTED]")
  return PATH_KEY.test(key) && path.isAbsolute(text) ? path.basename(text) : text
}

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
  const safeData = sanitize(data) as Record<string, unknown>
  const entry = { ts: Date.now(), tag, ...safeData }
  const line = JSON.stringify(entry) + "\n"
  try {
    const file = logPath()
    mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
    chmodSync(path.dirname(file), 0o700)
    appendFileSync(file, line, { mode: 0o600 })
    chmodSync(file, 0o600)
  } catch {
    // log file unavailable — best-effort
  }
  console.error(`[${tag}]`, ...Object.entries(safeData).flat())
}
