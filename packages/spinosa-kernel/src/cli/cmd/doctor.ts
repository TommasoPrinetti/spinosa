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
import { getFormat, log, emitResult, errorOut, type OutputFormat } from "../output"

interface DoctorArgs {
  workspace?: string
  json?: boolean
  quiet?: boolean
}

export const DoctorCommand = {
  command: "doctor",
  describe: "Diagnose Spinosa framework and workspace health",
  builder: (yargs: Argv) =>
    yargs.option("workspace", { describe: "Workspace path to check", type: "string" }),
  handler: async (args: DoctorArgs) => {
    const fmt: OutputFormat = getFormat(args)
    const frameworkRoot = resolveFrameworkRoot()
    let healthy = Boolean(frameworkRoot)
    log(fmt, `Framework: ${frameworkRoot ?? "not found"}`)
    log(fmt, `Version: ${readFrameworkVersionFromRoot(frameworkRoot)}`)
    const tools = await detectDocumentTools()
    for (const [name, available] of Object.entries(tools)) {
      log(fmt, `${name}: ${available ? "ok" : "missing"}`)
      if (!available) healthy = false
    }

    const requestedWorkspace = args.workspace
    const workspacePath = requestedWorkspace ? path.resolve(requestedWorkspace) : process.cwd()
    if (requestedWorkspace || isSpinosaWorkspace(workspacePath)) {
      const meta = await readWorkspaceMeta(workspacePath)
      if (!meta) {
        errorOut(fmt, `Workspace: invalid (${workspacePath})`)
        healthy = false
      } else {
        log(fmt, `Workspace: ${workspacePath}`)
        log(fmt, `Workspace version: ${meta.frameworkVersion}`)
        for (const check of getFrameworkHealth(workspacePath)) {
          if (!check.ok) healthy = false
          log(fmt, `${check.ok ? "ok" : "missing"}: ${check.label}`)
        }
      }
    }

    emitResult(fmt, "doctor", { healthy, frameworkRoot, version: readFrameworkVersionFromRoot(frameworkRoot) }, healthy ? "healthy" : "issues found")
    if (!healthy) process.exitCode = 1
  },
} satisfies CommandModule<object, DoctorArgs>
