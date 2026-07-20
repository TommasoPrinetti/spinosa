import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

const MAX_LOG_BYTES = 5 * 1024 * 1024

function logFile(): string {
  const home = process.env.SPINOSA_HOME ?? path.join(homedir(), ".spinosa")
  const file = path.join(home, "logs", "spinosa.log")
  mkdirSync(path.dirname(file), { recursive: true })
  return file
}

function rotateLog(file: string): void {
  if (!existsSync(file) || statSync(file).size < MAX_LOG_BYTES) return
  const previous = `${file}.1`
  rmSync(previous, { force: true })
  renameSync(file, previous)
}

function isoNow(): string {
  return new Date().toISOString().replace("Z", "Z")
}

function sanitizeLogMessage(message: string): string {
  return message
    .replaceAll(homedir(), "~")
    .replace(/\b(workspacePath|sourcePath|corpusPath|frameworkRoot)=([^\s]+)/g, (_match, key: string, value: string) => `${key}=${path.basename(value)}`)
}

export function spinosaLog(level: "INFO" | "WARN" | "ERROR", component: string, message: string): void {
  try {
    const file = logFile()
    rotateLog(file)
    const safeMessage = sanitizeLogMessage(message)
    const line = `${isoNow()} level=${level} component=${component} ${safeMessage}\n`
    appendFileSync(file, line)
  } catch (e) { console.error("spinosa: failed to write log", e) }
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
