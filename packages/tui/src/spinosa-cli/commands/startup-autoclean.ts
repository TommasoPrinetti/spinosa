import type { SpinosaCliIo } from "../io"
import { emitResult } from "../io"
import { cleanupStaleInstallDirectories, inspectSpinosaMaintenance } from "@spinosa/core/system/maintenance"

/**
 * Removes abandoned installer work directories and known Spinosa OS temp leftovers.
 * Never removes completed release directories under versions/ (workspaces may still
 * link to older releases).
 */
export async function runStartupAutoclean(input: {
  io: SpinosaCliIo
  dryRun: boolean
}): Promise<number> {
  const status = await inspectSpinosaMaintenance()
  if (status.installInProgress) {
    input.io.error("Startup autoclean skipped: a Spinosa install is in progress.")
    return 1
  }

  const candidates = [...status.staleInstallDirectories, ...status.staleTempDirectories]
  if (input.dryRun) {
    for (const candidate of candidates) input.io.out(`Would remove ${candidate}`)
    emitResult(
      input.io,
      "startup-autoclean",
      {
        dryRun: true,
        removed: [],
        candidates,
        nodeModulesDirectories: status.staleNodeModulesDirectories,
        dormantVersions: status.dormantVersionDirectories.length,
      },
      candidates.length === 0
        ? "Startup autoclean: nothing stale found"
        : `Startup autoclean: ${candidates.length} stale path${candidates.length === 1 ? "" : "s"} found`,
    )
    return 0
  }

  const result = await cleanupStaleInstallDirectories()
  for (const removed of result.removedDirectories) {
    input.io.out(`Removed stale installer/temp data: ${removed}`)
  }

  emitResult(
    input.io,
    "startup-autoclean",
    {
      dryRun: false,
      removed: result.removedDirectories,
      candidates,
      nodeModulesDirectories: status.staleNodeModulesDirectories,
      dormantVersions: status.dormantVersionDirectories.length,
    },
    result.removedDirectories.length === 0
      ? "Startup autoclean: nothing stale found"
      : `Startup autoclean: removed ${result.removedDirectories.length} stale path${result.removedDirectories.length === 1 ? "" : "s"}`,
  )
  return 0
}
