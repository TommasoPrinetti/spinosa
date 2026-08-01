import type { ChildProcess } from "node:child_process"

/** Best-effort kill of a child (and its process group when detached). */
export function killChildProcess(child: ChildProcess, signal: NodeJS.Signals = "SIGTERM"): void {
  if (!child.pid || child.killed) return
  if (process.platform !== "win32") {
    try {
      process.kill(-child.pid, signal)
      return
    } catch {
      // Fall through to direct kill (child may not be a group leader).
    }
  }
  try {
    child.kill(signal)
  } catch {
    // Already gone.
  }
}

/**
 * SIGTERM the child (process group when possible), then SIGKILL after graceMs
 * if it has not exited. Resolves when the process closes or after SIGKILL is sent.
 */
export async function terminateChild(child: ChildProcess, graceMs = 1500): Promise<void> {
  if (!child.pid) return
  if (child.exitCode !== null || child.signalCode) return

  killChildProcess(child, "SIGTERM")

  const closed = new Promise<void>((resolve) => {
    if (child.exitCode !== null || child.signalCode) {
      resolve()
      return
    }
    child.once("close", () => resolve())
  })

  await Promise.race([
    closed,
    new Promise<void>((resolve) => setTimeout(resolve, graceMs)),
  ])

  if (child.exitCode === null && !child.signalCode) {
    killChildProcess(child, "SIGKILL")
    await Promise.race([
      closed,
      new Promise<void>((resolve) => setTimeout(resolve, 500)),
    ])
  }
}
