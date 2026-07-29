import path from "node:path"
import { homedir } from "node:os"
import { bootLog } from "@spinosa/kernel-core/observability/boot-log"
import { confirmTerminal } from "../terminal"
import {
  checkUpgradeAvailable,
  discoverRegisteredWorkspaces,
  updateWorkspace,
  upgradeFramework,
  type AutoUpgradeResult,
  type UpdateResult,
  type UpgradeResult,
} from "@spinosa/core"

export const PREFLIGHT_RESTART_EXIT_CODE = 10

export interface PreflightDependencies {
  checkUpgradeAvailable(): Promise<AutoUpgradeResult>
  upgradeFramework(): Promise<UpgradeResult>
  discoverRegisteredWorkspaces(): Promise<string[]>
  updateWorkspace(workspacePath: string, frameworkRoot: string): Promise<UpdateResult>
  confirm(question: string, defaultYes?: boolean): Promise<boolean>
  frameworkRoot(version: string): string
  out(message: string): void
}

const defaults: PreflightDependencies = {
  checkUpgradeAvailable,
  upgradeFramework: () => upgradeFramework({ yes: true }),
  discoverRegisteredWorkspaces,
  updateWorkspace: (workspacePath, frameworkRoot) => updateWorkspace({ workspacePath, frameworkRoot }),
  confirm: (question, defaultYes) => confirmTerminal(`✨ ${question}`, defaultYes),
  frameworkRoot: (version) => path.join(process.env.SPINOSA_HOME ?? path.join(homedir(), ".spinosa"), "versions", version),
  out: (message) => process.stdout.write(`${message}\n`),
}

export async function runLaunchPreflight(deps: PreflightDependencies = defaults): Promise<"continue" | "restart"> {
  bootLog("preflight.start", "preflight check started", { pid: process.pid })
  const available = await deps.checkUpgradeAvailable()
  bootLog("preflight.upgrade-check", "upgrade check result", { available: available.available, latest: available.latestVersion ?? undefined })
  if (!available.available || !available.latestVersion) {
    bootLog("preflight.done", "no upgrade needed, continuing")
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

  let workspaces: string[] = []
  try {
    workspaces = await deps.discoverRegisteredWorkspaces()
  } catch (error) {
    deps.out(`⚠ Could not read the workspace index: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (workspaces.length > 0 && await deps.confirm(`Upgrade all ${workspaces.length} registered workspace(s) now?`)) {
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

  deps.out("✨ Run 'spinosa' again to open the updated TUI.")
  return "restart"
}
