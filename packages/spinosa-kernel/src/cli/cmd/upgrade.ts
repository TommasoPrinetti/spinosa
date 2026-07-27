import type { Argv } from "yargs"
import * as prompts from "@clack/prompts"
import { UI } from "../ui"
import { selfManagedMessage } from "../../installation"

export const UpgradeCommand = {
  command: "upgrade [target]",
  describe: "show how this local Spinosa build is updated",
  builder: (yargs: Argv) =>
    yargs.positional("target", {
      describe: "requested version (handled by your Spinosa distribution)",
      type: "string",
    }),
  handler: async (args: { target?: string }) => {
    UI.empty()
    UI.println(UI.logo(" "))
    UI.empty()
    prompts.intro("Spinosa updates")
    prompts.log.info(selfManagedMessage)
    if (args.target) prompts.log.info(`Requested version: ${args.target}`)
    prompts.outro("No upstream package manager was contacted.")
  },
}
