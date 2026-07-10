import { readFile, stat } from "node:fs/promises"
import path from "node:path"
import { getOwner, onCleanup } from "solid-js"
import { createHash } from "node:crypto"

function createSerializedWatcher(
  snapshot: () => Promise<string | undefined>,
  onChange: () => void | Promise<void>,
  intervalMs: number,
) {
  let last: string | undefined
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      const next = await snapshot()
      if (next === undefined || next === last) return
      await onChange()
      last = next
    } catch {
      // Keep the previous snapshot so the next tick retries the refresh.
    } finally {
      running = false
    }
  }
  const timer = setInterval(() => void tick(), intervalMs)
  const dispose = () => clearInterval(timer)
  if (getOwner()) onCleanup(dispose)
  return dispose
}

export function createWorkspaceFileWatcher(
  workspacePath: () => string | undefined,
  relativePaths: string[],
  onChange: () => void | Promise<void>,
  intervalMs = 3000,
) {
  return createSerializedWatcher(async () => {
    const root = workspacePath()
    if (!root) return ""
    try {
      const parts: string[] = []
      for (const relative of relativePaths) {
        const full = path.join(root, relative)
        let fileStat: Awaited<ReturnType<typeof stat>>
        try {
          fileStat = await stat(full)
        } catch (error) {
          if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
            parts.push(`${relative}:missing`)
            continue
          }
          throw error
        }
        const digest = fileStat.isFile() ? createHash("sha256").update(await readFile(full)).digest("hex") : "directory"
        parts.push(`${relative}:${fileStat.mtimeMs}:${fileStat.size}:${digest}`)
      }
      return parts.join("|")
    } catch {
      return undefined
    }
  }, onChange, intervalMs)
}
