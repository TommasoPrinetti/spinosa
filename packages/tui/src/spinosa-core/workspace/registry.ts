import { existsSync, mkdirSync, readdirSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { resolveWorkspaceDisplayName } from "../workspace-name"
import type { SpinosaRegisteredWorkspace } from "../types"

export function registryEscape(value: string): string {
  return value.replace(/%/g, "%25").replace(/\|/g, "%7C")
}

export function registryUnescape(value: string): string {
  return value.replace(/%7C/g, "|").replace(/%25/g, "%")
}

export function ensureGlobalMetadata(): void {
  const metadataDir = path.join(homedir(), ".spinosa", "metadata")
  mkdirSync(metadataDir, { recursive: true })

  const configPath = path.join(metadataDir, "config.yaml")
  if (!existsSync(configPath)) {
    Bun.write(configPath, "beta: false\nauto_upgrade: true\n")
  }
}

export async function loadRegistry(configPath?: string): Promise<{ path: string; project: string }[]> {
  const registry = configPath ?? path.join(homedir(), ".spinosa", "metadata", "workspaces.txt")
  const file = Bun.file(registry)
  if (!(await file.exists())) return []

  const lines = (await file.text()).split(/\r?\n/).filter(Boolean)
  const results: { path: string; project: string }[] = []

  for (const line of lines) {
    const [rawPath, rawProject] = line.split("|")
    if (!rawPath) continue
    const workspacePath = registryUnescape(rawPath)
    if (!existsSync(path.join(workspacePath, ".spinosa", "workspace"))) continue
    results.push({
      path: workspacePath,
      project: registryUnescape(rawProject ?? ""),
    })
  }

  return results
}

export async function registerWorkspace(workspacePath: string, project: string): Promise<void> {
  const registry = path.join(homedir(), ".spinosa", "metadata", "workspaces.txt")
  const encodedPath = registryEscape(workspacePath)
  const encodedProject = registryEscape(project)

  ensureGlobalMetadata()

  const file = Bun.file(registry)
  let lines: string[] = []
  if (await file.exists()) {
    const text = await file.text()
    lines = text.split(/\r?\n/).filter(Boolean)
  }

  const filtered = lines.filter((line) => {
    const rawPath = line.split("|")[0] ?? ""
    return rawPath !== encodedPath
  })

  const today = new Date().toISOString().slice(0, 10)
  filtered.push(`${encodedPath}|${encodedProject}|${today}`)
  await Bun.write(registry, filtered.join("\n") + "\n")
}

export async function unregisterWorkspace(workspacePath: string): Promise<void> {
  const registry = path.join(homedir(), ".spinosa", "metadata", "workspaces.txt")
  const file = Bun.file(registry)
  if (!(await file.exists())) return

  const text = await file.text()
  const lines = text.split(/\r?\n/).filter(Boolean)
  const filtered = lines.filter((line) => {
    const rawPath = line.split("|")[0] ?? ""
    return registryUnescape(rawPath) !== workspacePath
  })

  if (filtered.length < lines.length) {
    await Bun.write(registry, filtered.join("\n") + (filtered.length > 0 ? "\n" : ""))
  }
}

export async function listRegisteredWorkspaces(): Promise<SpinosaRegisteredWorkspace[]> {
  const entries = await loadRegistry()
  return entries.map((entry) => ({
    path: entry.path,
    projectName: resolveWorkspaceDisplayName(entry.path, entry.project),
  }))
}

export function validateWorkspace(path: string): boolean {
  if (!existsSync(path)) return false
  return existsSync(path + "/.spinosa/workspace")
    || existsSync(path + "/spinosa/workspace")
    || existsSync(path + "/framework/spinosa/workspace")
}

export function scanWorkspaces(roots: string[]): string[] {
  const seen = new Set<string>()
  const results: string[] = []

  for (const root of roots) {
    if (!existsSync(root)) continue
    walkWorkspaceMarker(root, 0, seen, results)
  }

  return results
}

function walkWorkspaceMarker(dir: string, depth: number, seen: Set<string>, results: string[]) {
  if (depth > 5) return
  if (seen.has(dir)) return
  seen.add(dir)

  const marker = path.join(dir, ".spinosa", "workspace")
  if (existsSync(marker)) {
    results.push(dir)
    return
  }

  if (depth === 5) return

  let entries: string[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => path.join(dir, e.name))
  } catch {
    return
  }

  for (const entry of entries) {
    walkWorkspaceMarker(entry, depth + 1, seen, results)
  }
}

export async function discoverRegisteredWorkspaces(): Promise<string[]> {
  ensureGlobalMetadata()

  const registryPath = path.join(homedir(), ".spinosa", "metadata", "workspaces.txt")
  const registryFile = Bun.file(registryPath)
  if (await registryFile.exists()) {
    const entries = await loadRegistry(registryPath)
    if (entries.length > 0) return entries.map((e) => e.path)
  }

  const cachePath = path.join(homedir(), ".spinosa", "metadata", "workspace_cache.txt")
  const cacheFile = Bun.file(cachePath)
  if (await cacheFile.exists()) {
    const text = await cacheFile.text()
    const lines = text.split(/\r?\n/).filter(Boolean)
    return lines
      .map((line) => line.split("|")[0] ?? "")
      .filter(Boolean)
      .map(registryUnescape)
  }

  return []
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function writeSetupFiles(
  root: string,
  projectTitle: string,
  sourcePath: string,
  preferredCli: string,
): Promise<void> {
  const contextPath = path.join(root, "system", "context.md")
  const configPath = path.join(root, "system", "configuration.md")
  const agentsPath = path.join(root, "AGENTS.md")
  const claudePath = path.join(root, "CLAUDE.md")

  const date = today()

  const contextContent = `---
type: information
agent: setup_cli
description:
  - Project blueprint filled during onboarding and startup.
  - Agents read this to understand scope, active corpus, evidence rules, and researcher preferences.
created: ${date}
updated: ${date}
setup_status: cli_started
connects_to:
  - AGENTS.md
  - system/configuration.md
  - system/startup.md
  - .logs/user_requests.md
---

# Information

## Project
- Title: ${projectTitle || "[project name]"}
- Description: not provided during fast setup; infer from the raw corpus during startup

## Project Artifacts
- none provided during fast setup

## Sources
- Active corpus: raw/
- Main source types: [inferred during startup from the raw corpus]
- Expected incoming sources: [inferred during startup]

## Research Vocabulary
- Key actors / institutions / places: [inferred during startup]
- Key concepts: [inferred during startup]
- Sensitizing concepts, not evidence: [inferred during startup]
- Theoretical frames, not forced labels: [inferred during startup]

## Method And Evidence
- Methods: [inferred during startup]
- Claims require source paths.
- L2 clues require Verifier checking before reporting.
- External sources must stay labeled external unless moved into \`raw/\`.
- External source policy: no (default; ask only if external access is needed)

## Outputs
- Start with navigation maps in maps/ and evidence-grounded answers unless the researcher requests another output.

## Blind Spots
- [identified during startup]

## Researcher Preferences
[stated or inferred during startup]

## Preferred LLM CLI
${preferredCli}
`

  const configContent = `---
type: project_configuration
agent: setup_cli
description:
  - Operating profile for the current Spinosa project or framework template.
  - Agents read this first to learn source policy, protected paths, and setup status.
created: ${date}
updated: ${date}
setup_status: cli_started
---

# Configuration

Agents read this before major work.

\`\`\`yaml
workspace_type: research_framework
research_mode: evolving_complex_corpus
active_corpus_path: raw/
source_mode: imported_raw_corpus

source_policy: internal_first
active_corpus_policy: raw_only_after_onboarding
external_sources_allowed: no

claim_standard: source_link_required
l2_policy: verifier_required

protected_paths:
  - raw/
  - context.md

stale_after_days: 30
preferred_llm_cli: "${preferredCli}"
\`\`\`

## Notes
- This file was initialized by \`spinosa new\`.
- The CLI collected: source folder and preferred LLM CLI. It seeded the initial workspace label from the source folder name. It imported accepted files into raw/. Office documents, structured data, and text-based PDFs were converted to Markdown. Scanned PDFs and images were processed via PPU PaddleOCR. Selected audio and video files were copied unchanged. AGENTS.md control files were skipped.
- After onboarding, normal source-grounded work starts from raw/.
- During startup, project description and helpful artifact URLs are optional. If absent, the LLM CLI agent records them as not provided, keeps external_sources_allowed at its default \`no\`, and infers working scope from the raw corpus.
- When setup_status reaches workspace_started, the startup workflow has built the master dictionary, generated YAML headers, created multi-level navigation maps in maps/, and passed validation.
- This file never grants permission to edit \`raw/\`.
`

  await Bun.write(contextPath, contextContent)
  await Bun.write(configPath, configContent)

  if (preferredCli === "Claude Code" && existsSync(agentsPath)) {
    await Bun.write(claudePath, Bun.file(agentsPath))
  }
}
