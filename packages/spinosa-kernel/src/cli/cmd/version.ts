import { InstallationVersion } from "@spinosa/kernel-core/installation/version"
import { getFormatFromRecord, emitResult } from "../output"

export const VersionCommand = {
  command: "version",
  describe: "Show the installed Spinosa version",
  builder: (yargs: any) => yargs,
  handler: async (args: Record<string, unknown>) => {
    const fmt = getFormatFromRecord(args)
    emitResult(fmt, "version", { version: InstallationVersion }, `spinosa ${InstallationVersion}`)
  },
}
