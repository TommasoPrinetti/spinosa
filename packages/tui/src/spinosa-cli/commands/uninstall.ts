import { existsSync, rmSync } from "node:fs"
import { homedir } from "node:os"
import type { SpinosaCliIo } from "../io"
import { emitResult } from "../io"
import { confirmTerminal } from "../terminal"

function spinosaHome(): string {
  return process.env.SPINOSA_HOME ?? `${homedir()}/.spinosa`
}

function validateHome(home: string): string | undefined {
  if (!home || home === "/" || home === "." || home === ".." || home === homedir() || home === `${homedir()}/`) {
    return "refusing unsafe SPINOSA_HOME"
  }
  if (!home.startsWith("/")) {
    return "SPINOSA_HOME must be an absolute path"
  }
  if (!existsSync(`${home}/metadata`) && !existsSync(`${home}/versions`)) {
    return "does not look like a Spinosa installation"
  }
  return
}

export async function confirmUninstall(): Promise<boolean> {
  return confirmTerminal("Are you sure you want to uninstall?")
}

export async function runUninstall(
  io: SpinosaCliIo,
  yes: boolean,
  confirm: () => Promise<boolean> = confirmUninstall,
): Promise<number> {
  const home = spinosaHome()
  const validationError = validateHome(home)
  if (validationError) {
    io.error(`Error: ${validationError}: ${home || "<empty>"}`)
    return 1
  }

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

  const targets = ["versions", "bin", "lib", "logs", "env.sh"]
  for (const target of targets) {
    const fullPath = `${home}/${target}`
    if (existsSync(fullPath)) {
      rmSync(fullPath, { recursive: true, force: true })
    }
  }

  emitResult(io, "uninstall", { home }, "Spinosa uninstalled. Workspace metadata kept at metadata/")
  return 0
}
