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
  describe: "Clean stale installer directories",
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

    if (args["dry-run"]) {
      for (const candidate of status.staleInstallDirectories) log(fmt, `Would remove ${candidate}`)
    } else {
      const result = await cleanupStaleInstallDirectories()
      for (const candidate of result.removedDirectories) log(fmt, `Removed stale installer data: ${candidate}`)
    }

    emitResult(
      fmt,
      "startup-autoclean",
      {
        dryRun: Boolean(args["dry-run"]),
        removed: args["dry-run"] ? [] : status.staleInstallDirectories,
        candidates: status.staleInstallDirectories,
        nodeModulesDirectories: status.staleNodeModulesDirectories,
      },
      status.staleInstallDirectories.length === 0
        ? "Startup autoclean: nothing stale found"
        : args["dry-run"]
          ? `Startup autoclean: ${status.staleInstallDirectories.length} stale installer director${status.staleInstallDirectories.length === 1 ? "y" : "ies"} found`
          : `Startup autoclean: removed ${status.staleInstallDirectories.length} stale installer director${status.staleInstallDirectories.length === 1 ? "y" : "ies"}`,
    )
  },
} satisfies CommandModule<object, StartupAutocleanArgs>
