import { existsSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { onCleanup } from "solid-js"

function snapshotAgentReports(workspacePath: string) {
  const dir = path.join(workspacePath, "agent_reports")
  if (!existsSync(dir)) return ""
  const parts: string[] = []
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    const stat = statSync(full)
    if (!stat.isFile()) continue
    parts.push(`${name}:${stat.mtimeMs}:${stat.size}`)
  }
  return parts.sort().join("|")
}

export function createAgentReportsWatcher(
  workspacePath: () => string | undefined,
  onChange: () => void,
  intervalMs = 2000,
) {
  let last = ""
  const timer = setInterval(() => {
    const pathValue = workspacePath()
    if (!pathValue) return
    const next = snapshotAgentReports(pathValue)
    if (next !== last) {
      last = next
      onChange()
    }
  }, intervalMs)

  onCleanup(() => clearInterval(timer))
}

export function createWorkspaceFileWatcher(
  workspacePath: () => string | undefined,
  relativePaths: string[],
  onChange: () => void,
  intervalMs = 3000,
) {
  let last = ""
  const timer = setInterval(() => {
    const root = workspacePath()
    if (!root) return
    const parts: string[] = []
    for (const relative of relativePaths) {
      const full = path.join(root, relative)
      if (!existsSync(full)) {
        parts.push(`${relative}:missing`)
        continue
      }
      const stat = statSync(full)
      parts.push(`${relative}:${stat.mtimeMs}:${stat.size}`)
    }
    const next = parts.join("|")
    if (next !== last) {
      last = next
      onChange()
    }
  }, intervalMs)

  onCleanup(() => clearInterval(timer))
}