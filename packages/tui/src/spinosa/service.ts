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

export type FrameworkReleaseStream = "beta" | "stable"

type ParsedFrameworkVersion = {
  core: number[]
  prerelease: string[]
}

export function normalizeFrameworkVersion(value: string | undefined) {
  return value?.trim().replace(/^v/i, "") ?? ""
}

export function isLegacyDevWorkspaceVersion(value: string | undefined) {
  const normalized = normalizeFrameworkVersion(value).toLowerCase()
  return normalized === "dev" || normalized === "vdev"
}

export function parseInstallPinnedVersion(installScript: string | undefined) {
  if (!installScript) return undefined
  const match = installScript.match(/^PINNED_VERSION="([^"]+)"/m)
  return match?.[1]?.trim()
}

export function resolveBundledFrameworkVersion(
  metadataVersion: string | undefined,
  installScript: string | undefined,
) {
  const metadata = metadataVersion?.trim()
  if (metadata && metadata !== "dev") return metadata
  return parseInstallPinnedVersion(installScript)
}

function parseComparableFrameworkVersion(value: string | undefined): ParsedFrameworkVersion | undefined {
  if (!value) return
  const normalized = normalizeFrameworkVersion(value)
  if (!normalized || normalized === "unknown" || isLegacyDevWorkspaceVersion(normalized)) return

  const [base, ...rest] = normalized.split("-")
  const prerelease = rest.join("-").split(".").filter(Boolean)
  const coreTokens = base.split(".")
  if (coreTokens.length === 0 || coreTokens.some((part) => !/^\d+$/.test(part))) return

  return {
    core: coreTokens.map((part) => Number.parseInt(part, 10)),
    prerelease,
  }
}

function comparePrereleaseTokens(left: string[], right: string[]) {
  const max = Math.max(left.length, right.length)
  for (let index = 0; index < max; index++) {
    const leftToken = left[index] ?? ""
    const rightToken = right[index] ?? ""
    if (leftToken === rightToken) continue
    if (!leftToken) return -1
    if (!rightToken) return 1

    const leftNumeric = /^\d+$/.test(leftToken) ? Number.parseInt(leftToken, 10) : undefined
    const rightNumeric = /^\d+$/.test(rightToken) ? Number.parseInt(rightToken, 10) : undefined
    if (leftNumeric !== undefined && rightNumeric !== undefined) {
      if (leftNumeric > rightNumeric) return 1
      if (leftNumeric < rightNumeric) return -1
      continue
    }
    if (leftNumeric !== undefined) return -1
    if (rightNumeric !== undefined) return 1
    if (leftToken > rightToken) return 1
    if (leftToken < rightToken) return -1
  }
  return 0
}

/** Returns 1 when left is newer, -1 when right is newer, 0 when equal. Undefined when incomparable. */
export function compareFrameworkVersions(left: string | undefined, right: string | undefined) {
  if (isLegacyDevWorkspaceVersion(left) && isLegacyDevWorkspaceVersion(right)) return 0
  if (isLegacyDevWorkspaceVersion(left)) return -1
  if (isLegacyDevWorkspaceVersion(right)) return 1

  const leftParsed = parseComparableFrameworkVersion(left)
  const rightParsed = parseComparableFrameworkVersion(right)
  if (!leftParsed || !rightParsed) return

  const maxCore = Math.max(leftParsed.core.length, rightParsed.core.length)
  for (let index = 0; index < maxCore; index++) {
    const leftValue = leftParsed.core[index] ?? 0
    const rightValue = rightParsed.core[index] ?? 0
    if (leftValue > rightValue) return 1
    if (leftValue < rightValue) return -1
  }

  const leftPrerelease = leftParsed.prerelease
  const rightPrerelease = rightParsed.prerelease
  if (leftPrerelease.length === 0 && rightPrerelease.length > 0) return 1
  if (leftPrerelease.length > 0 && rightPrerelease.length === 0) return -1
  if (leftPrerelease.length > 0 && rightPrerelease.length > 0) {
    return comparePrereleaseTokens(leftPrerelease, rightPrerelease)
  }
  return 0
}

export function isPrereleaseFrameworkVersion(value: string | undefined) {
  const normalized = normalizeFrameworkVersion(value)
  return /^\d+\.\d+\.\d+-.+$/u.test(normalized)
}

export function workspaceFrameworkStream(value: string | undefined): FrameworkReleaseStream | undefined {
  if (isLegacyDevWorkspaceVersion(value)) return "beta"
  const normalized = normalizeFrameworkVersion(value)
  if (!normalized || normalized === "unknown") return
  if (isPrereleaseFrameworkVersion(value)) return "beta"
  if (/^\d+\.\d+\.\d+$/u.test(normalized)) return "stable"
  return
}

export function bundledFrameworkStream(value: string | undefined): FrameworkReleaseStream | undefined {
  if (!value || isLegacyDevWorkspaceVersion(value)) return
  return workspaceFrameworkStream(value)
}

export async function readInstallReleaseChannel(): Promise<FrameworkReleaseStream | undefined> {
  const config = Bun.file(path.join(homedir(), ".spinosa", "metadata", "config.yaml"))
  if (!(await config.exists())) return
  const text = await config.text()
  const match = text.match(/^beta:\s*(\S+)/m)
  if (!match) return
  const value = match[1]!.replace(/["']/g, "").toLowerCase()
  if (value === "true" || value === "yes" || value === "on" || value === "1") return "beta"
  if (value === "false" || value === "no" || value === "off" || value === "0") return "stable"
  return
}

export function workspaceNeedsFrameworkUpdate(
  workspaceVersion: string | undefined,
  bundledVersion: string | undefined,
  installStream?: FrameworkReleaseStream,
) {
  const bundled = normalizeFrameworkVersion(bundledVersion)
  if (!bundled || isLegacyDevWorkspaceVersion(bundledVersion)) return false

  if (isLegacyDevWorkspaceVersion(workspaceVersion)) return true

  const workspaceStream = workspaceFrameworkStream(workspaceVersion)
  const targetStream = bundledFrameworkStream(bundled) ?? installStream
  if (workspaceStream && targetStream && workspaceStream !== targetStream) return false

  return compareFrameworkVersions(bundled, workspaceVersion) === 1
}

export async function readBundledFrameworkVersion() {
  const metadata = (await readFrameworkFile("metadata/version"))?.trim()
  const installScript = await readFrameworkFile("install.sh")
  return resolveBundledFrameworkVersion(metadata, installScript)
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
