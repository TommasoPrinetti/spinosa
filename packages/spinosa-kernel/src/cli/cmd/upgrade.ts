import path from "node:path"
import { homedir } from "node:os"
import type { Argv } from "yargs"
import * as prompts from "@clack/prompts"
import { UI } from "../ui"
import { upgradeFramework, readEffectiveInstalledVersion } from "@spinosa/core/commands/upgrade"
import { offerWorkspaceUpgrades } from "@spinosa/core/commands/preflight"
import { updateWorkspace } from "@spinosa/core/commands/update"
import { isUpgrade } from "@spinosa/core/utils/version"
import { installUrlForChannel, type ReleaseChannel } from "@spinosa/core/system/channels"

const REINSTALL_URL = installUrlForChannel("beta")

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

    const currentVersion = readEffectiveInstalledVersion() || "unknown"
    prompts.log.info(`Current: v${currentVersion}`)

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
      if (result.refusedReason) {
        prompts.log.warn(result.refusedReason)
      } else if (isUpgrade(result.previousVersion, result.newVersion)) {
        prompts.log.info(`Would update to v${result.newVersion}`)
      } else {
        const displayVersion = result.newVersion ?? currentVersion
        prompts.log.info(`Already up to date (v${displayVersion})`)
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
      if (result.error) prompts.log.error(result.error)
      prompts.log.error(`Try reinstalling from ${REINSTALL_URL}`)
      prompts.outro("Upgrade failed.")
      return
    }

    const alreadyCurrent =
      !!result.previousVersion &&
      !!result.newVersion &&
      result.previousVersion === result.newVersion &&
      !args.reinstall

    if (alreadyCurrent) {
      prompts.log.success(`Already at v${result.newVersion}`)
      prompts.outro("No upgrade needed.")
      return
    }

    prompts.log.success(`Upgraded to v${result.newVersion}`)

    if (result.newVersion && result.workspaceUpgradesNeeded.length > 0) {
      await offerWorkspaceUpgrades(result.workspaceUpgradesNeeded, result.newVersion, {
        confirm: async (question, defaultYes = false) => {
          if (args.yes) return true
          const answer = await prompts.confirm({ message: question, initialValue: defaultYes })
          return answer === true
        },
        frameworkRoot: (version) =>
          path.join(process.env.SPINOSA_HOME ?? path.join(homedir(), ".spinosa"), "versions", version),
        updateWorkspace: (workspacePath, frameworkRoot) =>
          updateWorkspace({ workspacePath, frameworkRoot }),
        out: (message) => prompts.log.info(message),
      })
    }

    prompts.outro("Restart Spinosa to use the new version.")
  },
}
