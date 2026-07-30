/**
 * Launch preflight for the Spinosa TUI.
 *
 * This module runs before the TUI starts. It checks for framework updates,
 * prints user-facing status lines, and can install an upgrade.
 *
 * Returns "exit" after a successful launch-time upgrade so the launcher can
 * stop without auto-starting the TUI.
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

/** User-facing line printed before the remote version check. */
export const LAUNCH_STATUS_CHECKING = "checking for updates..."

/** User-facing line printed when the installed version is current. */
export const LAUNCH_STATUS_NO_UPDATES = "no updates available"

/** User-facing line printed immediately before the TUI starts. */
export const LAUNCH_STATUS_LAUNCHING = "launching TUI..."

/** User-facing line printed after a successful launch-time upgrade. */
export const LAUNCH_STATUS_UPGRADE_DONE = "upgrade complete — run spinosa again to launch"

export interface WorkspaceUpgradeOfferDeps {
  confirm(question: string, defaultYes?: boolean): Promise<boolean>
  frameworkRoot(version: string): string
  updateWorkspace(workspacePath: string, frameworkRoot: string): Promise<UpdateResult>
  out(message: string): void
}

export interface PreflightDependencies extends WorkspaceUpgradeOfferDeps {
  checkUpgradeAvailable(): Promise<AutoUpgradeResult>
  upgradeFramework(): Promise<UpgradeResult>
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
 * After a successful CLI/framework upgrade, optionally update registered
 * workspaces still pinned to an older framework version.
 * Shared by launch preflight and `spinosa upgrade`.
 */
export async function offerWorkspaceUpgrades(
  workspaces: string[],
  frameworkVersion: string,
  deps: WorkspaceUpgradeOfferDeps,
): Promise<void> {
  if (workspaces.length === 0) return
  if (!(await deps.confirm(`Upgrade ${workspaces.length} outdated workspace(s) now?`))) return

  const frameworkRoot = deps.frameworkRoot(frameworkVersion)
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

/**
 * Check for updates before the TUI opens.
 * Returns "exit" when an upgrade was installed and the launcher should stop.
 */
export async function runLaunchPreflight(deps: PreflightDependencies = defaults): Promise<"continue" | "exit"> {
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
    const detail = upgraded.error ? `: ${upgraded.error}` : ""
    throw new Error(`Spinosa upgrade failed${detail}. Run 'spinosa upgrade' for details.`)
  }

  await offerWorkspaceUpgrades(upgraded.workspaceUpgradesNeeded, upgraded.newVersion, deps)

  deps.out(LAUNCH_STATUS_UPGRADE_DONE)
  return "exit"
}
