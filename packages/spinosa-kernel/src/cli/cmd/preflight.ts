import type { Argv } from "yargs"
import {
  PREFLIGHT_RESTART_EXIT_CODE,
  runLaunchPreflight,
} from "@spinosa/core/commands/preflight"

export const PreflightCommand = {
  command: "preflight",
  describe: "check for upgrades before launching the TUI",
  builder: (yargs: Argv) => yargs,
  handler: async () => {
    const result = await runLaunchPreflight()
    process.exit(result === "restart" ? PREFLIGHT_RESTART_EXIT_CODE : 0)
  },
}
