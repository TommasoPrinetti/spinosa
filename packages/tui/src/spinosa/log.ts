import { mkdirSync, appendFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

let activeWorkspacePath: string | undefined

export function setActiveWorkspacePath(ws: string | undefined) {
  activeWorkspacePath = ws
}

/** Legacy plain-text logger — kept for backward compat */
export function tuiLog(message: string) {
  logEntry("info", "tui", { msg: message })
}

// ── Structured NDJSON logger ──────────────────────────────────────────

type LogLevel = "info" | "warn" | "error" | "debug"

type LogEvent =
  | "step"        // step transition
  | "action"      // user action (click, continue, back)
  | "phase"       // processing phase start/complete
  | "tool"        // tool check result
  | "error"       // error with stack
  | "result"      // processing result (converted/skipped/failed)
  | "gate"        // gate action triggered
  | "tui"         // generic TUI log

let logFile: string | undefined

function logPath(): string {
  if (logFile) return logFile
  const ws = activeWorkspacePath
  const logDir = ws
    ? path.join(ws, ".spinosa", "logs")
    : path.join(homedir(), ".spinosa", "logs")
  mkdirSync(logDir, { recursive: true })
  logFile = path.join(logDir, "tui.ndjson")
  return logFile
}

function logEntry(level: LogLevel, event: LogEvent, data: Record<string, unknown>) {
  try {
    const entry = {
      ts: new Date().toISOString(),
      level,
      event,
      ...data,
    }
    appendFileSync(logPath(), JSON.stringify(entry) + "\n")
  } catch {
    // best-effort
  }
}

/** Log a step transition */
export function logStep(step: string, detail?: string) {
  logEntry("info", "step", { step, msg: detail ?? `Entered ${step} step` })
}

/** Log a user action (button click, navigation) */
export function logAction(action: string, detail?: string, extra?: Record<string, unknown>) {
  logEntry("info", "action", { action, msg: detail ?? action, ...extra })
}

/** Log a processing phase event */
export function logPhase(phase: string, status: "start" | "complete" | "skip", detail?: string, extra?: Record<string, unknown>) {
  logEntry("info", "phase", { phase, status, msg: detail ?? `${phase} ${status}`, ...extra })
}

/** Log a tool check result */
export function logTool(tool: string, status: string, detail?: string) {
  logEntry("info", "tool", { tool, status, msg: detail ?? `${tool}: ${status}` })
}

/** Log a processing result */
export function logResult(phase: string, converted: number, skipped: number, failed: number, extra?: Record<string, unknown>) {
  logEntry("info", "result", { phase, converted, skipped, failed, msg: `${phase}: ${converted} converted, ${skipped} skipped, ${failed} failed`, ...extra })
}

/** Log a gate action */
export function logGate(label: string) {
  logEntry("info", "gate", { label, msg: `Gate: ${label}` })
}

/** Log an error with optional stack */
export function logError(context: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err)
  const stack = err instanceof Error ? err.stack : undefined
  logEntry("error", "error", { context, err: msg, ...(stack ? { stack } : {}), msg: `${context}: ${msg}` })
}
