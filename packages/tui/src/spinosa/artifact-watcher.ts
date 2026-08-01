import { watch } from "node:fs"
import { readFile, stat } from "node:fs/promises"
import path from "node:path"
import { getOwner, onCleanup } from "solid-js"
import { createHash } from "node:crypto"

function createSerializedWatcher(
  snapshot: () => Promise<string | undefined>,
  onChange: () => void | Promise<void>,
  intervalMs: number,
  watchRoots?: () => string[],
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

  // Prefer FS events when available; keep a slower poll as fallback.
  const watchers: Array<{ close: () => void }> = []
  if (watchRoots) {
    for (const root of watchRoots()) {
      try {
        const watcher = watch(root, { recursive: false }, () => {
          void tick()
        })
        watchers.push(watcher)
      } catch {
        // Fall back to polling only for this root.
      }
    }
  }

  // Poll less aggressively when FS watch is active (events drive most updates).
  // Keep the caller's interval when it is already fast (tests / tight loops).
  const pollMs =
    watchers.length > 0 && intervalMs >= 1000
      ? Math.max(intervalMs * 4, 12_000)
      : intervalMs
  const timer = setInterval(() => void tick(), pollMs)
  void tick()

  const dispose = () => {
    clearInterval(timer)
    for (const w of watchers) {
      try {
        w.close()
      } catch {
        // ignore
      }
    }
  }
  if (getOwner()) onCleanup(dispose)
  return dispose
}

export function createWorkspaceFileWatcher(
  workspacePath: () => string | undefined,
  relativePaths: string[],
  onChange: () => void | Promise<void>,
  intervalMs = 3000,
) {
  return createSerializedWatcher(
    async () => {
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
          const digest = fileStat.isFile()
            ? createHash("sha256").update(await readFile(full)).digest("hex")
            : "directory"
          parts.push(`${relative}:${fileStat.mtimeMs}:${fileStat.size}:${digest}`)
        }
        return parts.join("|")
      } catch {
        return undefined
      }
    },
    onChange,
    intervalMs,
    () => {
      const root = workspacePath()
      if (!root) return []
      const dirs = new Set<string>([root])
      for (const relative of relativePaths) {
        dirs.add(path.dirname(path.join(root, relative)))
      }
      return [...dirs]
    },
  )
}
