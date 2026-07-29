import type { Argv } from "yargs"
import * as prompts from "@clack/prompts"
import { UI } from "../ui"
import { Installation } from "@/installation"
import { InstallationVersion } from "@spinosa/kernel-core/installation/version"

export const UpgradeCommand = {
  command: "upgrade [target]",
  describe: "check for and install Spinosa updates",
  builder: (yargs: Argv) =>
    yargs.positional("target", {
      describe: "target version",
      type: "string",
    }),
  handler: async (args: { target?: string }) => {
    UI.empty()
    UI.println(UI.logo(" "))
    UI.empty()
    prompts.intro("Spinosa updates")

    const method = await Installation.method()
    let latest: string
    if (args.target) {
      latest = args.target
    } else {
      prompts.log.step("Checking for updates...")
      latest = await Installation.latest(method)
    }

    if (!latest || latest === InstallationVersion) {
      prompts.log.info(`Already up to date (v${InstallationVersion})`)
      prompts.outro("No update needed.")
      return
    }

    prompts.log.info(`Current: v${InstallationVersion} → Latest: v${latest}`)
    const shouldUpgrade = await prompts.confirm({
      message: "Upgrade now?",
    })
    if (!shouldUpgrade) {
      prompts.outro("Upgrade skipped.")
      return
    }

    prompts.log.step("Upgrading...")
    try {
      await Installation.upgrade(method, latest)
      prompts.log.success(`Upgraded to v${latest}`)
      prompts.outro("Restart Spinosa to use the new version.")
    } catch {
      prompts.log.error("Upgrade failed. Try reinstalling from https://spinosa.ai")
      prompts.outro("Upgrade failed.")
    }
  },
}
