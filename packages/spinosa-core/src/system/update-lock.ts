import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"

export const UPDATE_LOCK_STALE_MS = 30_000
const UPDATE_LOCK_POLL_MS = 100

export interface WorkspaceUpdateLock {
  /** Removes the lock only when this process still owns it. No-op otherwise. */
  release(): void
}

function isEexist(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "EEXIST"
  )
}

function pidIsAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function isOwnedLock(lockPath: string, ourPid: number): boolean {
  try {
    const pidText = readFileSync(path.join(lockPath, "pid"), "utf-8").trim()
    return Number(pidText) === ourPid
  } catch {
    return false
  }
}

function sleepMs(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/**
 * Serializes framework updates within a workspace.
 *
 * Ownership is provable: on acquisition the pid file is stamped with our pid,
 * and release only removes the lock while that pid still matches. A lock whose
 * owner process is dead or missing is reaped once it is older than
 * UPDATE_LOCK_STALE_MS, so a crashed updater never wedges the workspace.
 */
export function acquireWorkspaceUpdateLock(
  workspacePath: string,
  options: { timeoutMs?: number } = {},
): WorkspaceUpdateLock {
  const lockPath = path.join(workspacePath, ".spinosa", "update.lock")
  const ourPid = process.pid
  const deadline = Date.now() + (options.timeoutMs ?? 10_000)

  while (true) {
    try {
      mkdirSync(lockPath)
      writeFileSync(path.join(lockPath, "pid"), String(ourPid), "utf-8")
      return {
        release: () => {
          if (isOwnedLock(lockPath, ourPid)) {
            rmSync(lockPath, { recursive: true, force: true })
          }
        },
      }
    } catch (error) {
      if (!isEexist(error)) throw error
      try {
        const lockStat = statSync(lockPath)
        let ownerAlive = false
        try {
          const pidText = readFileSync(path.join(lockPath, "pid"), "utf-8").trim()
          ownerAlive = pidIsAlive(Number(pidText))
        } catch {
          ownerAlive = false
        }
        if (!ownerAlive && Date.now() - lockStat.mtimeMs > UPDATE_LOCK_STALE_MS) {
          rmSync(lockPath, { recursive: true, force: true })
          continue
        }
      } catch {
        // Lock disappeared between the check and the reap — retry the acquire.
        continue
      }
      if (Date.now() >= deadline) {
        throw new Error("Another update is already in progress for this workspace")
      }
      sleepMs(UPDATE_LOCK_POLL_MS)
    }
  }
}