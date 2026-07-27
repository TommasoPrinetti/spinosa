import type { SpinosaCliIo } from "../io"
import { emitResult } from "../io"
import { cleanupStaleInstallDirectories, inspectSpinosaMaintenance } from "@spinosa/core/system/maintenance"

/**
 * Removes only abandoned installer work directories. It intentionally never
 * removes completed release directories: registered workspaces may still be
 * linked to an older release and require its dependencies.
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

  if (input.dryRun) {
    for (const candidate of status.staleInstallDirectories) input.io.out(`Would remove ${candidate}`)
  } else {
    const result = await cleanupStaleInstallDirectories()
    for (const candidate of result.removedDirectories) input.io.out(`Removed stale installer data: ${candidate}`)
  }

  emitResult(
    input.io,
    "startup-autoclean",
    {
      dryRun: input.dryRun,
      removed: input.dryRun ? [] : status.staleInstallDirectories,
      candidates: status.staleInstallDirectories,
      nodeModulesDirectories: status.staleNodeModulesDirectories,
    },
    status.staleInstallDirectories.length === 0
      ? "Startup autoclean: nothing stale found"
      : input.dryRun
        ? `Startup autoclean: ${status.staleInstallDirectories.length} stale installer director${status.staleInstallDirectories.length === 1 ? "y" : "ies"} found`
        : `Startup autoclean: removed ${status.staleInstallDirectories.length} stale installer director${status.staleInstallDirectories.length === 1 ? "y" : "ies"}`,
  )
  return 0
}
