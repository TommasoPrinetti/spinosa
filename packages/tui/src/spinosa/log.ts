import { mkdirSync, appendFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

let activeWorkspacePath: string | undefined

export function setActiveWorkspacePath(ws: string | undefined) {
  activeWorkspacePath = ws
}

export function tuiLog(message: string) {
  const ts = new Date().toISOString()
  const line = `${ts} tui ${message}\n`

  try {
    const ws = activeWorkspacePath
    const logDir = ws
      ? path.join(ws, ".spinosa", "logs")
      : path.join(homedir(), ".spinosa", "logs")
    mkdirSync(logDir, { recursive: true })
    appendFileSync(path.join(logDir, "tui.log"), line)
  } catch {
    // best-effort
  }
}
