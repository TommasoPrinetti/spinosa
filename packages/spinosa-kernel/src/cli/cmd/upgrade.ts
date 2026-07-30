import type { Argv } from "yargs"
import * as prompts from "@clack/prompts"
import { UI } from "../ui"
import { upgradeFramework } from "@spinosa/core/commands/upgrade"
import type { ReleaseChannel } from "@spinosa/core/system/channels"
import { InstallationVersion } from "@spinosa/kernel-core/installation/version"

export const UpgradeCommand = {
  command: "upgrade [target]",
  describe: "check for and install Spinosa updates",
  builder: (yargs: Argv) =>
    yargs
      .positional("target", {
        describe: "target version",
        type: "string",
      })
      .option("channel", {
        describe: "release channel (stable or beta)",
        type: "string",
        choices: ["stable", "beta"] as const,
      })
      .option("yes", {
        describe: "skip confirmation prompts",
        type: "boolean",
      })
      .option("reinstall", {
        describe: "reinstall the target version even if it matches the installed version",
        type: "boolean",
      })
      .option("allow-downgrade", {
        describe: "permit downgrading to an older version",
        type: "boolean",
      })
      .option("check", {
        describe: "check for updates without installing",
        type: "boolean",
      }),
  handler: async (args: {
    target?: string
    channel?: "stable" | "beta"
    yes?: boolean
    reinstall?: boolean
    allowDowngrade?: boolean
    check?: boolean
  }) => {
    UI.empty()
    UI.println(UI.logo(" "))
    UI.empty()
    prompts.intro("Spinosa updates")

    prompts.log.info(`Current: v${InstallationVersion}`)

    if (args.check) {
      prompts.log.step("Checking for updates...")
    }

    const result = await upgradeFramework({
      version: args.target,
      channel: args.channel as ReleaseChannel | undefined,
      yes: args.yes,
      reinstall: args.reinstall,
      allowDowngrade: args.allowDowngrade,
      check: args.check,
      onPhase: (_phase, detail) => prompts.log.step(detail),
    })

    if (args.check) {
      if (result.newVersion && result.newVersion !== InstallationVersion) {
        prompts.log.info(`Would update to v${result.newVersion}`)
      } else {
        prompts.log.info(`Already up to date (v${InstallationVersion})`)
      }
      prompts.outro("Check complete.")
      return
    }

    if (result.refusedReason) {
      prompts.log.warn(result.refusedReason)
      prompts.outro("Upgrade refused.")
      return
    }

    if (!result.success) {
      prompts.log.error("Upgrade failed.")
      prompts.log.error("Try reinstalling from https://spinosa.ai")
      prompts.outro("Upgrade failed.")
      return
    }

    prompts.log.success(`Upgraded to v${result.newVersion}`)
    prompts.outro("Restart Spinosa to use the new version.")
  },
}
