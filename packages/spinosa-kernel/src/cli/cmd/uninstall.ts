import type { Argv } from "yargs"
import { UI } from "../ui"
import * as prompts from "@clack/prompts"
import { Global } from "@spinosa/kernel-core/global"
import fs from "fs/promises"

interface UninstallArgs {
  keepConfig: boolean
  keepData: boolean
  dryRun: boolean
  force: boolean
}

export const UninstallCommand = {
  command: "uninstall",
  describe: "remove this local Spinosa installation and its selected data",
  builder: (yargs: Argv) =>
    yargs
      .option("keep-config", { alias: "c", type: "boolean", describe: "keep configuration files", default: false })
      .option("keep-data", { alias: "d", type: "boolean", describe: "keep session data and snapshots", default: false })
      .option("dry-run", { type: "boolean", describe: "show what would be removed", default: false })
      .option("force", { alias: "f", type: "boolean", describe: "skip confirmation prompts", default: false }),
  handler: async (args: UninstallArgs) => {
    UI.empty()
    UI.println(UI.logo(" "))
    UI.empty()
    prompts.intro("Uninstall Spinosa")
    const targets = [
      { path: Global.Path.data, label: "Data", keep: args.keepData },
      { path: Global.Path.cache, label: "Cache", keep: false },
      { path: Global.Path.config, label: "Configuration", keep: args.keepConfig },
      { path: Global.Path.state, label: "State", keep: args.keepData },
      { path: Global.Path.tmp, label: "Temporary files", keep: false },
    ]
    const present = await Promise.all(
      targets.map(async (target) => ({ ...target, exists: await fs.access(target.path).then(() => true).catch(() => false) })),
    )
    for (const target of present) {
      if (target.exists) prompts.log.info(`${target.keep ? "○ keeping" : "✓ removing"} ${target.label}: ${target.path}`)
    }
    if (!args.force && !args.dryRun) {
      const confirmed = await prompts.confirm({ message: "Remove the selected Spinosa files?" })
      if (prompts.isCancel(confirmed) || !confirmed) {
        prompts.outro("Cancelled")
        return
      }
    }
    if (args.dryRun) {
      prompts.outro("Dry run complete; no files were removed.")
      return
    }
    for (const target of present) {
      if (!target.exists || target.keep) continue
      await fs.rm(target.path, { recursive: true, force: true })
    }
    prompts.outro("Spinosa application files removed. The installer still controls the launcher and framework runtime.")
  },
}
