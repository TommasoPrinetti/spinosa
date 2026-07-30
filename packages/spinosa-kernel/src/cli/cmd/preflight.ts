import type { Argv } from "yargs"
import { runLaunchPreflight } from "@spinosa/core/commands/preflight"

/** Manual preflight entry point. Normal launches run preflight inside cmd/tui.ts. */
export const PreflightCommand = {
  command: "preflight",
  describe: "check for upgrades before launching the TUI",
  builder: (yargs: Argv) => yargs,
  handler: async () => {
    await runLaunchPreflight()
    process.exit(0)
  },
}
