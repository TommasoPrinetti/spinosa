import type { Argv } from "yargs"
import {
  PREFLIGHT_RESTART_EXIT_CODE,
  runLaunchPreflight,
} from "@spinosa/core/commands/preflight"

/** Manual preflight entry point. Normal launches run preflight inside cmd/tui.ts. */
export const PreflightCommand = {
  command: "preflight",
  describe: "check for upgrades before launching the TUI",
  builder: (yargs: Argv) => yargs,
  handler: async () => {
    const result = await runLaunchPreflight()
    process.exit(result === "restart" ? PREFLIGHT_RESTART_EXIT_CODE : 0)
  },
}
