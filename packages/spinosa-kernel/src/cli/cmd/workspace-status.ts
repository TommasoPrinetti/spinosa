import path from "node:path"
import type { Argv, CommandModule } from "yargs"
import {
  readWorkspaceMeta,
  isSpinosaWorkspace,
  getFrameworkHealth,
  readFrameworkVersionFromRoot,
  resolveFrameworkRoot,
  detectDocumentTools,
} from "@spinosa/core"
import { getFormat, log, emitResult, type OutputFormat } from "../output"

interface StatusArgs {
  workspace?: string
  json?: boolean
  quiet?: boolean
}

export const WorkspaceStatusCommand = {
  command: "status [workspace]",
  describe: "Show workspace and framework status",
  builder: (yargs: Argv) =>
    yargs.positional("workspace", { describe: "Workspace path (default: cwd)", type: "string" }),
  handler: async (args: StatusArgs) => {
    const fmt: OutputFormat = getFormat(args)
    const frameworkRoot = resolveFrameworkRoot()
    const frameworkVersion = readFrameworkVersionFromRoot(frameworkRoot)
    const tools = await detectDocumentTools()

    const resolvedWorkspace = args.workspace ? path.resolve(args.workspace) : process.cwd()
    const isWorkspace = isSpinosaWorkspace(resolvedWorkspace)
    let meta = undefined
    if (isWorkspace) meta = await readWorkspaceMeta(resolvedWorkspace)

    let allOk = Boolean(frameworkRoot)
    const checks: string[] = []
    if (!frameworkRoot) checks.push("Framework: not found")
    else checks.push("Framework: ok")

    for (const [name, available] of Object.entries(tools)) {
      if (!available) { allOk = false; checks.push(`${name}: missing`) }
      else checks.push(`${name}: ok`)
    }

    if (args.workspace && !isWorkspace) {
      allOk = false
      checks.push(`Workspace: invalid (${resolvedWorkspace})`)
    }

    if (meta) {
      checks.push(`Workspace: ${resolvedWorkspace}`)
      checks.push(`Status: ${meta.setupStatus}`)
      checks.push(`Version: ${meta.frameworkVersion ?? "unknown"}`)
      for (const check of getFrameworkHealth(resolvedWorkspace)) {
        if (!check.ok) allOk = false
        checks.push(`${check.ok ? "ok" : "missing"}: ${check.label}`)
      }
    }

    if (fmt === "human") {
      log(fmt, `Spinosa ${frameworkVersion || "dev"}`)
      for (const c of checks) log(fmt, `  ${c}`)
    }

    emitResult(fmt, "status", {
      healthy: allOk,
      frameworkVersion,
      frameworkRoot,
      workspace: meta ? {
        path: resolvedWorkspace,
        status: meta.setupStatus,
        version: meta.frameworkVersion,
      } : null,
      tools,
    }, allOk ? "healthy" : "issues found")

    if (!allOk) process.exitCode = 1
  },
} satisfies CommandModule<object, StatusArgs>
