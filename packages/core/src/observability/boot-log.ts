import { appendFileSync, chmodSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

const MAX_LOG_BYTES = 5 * 1024 * 1024
let _logDir: string | undefined

function logDir(): string {
  if (_logDir) return _logDir
  _logDir = path.join(process.env.SPINOSA_HOME ?? path.join(homedir(), ".spinosa"), "logs")
  return _logDir
}

function bootLogPath(): string {
  return path.join(logDir(), "boot.ndjson")
}

function ensureDir(dir: string): void {
  try {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 })
    }
    chmodSync(dir, 0o700)
  } catch {
    // best-effort
  }
}

function rotateLog(file: string): void {
  try {
    if (!existsSync(file)) return
    if (statSync(file).size < MAX_LOG_BYTES) return
    const previous = `${file}.1`
    rmSync(previous, { force: true })
    renameSync(file, previous)
  } catch {
    // best-effort
  }
}

function write(entry: Record<string, unknown>): void {
  try {
    ensureDir(logDir())
    const file = bootLogPath()
    rotateLog(file)
    appendFileSync(file, JSON.stringify(entry) + "\n", { mode: 0o600 })
    chmodSync(file, 0o600)
  } catch {
    // best-effort
  }
}

function isVerbose(): boolean {
  if (process.env.SPINOSA_VERBOSE_BOOT === "1" || process.env.SPINOSA_VERBOSE_BOOT === "true") return true
  return process.argv.some((a) => a === "--verbose")
}

export function bootLog(tag: string, message: string, extra?: Record<string, unknown>): void {
  const pid = process.pid
  const entry: Record<string, unknown> = {
    ts: Date.now(),
    pid,
    tag,
    msg: message,
  }
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      entry[k] = v
    }
  }
  write(entry)
  if (isVerbose()) {
    const prefix = `[boot:${tag}]`
    const suffix = extra ? ` ${JSON.stringify(extra)}` : ""
    console.error(`${prefix} ${message}${suffix}`)
  }
}

export function bootLogError(tag: string, error: unknown): void {
  const msg = error instanceof Error ? error.message : String(error)
  const stack = error instanceof Error ? error.stack : undefined
  const entry: Record<string, unknown> = {
    ts: Date.now(),
    pid: process.pid,
    tag,
    level: "error",
    msg,
  }
  if (stack) entry.stack = stack
  write(entry)
  if (isVerbose()) {
    console.error(`[boot:${tag}:ERROR] ${msg}`)
  }
}
