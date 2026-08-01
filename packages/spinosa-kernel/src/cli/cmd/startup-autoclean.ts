import type { Argv, CommandModule } from "yargs"
import { cleanupStaleInstallDirectories, inspectSpinosaMaintenance } from "@spinosa/core/system/maintenance"
import { getFormat, log, emitResult, errorOut, type OutputFormat } from "../output"

interface StartupAutocleanArgs {
  "dry-run"?: boolean
  json?: boolean
  quiet?: boolean
}

export const StartupAutocleanCommand = {
  command: "startup-autoclean",
  aliases: ["autoclean"],
  describe: "Clean stale installer directories and Spinosa temp leftovers",
  builder: (yargs: Argv) =>
    yargs.option("dry-run", { describe: "Show what would be removed", type: "boolean", default: false }),
  handler: async (args: StartupAutocleanArgs) => {
    const fmt: OutputFormat = getFormat(args)
    const status = await inspectSpinosaMaintenance()
    if (status.installInProgress) {
      errorOut(fmt, "Startup autoclean skipped: a Spinosa install is in progress.")
      process.exitCode = 1
      return
    }

    const candidates = [...status.staleInstallDirectories, ...status.staleTempDirectories]
    if (args["dry-run"]) {
      for (const candidate of candidates) log(fmt, `Would remove ${candidate}`)
      emitResult(
        fmt,
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
      return
    }

    const result = await cleanupStaleInstallDirectories()
    for (const removed of result.removedDirectories) {
      log(fmt, `Removed stale installer/temp data: ${removed}`)
    }

    emitResult(
      fmt,
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
  },
} satisfies CommandModule<object, StartupAutocleanArgs>
