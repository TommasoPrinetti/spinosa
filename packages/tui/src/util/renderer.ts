import type { CliRenderer } from "@opentui/core"

let restoreOnExitInstalled = false

export function installTerminalRestoreOnExit() {
  if (restoreOnExitInstalled) return
  restoreOnExitInstalled = true
  process.on("exit", () => {
    try { process.stdin.setRawMode(false) } catch {}
  })
}

export function destroyRenderer(renderer: Pick<CliRenderer, "isDestroyed" | "setTerminalTitle" | "destroy">) {
  renderer.setTerminalTitle("")
  installTerminalRestoreOnExit()
  if (renderer.isDestroyed) return
  renderer.destroy()
}
