import path from "node:path"
import { existsSync, statSync } from "node:fs"
import type { Argv, CommandModule } from "yargs"
import { createWorkspace } from "@spinosa/core/commands/create"
import { runOnboarding } from "@spinosa/core/commands/onboard"
import { resolveFrameworkRoot } from "@spinosa/core/framework/discovery"
import { writeWorkspaceStatus } from "@spinosa/core/workspace/meta"
import { getFormat, log, emitResult, type OutputFormat } from "../output"

interface NewArgs {
  source: string | undefined
  name?: string
  extensions?: string
  cli?: string
  launch?: string
  json?: boolean
  quiet?: boolean
}

export const WorkspaceNewCommand = {
  command: "new <source>",
  aliases: ["create"],
  describe: "Create a new Spinosa workspace from a source directory",
  builder: (yargs: Argv) =>
    yargs
      .positional("source", { describe: "Path to source documents directory", type: "string" })
      .option("name", { describe: "Workspace name", type: "string" })
      .option("extensions", { describe: "File extensions to import (comma-separated)", type: "string" })
      .option("cli", { describe: "CLI tool to use", type: "string" })
      .option("launch", { describe: "Launch mode (copy|run)", type: "string", choices: ["copy", "run"] }),
  handler: async (args: NewArgs) => {
    const fmt: OutputFormat = getFormat(args)
    if (!args.source) throw new Error("Source directory required. Use: spinosa new /path/to/documents")
    const sourcePath = path.resolve(args.source)
    if (!existsSync(sourcePath) || !statSync(sourcePath).isDirectory()) {
      throw new Error(`Source directory does not exist: ${sourcePath}`)
    }

    const frameworkRoot = resolveFrameworkRoot()
    if (!frameworkRoot) throw new Error("Spinosa framework root not found. Reinstall Spinosa or set SPINOSA_TEMPLATE_ROOT.")

    const created = await createWorkspace({
      corpusPath: sourcePath,
      frameworkRoot,
      workspaceName: args.name,
      onProgress: (message: string) => log(fmt, message),
    })
    if (!created.success) throw new Error("Workspace template copy failed")
    await writeWorkspaceStatus(created.workspacePath, "importing")

    const onboarding = await runOnboarding({
      workspacePath: created.workspacePath,
      frameworkRoot,
      sourcePath,
      projectTitle: created.projectName,
      flagExtensions: args.extensions,
      flagCli: args.cli,
      flagLaunch: args.launch as "copy" | "run" | undefined,
      onPhase: (_phase: string, message: string) => log(fmt, message),
    })
    if (!onboarding.success) {
      throw new Error(onboarding.blockerReason ?? `Onboarding failed during ${onboarding.blockedPhase ?? "unknown phase"}`)
    }

    emitResult(fmt, "create", { workspacePath: created.workspacePath, project: created.projectName }, `Workspace ready: ${created.workspacePath}`)
  },
} satisfies CommandModule<object, NewArgs>
