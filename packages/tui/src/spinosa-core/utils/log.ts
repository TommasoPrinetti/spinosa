import { appendFileSync, mkdirSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

const SPINOSA_HOME = process.env.SPINOSA_HOME ?? path.join(homedir(), ".spinosa")
const LOG_FILE = path.join(SPINOSA_HOME, "logs", "spinosa.log")

let initialized = false

function ensureLogDir(): void {
  if (initialized) return
  try {
    mkdirSync(path.dirname(LOG_FILE), { recursive: true })
  } catch { /* best effort */ }
  initialized = true
}

function isoNow(): string {
  return new Date().toISOString().replace("Z", "Z")
}

export function spinosaLog(level: "INFO" | "WARN" | "ERROR", component: string, message: string): void {
  try {
    ensureLogDir()
    const line = `${isoNow()} level=${level} component=${component} ${message}\n`
    appendFileSync(LOG_FILE, line)
  } catch { /* best effort */ }
}

export function spinosaLogInfo(component: string, message: string): void {
  spinosaLog("INFO", component, message)
}

export function spinosaLogWarn(component: string, message: string): void {
  spinosaLog("WARN", component, message)
}

export function spinosaLogError(component: string, message: string): void {
  spinosaLog("ERROR", component, message)
}
