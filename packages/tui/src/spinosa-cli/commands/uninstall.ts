import type { SpinosaCliIo } from "../io"
import { emitResult } from "../io"
import { confirmTerminal } from "../terminal"
import {
  spinosaHome,
  uninstallFrameworkRuntime,
} from "@spinosa/core/commands/uninstall"

export async function confirmUninstall(): Promise<boolean> {
  return confirmTerminal("Are you sure you want to uninstall?")
}

export async function runUninstall(
  io: SpinosaCliIo,
  yes: boolean,
  confirm: () => Promise<boolean> = confirmUninstall,
): Promise<number> {
  const home = spinosaHome()

  if (!yes) {
    if (io.format === "json" || io.format === "quiet") {
      io.error("Uninstall requires --yes in non-interactive mode")
      return 1
    }
    let confirmed: boolean
    try {
      confirmed = await confirm()
    } catch (error) {
      io.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
      return 1
    }
    if (!confirmed) {
      io.out("Canceled.")
      return 0
    }
  }

  const result = uninstallFrameworkRuntime(home)
  if (result.error) {
    io.error(`Error: ${result.error}: ${home || "<empty>"}`)
    return 1
  }

  emitResult(io, "uninstall", { home: result.home }, "Spinosa uninstalled. Workspace metadata kept at metadata/")
  return 0
}
