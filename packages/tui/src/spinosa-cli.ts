#!/usr/bin/env bun
import { existsSync, statSync } from "node:fs"
import path from "node:path"
import {
  addFiles,
  createWorkspace,
  detectDocumentTools,
  getFrameworkHealth,
  isSpinosaWorkspace,
  readFrameworkVersionFromRoot,
  readWorkspaceMeta,
  resolveFrameworkRoot,
  runOnboarding,
  updateWorkspace,
  upgradeFramework,
  writeWorkspaceStatus,
  type ReleaseChannel,
} from "./spinosa-core"

export interface SpinosaCliIo {
  out(message: string): void
  error(message: string): void
}

export interface ParsedArgs {
  positionals: string[]
  values: Map<string, string>
  flags: Set<string>
}

const defaultIo: SpinosaCliIo = {
  out: (message) => process.stdout.write(`${message}\n`),
  error: (message) => process.stderr.write(`${message}\n`),
}

export function parseSpinosaCliArgs(args: string[]): ParsedArgs {
  const positionals: string[] = []
  const values = new Map<string, string>()
  const flags = new Set<string>()
  const valueFlags = new Set(["workspace", "file", "dir", "extensions", "cli", "launch", "channel", "version", "name"])
  const booleanFlags = new Set(["yes", "dry-run", "force", "reinstall", "overwrite", "no-color"])

  for (let index = 0; index < args.length; index++) {
    const value = args[index]!
    if (!value.startsWith("--")) {
      positionals.push(value)
      continue
    }
    const [rawKey, inlineValue] = value.slice(2).split("=", 2)
    if (!rawKey) throw new Error(`Invalid option: ${value}`)
    if (valueFlags.has(rawKey)) {
      const nextValue = inlineValue ?? args[++index]
      if (!nextValue || nextValue.startsWith("--")) throw new Error(`--${rawKey} requires a value`)
      values.set(rawKey, nextValue)
    } else {
      if (inlineValue !== undefined) throw new Error(`--${rawKey} does not accept a value`)
      if (!booleanFlags.has(rawKey)) throw new Error(`Unknown option: --${rawKey}`)
      flags.add(rawKey)
    }
  }
  return { positionals, values, flags }
}

function helpText(): string {
  return [
    "Spinosa — local-first research workspace framework",
    "",
    "Usage:",
    "  spinosa                         Open dashboard",
    "  spinosa new|create <source> [--extensions ext,...] [--cli name] [--launch copy|run]",
    "  spinosa add <source> [--workspace path] [--file path|--dir path] [--extensions ext,...]",
    "  spinosa update [workspace] [--dry-run] [--force] [--yes]",
    "  spinosa doctor [--workspace path]",
    "  spinosa version",
    "  spinosa upgrade [--channel stable|beta] [--version X.Y.Z] [--yes] [--reinstall]",
    "  spinosa uninstall [--yes]",
  ].join("\n")
}

function requiredFrameworkRoot(): string {
  const root = resolveFrameworkRoot()
  if (!root) throw new Error("Spinosa framework root not found. Reinstall Spinosa or set SPINOSA_TEMPLATE_ROOT.")
  return root
}

async function runCreate(parsed: ParsedArgs, io: SpinosaCliIo): Promise<number> {
  const source = parsed.positionals[0]
  if (!source) throw new Error("Source directory required. Use: spinosa new /path/to/documents")
  const sourcePath = path.resolve(source)
  if (!existsSync(sourcePath) || !statSync(sourcePath).isDirectory()) throw new Error(`Source directory does not exist: ${sourcePath}`)

  const frameworkRoot = requiredFrameworkRoot()
  const created = await createWorkspace({
    corpusPath: sourcePath,
    frameworkRoot,
    workspaceName: parsed.values.get("name"),
    onProgress: (message) => io.out(message),
  })
  if (!created.success) throw new Error("Workspace template copy failed")
  await writeWorkspaceStatus(created.workspacePath, "importing")

  const onboarding = await runOnboarding({
    workspacePath: created.workspacePath,
    frameworkRoot,
    sourcePath,
    projectTitle: created.projectName,
    flagExtensions: parsed.values.get("extensions"),
    flagCli: parsed.values.get("cli"),
    flagLaunch: parsed.values.get("launch") as "copy" | "run" | undefined,
    onPhase: (_phase, message) => io.out(message),
  })
  if (!onboarding.success) {
    throw new Error(onboarding.blockerReason ?? `Onboarding failed during ${onboarding.blockedPhase ?? "unknown phase"}`)
  }
  io.out(`Workspace ready: ${created.workspacePath}`)
  return 0
}

async function runAdd(parsed: ParsedArgs, io: SpinosaCliIo): Promise<number> {
  const workspacePath = path.resolve(parsed.values.get("workspace") ?? process.cwd())
  if (!isSpinosaWorkspace(workspacePath)) throw new Error(`Not a Spinosa workspace: ${workspacePath}`)
  const sourceValue = parsed.values.get("file") ?? parsed.values.get("dir") ?? parsed.positionals[0]
  if (!sourceValue) throw new Error("Source file or directory required")
  const sourcePath = path.resolve(sourceValue)
  if (!existsSync(sourcePath)) throw new Error(`Source path does not exist: ${sourcePath}`)
  const sourceIsDir = parsed.values.has("dir") || statSync(sourcePath).isDirectory()

  const result = await addFiles({
    workspacePath,
    sourcePath,
    sourceIsDir,
    extensions: parsed.values.get("extensions"),
    overwrite: parsed.flags.has("overwrite"),
    onProgress: (message) => io.out(message),
  })
  io.out(`Import: ${result.copied + result.mdConverted + result.ocrConverted} delivered, ${result.skipped + result.mdSkipped + result.ocrSkipped} skipped, ${result.failed + result.mdFailed + result.ocrFailed} failed`)
  return result.success ? 0 : 1
}

async function runUpdate(parsed: ParsedArgs, io: SpinosaCliIo): Promise<number> {
  const workspacePath = path.resolve(parsed.values.get("workspace") ?? parsed.positionals[0] ?? process.cwd())
  if (!isSpinosaWorkspace(workspacePath)) throw new Error(`Not a Spinosa workspace: ${workspacePath}`)
  const result = await updateWorkspace({
    workspacePath,
    frameworkRoot: requiredFrameworkRoot(),
    dryRun: parsed.flags.has("dry-run"),
    force: parsed.flags.has("force"),
    onPhase: (_phase, detail) => io.out(detail),
  })
  io.out(`Update: ${result.added} added, ${result.updated} updated, ${result.removed} removed, ${result.skipped} preserved`)
  return result.success ? 0 : 1
}

async function runDoctor(parsed: ParsedArgs, io: SpinosaCliIo): Promise<number> {
  const frameworkRoot = resolveFrameworkRoot()
  let healthy = Boolean(frameworkRoot)
  io.out(`Framework: ${frameworkRoot ?? "not found"}`)
  io.out(`Version: ${readFrameworkVersionFromRoot(frameworkRoot)}`)
  const tools = await detectDocumentTools()
  for (const [name, available] of Object.entries(tools)) {
    io.out(`${name}: ${available ? "ok" : "missing"}`)
    if (!available) healthy = false
  }

  const requestedWorkspace = parsed.values.get("workspace")
  const workspacePath = requestedWorkspace ? path.resolve(requestedWorkspace) : process.cwd()
  if (requestedWorkspace || isSpinosaWorkspace(workspacePath)) {
    const meta = await readWorkspaceMeta(workspacePath)
    if (!meta) {
      io.error(`Workspace: invalid (${workspacePath})`)
      healthy = false
    } else {
      io.out(`Workspace: ${workspacePath}`)
      io.out(`Workspace version: ${meta.frameworkVersion}`)
      for (const check of getFrameworkHealth(workspacePath)) {
        if (!check.ok) healthy = false
        io.out(`${check.ok ? "ok" : "missing"}: ${check.label}`)
      }
    }
  }
  return healthy ? 0 : 1
}

async function runUpgrade(parsed: ParsedArgs, io: SpinosaCliIo): Promise<number> {
  const channelValue = parsed.values.get("channel")
  if (channelValue && channelValue !== "stable" && channelValue !== "beta") {
    throw new Error(`Invalid channel: ${channelValue} (use stable or beta)`)
  }
  const result = await upgradeFramework({
    channel: channelValue as ReleaseChannel | undefined,
    version: parsed.values.get("version"),
    yes: parsed.flags.has("yes"),
    reinstall: parsed.flags.has("reinstall"),
    onPhase: (_phase, detail) => io.out(detail),
  })
  if (result.success) io.out(`Spinosa ${result.newVersion ?? "already current"}`)
  else io.error("Spinosa upgrade failed")
  return result.success ? 0 : 1
}

export async function runSpinosaCli(args: string[], io: SpinosaCliIo = defaultIo): Promise<number> {
  const [command = "help", ...rest] = args
  try {
    if (command === "help" || command === "--help" || command === "-h" || rest.includes("--help") || rest.includes("-h")) {
      io.out(helpText())
      return 0
    }
    if (command === "version" || command === "--version") {
      io.out(`spinosa ${readFrameworkVersionFromRoot(requiredFrameworkRoot())}`)
      return 0
    }
    const parsed = parseSpinosaCliArgs(rest)
    switch (command) {
      case "new":
      case "create":
        return await runCreate(parsed, io)
      case "add":
        return await runAdd(parsed, io)
      case "update":
        return await runUpdate(parsed, io)
      case "doctor":
        return await runDoctor(parsed, io)
      case "upgrade":
        return await runUpgrade(parsed, io)
      default:
        throw new Error(`Unknown Spinosa command: ${command}`)
    }
  } catch (error) {
    io.error(error instanceof Error ? error.message : String(error))
    return 1
  }
}

if (import.meta.main) {
  process.exit(await runSpinosaCli(process.argv.slice(2)))
}
