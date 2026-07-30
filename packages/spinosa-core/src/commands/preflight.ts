/**
 * Launch preflight for the Spinosa TUI.
 *
 * This module runs before the TUI starts. It checks for framework updates,
 * prints user-facing status lines, and can install an upgrade.
 *
 * Exit code 10 means "restart the launcher". The bash shim and spinosa-cli
 * re-exec when they see this code.
 */
import path from "node:path"
import { homedir } from "node:os"
import { confirmPrompt } from "../utils/confirm"
import { spinosaLogInfo } from "../utils/log"
import { updateWorkspace, type UpdateResult } from "./update"
import {
  checkUpgradeAvailable,
  upgradeFramework,
  type AutoUpgradeResult,
  type UpgradeResult,
} from "./upgrade"

/** Kernel exits with this code when launch preflight installed an upgrade. */
export const PREFLIGHT_RESTART_EXIT_CODE = 10

/** User-facing line printed before the remote version check. */
export const LAUNCH_STATUS_CHECKING = "checking for updates..."

/** User-facing line printed when the installed version is current. */
export const LAUNCH_STATUS_NO_UPDATES = "no updates available"

/** User-facing line printed immediately before the TUI starts. */
export const LAUNCH_STATUS_LAUNCHING = "launching TUI..."

/** User-facing line printed when launch preflight requests a restart. */
export const LAUNCH_STATUS_RESTARTING = "restarting with updated Spinosa..."

/** Skip the upgrade check after a launch-time upgrade re-exec. */
export function shouldSkipLaunchPreflight(): boolean {
  return process.env.SPINOSA_UPGRADE_REEXEC === "1"
}

export interface PreflightDependencies {
  checkUpgradeAvailable(): Promise<AutoUpgradeResult>
  upgradeFramework(): Promise<UpgradeResult>
  updateWorkspace(workspacePath: string, frameworkRoot: string): Promise<UpdateResult>
  confirm(question: string, defaultYes?: boolean): Promise<boolean>
  frameworkRoot(version: string): string
  out(message: string): void
}

const defaults: PreflightDependencies = {
  checkUpgradeAvailable,
  upgradeFramework: () => upgradeFramework({ yes: true }),
  updateWorkspace: (workspacePath, frameworkRoot) => updateWorkspace({ workspacePath, frameworkRoot }),
  confirm: (question, defaultYes) => confirmPrompt(question, defaultYes),
  frameworkRoot: (version) => path.join(process.env.SPINOSA_HOME ?? path.join(homedir(), ".spinosa"), "versions", version),
  out: (message) => process.stdout.write(`${message}\n`),
}

/** Print the final launch line before the TUI worker starts. */
export function printLaunchingTui(out: (message: string) => void = defaults.out): void {
  out(LAUNCH_STATUS_LAUNCHING)
}

/**
 * Check for updates before the TUI opens.
 * Returns "restart" when an upgrade was installed and the launcher must re-exec.
 */
export async function runLaunchPreflight(deps: PreflightDependencies = defaults): Promise<"continue" | "restart"> {
  spinosaLogInfo("preflight", `preflight check started (pid=${process.pid})`)
  deps.out(LAUNCH_STATUS_CHECKING)

  const available = await deps.checkUpgradeAvailable()
  spinosaLogInfo("preflight", `upgrade check: available=${available.available} latest=${available.latestVersion ?? "none"}`)

  if (!available.available || !available.latestVersion) {
    deps.out(LAUNCH_STATUS_NO_UPDATES)
    spinosaLogInfo("preflight", "no upgrade needed, continuing")
    return "continue"
  }

  const current = available.currentVersion ? ` (current \x1b[32mv${available.currentVersion}\x1b[0m)` : ""
  if (!(await deps.confirm(`✨ \x1b[1mSpinosa v${available.latestVersion}\x1b[0m is available${current}. Upgrade now?`, true))) {
    return "continue"
  }

  const upgraded = await deps.upgradeFramework()
  if (!upgraded.success || !upgraded.newVersion) {
    throw new Error("Spinosa upgrade failed. Run 'spinosa upgrade' for details.")
  }

  const workspaces = upgraded.workspaceUpgradesNeeded
  if (workspaces.length > 0 && await deps.confirm(`Upgrade ${workspaces.length} outdated workspace(s) now?`)) {
    const frameworkRoot = deps.frameworkRoot(upgraded.newVersion)
    let failed = 0
    for (const workspace of workspaces) {
      try {
        const result = await deps.updateWorkspace(workspace, frameworkRoot)
        if (result.success && result.presence) {
          deps.out(`↷ Skipped ${path.basename(workspace) || workspace}: ${result.presence.replaceAll("_", " ").toUpperCase()}`)
        } else if (result.success) deps.out(`✓ Updated ${path.basename(workspace) || workspace}`)
        else {
          failed++
          deps.out(`⚠ Could not update ${path.basename(workspace) || workspace}`)
        }
      } catch (error) {
        failed++
        deps.out(`⚠ Could not update ${path.basename(workspace) || workspace}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    if (failed > 0) deps.out(`⚠ ${failed} workspace update(s) failed; run 'spinosa update <workspace>' to retry.`)
  }

  deps.out(LAUNCH_STATUS_RESTARTING)
  return "restart"
}
