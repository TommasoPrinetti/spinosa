import { existsSync } from "node:fs"
import path from "node:path"
import { resolveWorkspaceDisplayName } from "../workspace-name"
import type { SpinosaSetupStatus, SpinosaWorkspaceMeta } from "../types"

const SETUP_STATUSES = new Set<SpinosaSetupStatus>([
  "not_started",
  "cli_started",
  "workspace_started",
  "unknown",
])

const SPINOSA_AGENT_FILES = [
  "spinosa-searcher.md",
  "spinosa-mapper.md",
  "spinosa-analyst.md",
  "spinosa-serendippo.md",
  "spinosa-writer.md",
  "spinosa-verifier.md",
  "spinosa-evaluator.md",
]

function parseSetupStatus(value: string | undefined): SpinosaSetupStatus | undefined {
  if (!value) return
  if (SETUP_STATUSES.has(value as SpinosaSetupStatus)) return value as SpinosaSetupStatus
  return "unknown"
}

export function isSpinosaWorkspace(workspacePath: string): boolean {
  return existsSync(path.join(workspacePath, ".spinosa", "workspace"))
}

export async function readTextFile(workspacePath: string, relative: string): Promise<string | undefined> {
  const file = Bun.file(path.join(workspacePath, relative))
  if (!(await file.exists())) return
  return file.text()
}

async function readConfiguration(workspacePath: string): Promise<{ setupStatus?: string; preferredLlmCli?: string }> {
  const text = await readTextFile(workspacePath, "system/configuration.md")
  if (!text) return {}
  const setup = text.match(/setup_status:\s*(\w+)/)?.[1]
  const preferred = text.match(/preferred_llm_cli:\s*(.+)$/m)?.[1]?.trim()
  return {
    setupStatus: setup,
    preferredLlmCli: preferred?.replace(/^"|"$/g, ""),
  }
}

export async function readWorkspaceMarker(workspacePath: string): Promise<Partial<SpinosaWorkspaceMeta>> {
  const file = Bun.file(path.join(workspacePath, ".spinosa", "workspace"))
  if (!(await file.exists())) return { path: workspacePath }

  const text = await file.text()
  const read = (key: string) => {
    const match = text.match(new RegExp(`^${key}:\\s*(.+)$`, "m"))
    return match?.[1]?.trim()
  }

  const config = await readConfiguration(workspacePath)
  const setupStatus = parseSetupStatus(read("setup_status"))
  return {
    path: workspacePath,
    projectName: resolveWorkspaceDisplayName(workspacePath, read("project_name")),
    setupStatus: setupStatus ?? (config.setupStatus ? parseSetupStatus(config.setupStatus) : "unknown"),
    frameworkVersion: read("framework_version") ?? "unknown",
    sourceLocation: read("source_location"),
    created: read("created"),
    preferredLlmCli: config.preferredLlmCli,
  }
}

export async function readWorkspaceMeta(workspacePath: string): Promise<SpinosaWorkspaceMeta | undefined> {
  if (!isSpinosaWorkspace(workspacePath)) return
  const partial = await readWorkspaceMarker(workspacePath)
  return {
    path: workspacePath,
    projectName: resolveWorkspaceDisplayName(workspacePath, partial.projectName),
    setupStatus: partial.setupStatus ?? "unknown",
    frameworkVersion: partial.frameworkVersion ?? "unknown",
    sourceLocation: partial.sourceLocation,
    created: partial.created,
    preferredLlmCli: partial.preferredLlmCli,
  }
}

export async function writeWorkspaceFrameworkVersion(workspacePath: string, version: string): Promise<void> {
  const markerPath = path.join(workspacePath, ".spinosa", "workspace")
  const file = Bun.file(markerPath)
  if (!(await file.exists())) return

  const normalized = version.trim().replace(/^v/, "")
  const text = await file.text()
  const updated = text.match(/^framework_version:\s*.+$/m)
    ? text.replace(/^(framework_version:\s*).+$/m, `$1${normalized}`)
    : `${text.trimEnd()}\nframework_version: ${normalized}\n`
  await Bun.write(markerPath, updated)
}

export async function writeWorkspaceStatus(workspacePath: string, status: string): Promise<void> {
  const markerPath = path.join(workspacePath, ".spinosa", "workspace")
  const text = await Bun.file(markerPath).text()
  const updated = text.replace(/^(setup_status:\s*).+$/m, `$1${status}`)
  await Bun.write(markerPath, updated)
}

export async function readOrchestratorNotes(workspacePath: string): Promise<string | undefined> {
  return readTextFile(workspacePath, ".spinosa/memory/orchestrator-notes.md")
}

export async function writeOrchestratorNotes(workspacePath: string, content: string): Promise<void> {
  const target = path.join(workspacePath, ".spinosa", "memory", "orchestrator-notes.md")
  await Bun.write(target, content)
}

export async function writePreferredCli(workspacePath: string, cli: string): Promise<void> {
  const configPath = path.join(workspacePath, "system", "configuration.md")
  const text = await readTextFile(workspacePath, "system/configuration.md")
  if (!text) return

  const updated = text.replace(/^(preferred_llm_cli:\s*).+$/m, `$1${cli}`)
  await Bun.write(configPath, updated)
}

export async function readStartupPrompt(workspacePath: string): Promise<string | undefined> {
  return readTextFile(workspacePath, "startup-prompt.md")
}

export function artifactExists(workspacePath: string, relativePath: string): boolean {
  return existsSync(path.join(workspacePath, relativePath))
}

export function getFrameworkHealth(workspacePath: string): { label: string; ok: boolean; detail?: string }[] {
  const checks: { label: string; ok: boolean; detail?: string }[] = []
  const required = [
    "AGENTS.md",
    "startup-prompt.md",
    ".agents/references/classification.md",
    ".agents/references/goal-artifact-template.md",
    "system/configuration.md",
    "system/context.md",
  ]
  for (const relative of required) {
    checks.push({
      label: relative,
      ok: existsSync(path.join(workspacePath, relative)),
    })
  }
  for (const agent of SPINOSA_AGENT_FILES) {
    const relative = path.join(".opencode", "agents", agent)
    checks.push({
      label: relative,
      ok: existsSync(path.join(workspacePath, relative)),
      detail: "run .bin/sync-agents.sh if missing",
    })
  }
  return checks
}
