import { existsSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import {
  buildMapTree,
  countDictionaryTerms,
  emptyWorkspaceIndex,
  parseWorkspaceIndex,
} from "./parse-corpus"
import {
  parseGoalArtifact,
  parseOrchestratorAdvisories,
  parseOrchestratorCounter,
  parseReportFrontmatter,
  sessionIdFromGoalFilename,
} from "./parse-goal"
import { readFrameworkFile } from "./framework"
import type {
  CorpusSummary,
  GoalArtifactSummary,
  RoutesSnapshot,
  SpinosaRegisteredWorkspace,
  SpinosaSetupStatus,
  SpinosaWorkspaceMeta,
} from "./types"
import { resolveWorkspaceDisplayName } from "./workspace-name"

const SETUP_STATUSES = new Set<SpinosaSetupStatus>([
  "not_started",
  "cli_started",
  "workspace_started",
  "unknown",
])

export function registryUnescape(value: string) {
  return value.replaceAll("%7C", "|").replaceAll("%25", "%")
}

export function isSpinosaWorkspace(workspacePath: string) {
  return existsSync(path.join(workspacePath, ".spinosa", "workspace"))
}

export async function readTextFile(workspacePath: string, relative: string) {
  const file = Bun.file(path.join(workspacePath, relative))
  if (!(await file.exists())) return undefined
  return file.text()
}

export async function readWorkspaceMarker(workspacePath: string): Promise<Partial<SpinosaWorkspaceMeta>> {
  const file = Bun.file(path.join(workspacePath, ".spinosa", "workspace"))
  if (!(await file.exists())) return { path: workspacePath }

  const text = await file.text()
  const read = (key: string) => {
    const match = text.match(new RegExp(`^${key}:\\s*(.+)$`, "m"))
    return match?.[1]?.trim()
  }

  const setupStatus = parseSetupStatus(read("setup_status"))
  const config = await readConfiguration(workspacePath)
  return {
    path: workspacePath,
    projectName: resolveWorkspaceDisplayName(workspacePath, read("project_name")),
    setupStatus: setupStatus ?? config.setupStatus ?? (await readSetupStatusFromConfig(workspacePath)),
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

function parseFrameworkVersion(value: string | undefined) {
  const normalized = value?.trim().replace(/^v/, "")
  if (!normalized || normalized === "unknown" || normalized === "dev") return
  const parts = normalized.split(".").map((part) => Number(part))
  if (parts.some((part) => Number.isNaN(part) || part < 0)) return
  return parts
}

export function compareFrameworkVersions(left: string | undefined, right: string | undefined) {
  const leftParts = parseFrameworkVersion(left)
  const rightParts = parseFrameworkVersion(right)
  if (!leftParts || !rightParts) return

  const length = Math.max(leftParts.length, rightParts.length)
  for (let index = 0; index < length; index++) {
    const leftValue = leftParts[index] ?? 0
    const rightValue = rightParts[index] ?? 0
    if (leftValue > rightValue) return 1
    if (leftValue < rightValue) return -1
  }
  return 0
}

export function workspaceNeedsFrameworkUpdate(workspaceVersion: string | undefined, bundledVersion: string | undefined) {
  return compareFrameworkVersions(bundledVersion, workspaceVersion) === 1
}

export async function readBundledFrameworkVersion() {
  return (await readFrameworkFile("metadata/version"))?.trim()
}

async function readConfiguration(workspacePath: string) {
  const text = await readTextFile(workspacePath, "system/configuration.md")
  if (!text) return {}
  const setup = text.match(/setup_status:\s*(\w+)/)?.[1]
  const preferred = text.match(/preferred_llm_cli:\s*(.+)$/m)?.[1]?.trim()
  return {
    setupStatus: parseSetupStatus(setup),
    preferredLlmCli: preferred?.replace(/^"|"$/g, ""),
  }
}

function parseSetupStatus(value: string | undefined): SpinosaSetupStatus | undefined {
  if (!value) return
  if (SETUP_STATUSES.has(value as SpinosaSetupStatus)) return value as SpinosaSetupStatus
  return "unknown"
}

async function readSetupStatusFromConfig(workspacePath: string): Promise<SpinosaSetupStatus> {
  const config = await readConfiguration(workspacePath)
  return config.setupStatus ?? "unknown"
}

export async function listRegisteredWorkspaces(): Promise<SpinosaRegisteredWorkspace[]> {
  const registry = path.join(homedir(), ".spinosa", "metadata", "workspaces.txt")
  const file = Bun.file(registry)
  if (!(await file.exists())) return []

  const lines = (await file.text()).split(/\r?\n/).filter(Boolean)
  const results: SpinosaRegisteredWorkspace[] = []
  const seen = new Set<string>()

  for (const line of lines) {
    const [rawPath, rawProject] = line.split("|")
    if (!rawPath) continue
    const workspacePath = registryUnescape(rawPath)
    if (!isSpinosaWorkspace(workspacePath)) continue
    if (seen.has(workspacePath)) continue
    seen.add(workspacePath)
    results.push({
      path: workspacePath,
      projectName: resolveWorkspaceDisplayName(workspacePath, registryUnescape(rawProject ?? "")),
    })
  }

  return results
}

export async function countRawMarkdownFiles(rootDir: string) {
  if (!existsSync(rootDir)) return 0
  let count = 0
  const glob = new Bun.Glob("**/*.md")
  for await (const _ of glob.scan({ cwd: rootDir, onlyFiles: true })) count++
  return count
}

async function listMapPaths(workspacePath: string) {
  const mapsDir = path.join(workspacePath, "maps")
  if (!existsSync(mapsDir)) return []
  const glob = new Bun.Glob("**/*.md")
  const paths: string[] = []
  for await (const entry of glob.scan({ cwd: mapsDir, onlyFiles: true })) paths.push(entry)
  return paths
}

export async function getCorpusSummary(workspacePath: string): Promise<CorpusSummary> {
  const indexText = await readTextFile(workspacePath, "system/workspace_index.md")
  const dictionaryText = await readTextFile(workspacePath, "system/dictionary.md")
  const hubExists = existsSync(path.join(workspacePath, "maps", "corpus_overview.md"))
  const mapPaths = await listMapPaths(workspacePath)

  return {
    hasWorkspaceIndex: Boolean(indexText),
    mapCount: mapPaths.length,
    rawCount: await countRawMarkdownFiles(path.join(workspacePath, "raw")),
    dictionaryTermCount: dictionaryText ? countDictionaryTerms(dictionaryText) : 0,
    index: indexText ? parseWorkspaceIndex(indexText) : emptyWorkspaceIndex(),
    mapTree: buildMapTree(mapPaths).slice(0, 40),
    hubExists,
  }
}

async function readGoalArtifact(workspacePath: string, filename: string): Promise<GoalArtifactSummary> {
  const goalPath = path.join("agent_reports", filename)
  const text = (await readTextFile(workspacePath, goalPath)) ?? ""
  return parseGoalArtifact(text, goalPath)
}

export async function getRoutesSnapshot(
  workspacePath: string,
  preferredSessionId?: string,
): Promise<RoutesSnapshot> {
  const goals: GoalArtifactSummary[] = []
  const reports: RoutesSnapshot["reports"] = []
  const coverage: RoutesSnapshot["coverage"] = []

  const glob = new Bun.Glob("agent_reports/*")
  for await (const entry of glob.scan({ cwd: workspacePath, onlyFiles: true })) {
    const name = entry.split("/").pop() ?? entry
    if (name.startsWith("g_") && name.endsWith(".md")) {
      goals.push(await readGoalArtifact(workspacePath, name))
      continue
    }
    if (name.startsWith("c_") && name.endsWith(".md")) {
      coverage.push({
        filename: name,
        path: entry,
        sessionId: sessionIdFromGoalFilename(name.replace(/^c_/, "g_")) ?? name.slice(2, -3),
      })
      continue
    }
    if (/^\d+_/.test(name) && name.endsWith(".md")) {
      const text = await readTextFile(workspacePath, entry)
      const meta: { title?: string; status?: string; sessionId?: string } = text ? parseReportFrontmatter(text) : {}
      reports.push({
        filename: name,
        path: entry,
        title: meta.title,
        status: meta.status,
        sessionId: meta.sessionId,
      })
    }
  }

  goals.sort((a, b) => b.filename.localeCompare(a.filename))
  reports.sort((a, b) => b.filename.localeCompare(a.filename))
  coverage.sort((a, b) => b.filename.localeCompare(a.filename))

  const notes = await readOrchestratorNotes(workspacePath)
  const overseerCounter = notes ? parseOrchestratorCounter(notes) : undefined
  const overseerAdvisories = notes ? parseOrchestratorAdvisories(notes) : undefined

  const activeGoal =
    (preferredSessionId ? goals.find((goal) => goal.sessionId === preferredSessionId) : undefined) ?? goals[0]

  return {
    goals,
    reports,
    coverage,
    overseerCounter,
    overseerAdvisories,
    activeGoal,
  }
}

export async function readOrchestratorNotes(workspacePath: string) {
  return readTextFile(workspacePath, ".spinosa/memory/orchestrator-notes.md")
}

export async function writeOrchestratorNotes(workspacePath: string, content: string) {
  const target = path.join(workspacePath, ".spinosa", "memory", "orchestrator-notes.md")
  await Bun.write(target, content)
}

export async function unregisterWorkspace(workspacePath: string) {
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

export async function writePreferredCli(workspacePath: string, cli: string) {
  const configPath = path.join(workspacePath, "system", "configuration.md")
  const text = await readTextFile(workspacePath, "system/configuration.md")
  if (!text) return

  const updated = text.replace(
    /^(preferred_llm_cli:\s*).+$/m,
    `$1${cli}`,
  )
  await Bun.write(configPath, updated)
}

export async function writeWorkspaceFrameworkVersion(workspacePath: string, version: string) {
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

export async function writeWorkspaceStatus(workspacePath: string, status: string) {
  const markerPath = path.join(workspacePath, ".spinosa", "workspace")
  const text = await Bun.file(markerPath).text()
  const updated = text.replace(
    /^(setup_status:\s*).+$/m,
    `$1${status}`,
  )
  await Bun.write(markerPath, updated)
}

export async function artifactExists(workspacePath: string, relativePath: string) {
  return existsSync(path.join(workspacePath, relativePath))
}

const SPINOSA_AGENT_FILES = [
  "spinosa-searcher.md",
  "spinosa-mapper.md",
  "spinosa-analyst.md",
  "spinosa-serendippo.md",
  "spinosa-writer.md",
  "spinosa-verifier.md",
  "spinosa-evaluator.md",
]

export async function getFrameworkHealth(workspacePath: string) {
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

export async function readStartupPrompt(workspacePath: string) {
  return readTextFile(workspacePath, "startup-prompt.md")
}

export async function listAuxiliaryArtifacts(workspacePath: string) {
  const buckets: Record<string, string[]> = {
    evidence: [],
    analysis: [],
    serendipity: [],
    evaluator: [],
    extraction: [],
  }
  const glob = new Bun.Glob("agent_reports/*")
  for await (const entry of glob.scan({ cwd: workspacePath, onlyFiles: true })) {
    const name = entry.split("/").pop() ?? entry
    if (name.startsWith("evidence_packet_")) buckets.evidence.push(name)
    else if (name.startsWith("analysis_")) buckets.analysis.push(name)
    else if (name.startsWith("serendipity_")) buckets.serendipity.push(name)
    else if (name.startsWith("e_")) buckets.evaluator.push(name)
    else if (name.startsWith("extraction_batch_")) buckets.extraction.push(name)
  }
  for (const key of Object.keys(buckets)) {
    buckets[key]!.sort().reverse()
  }
  return buckets
}

/** Phase 7 placeholder — future SDK surface for remote clients. */
export type SpinosaSdkSurface = {
  getMeta: (workspacePath: string) => Promise<SpinosaWorkspaceMeta | undefined>
  getCorpusSummary: (workspacePath: string) => Promise<CorpusSummary>
  getRoutesSnapshot: (workspacePath: string) => Promise<RoutesSnapshot>
}

export const fileBackedSdkSurface: SpinosaSdkSurface = {
  getMeta: readWorkspaceMeta,
  getCorpusSummary,
  getRoutesSnapshot,
}
