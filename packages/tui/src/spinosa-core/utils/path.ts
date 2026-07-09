import { homedir } from "node:os"
import { existsSync } from "node:fs"

export function resolveUserPath(value: string): string | undefined {
  const resolved = value.startsWith("~") ? value.replace(/^~/, homedir()) : value
  return existsSync(resolved) ? resolved : undefined
}

export function normalizePathInput(value: string): string {
  let result = value.trim()
  if (result.length >= 2) {
    const first = result[0]
    const last = result[result.length - 1]
    if ((first === "'" && last === "'") || (first === '"' && last === '"')) {
      result = result.slice(1, -1)
    }
  }
  result = result.replace(/\\ /g, " ")
  return result
}

export function expandHome(path: string): string {
  if (path.startsWith("~")) {
    return path.replace(/^~/, homedir())
  }
  return path
}

export function isCloudStoragePath(path: string): boolean {
  return (
    path.includes("/Library/CloudStorage/") ||
    path.includes(".dropbox") ||
    path.includes("Dropbox") ||
    path.includes("OneDrive")
  )
}
