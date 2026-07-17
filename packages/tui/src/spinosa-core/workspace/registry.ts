import { existsSync, mkdirSync, readdirSync, openSync, closeSync, fsyncSync } from "node:fs"
import { mkdir, rename, rm, stat, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"
import { resolveWorkspaceDisplayName } from "../workspace-name"
import type { SpinosaRegisteredWorkspace, SpinosaWorkspacePresence } from "../types"
import { ensureWorkspaceID, parseWorkspaceID, readWorkspaceID, type SpinosaWorkspaceID } from "./identity"
// In-process mutex serializing registry file read-modify-write cycles
let registryLock: Promise<void> = Promise.resolve()

function withRegistryLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = registryLock
    .then(fn, fn) // recover from previous rejection and still run fn
  registryLock = next.then(() => {}, () => {}) // keep chain alive even if fn rejects
  return next
}

function spinosaHome(): string {
  return process.env.SPINOSA_HOME ?? path.join(homedir(), ".spinosa")
}

function metadataPath(...segments: string[]): string {
  return path.join(spinosaHome(), "metadata", ...segments)
}

// Single-pass escape using a longest-match replacer so a literal "%" that
// precedes a digit sequence is never mis-decoded.
const REGISTRY_ESCAPE_RE = /%25|%0A|%0D|%7C/gi
export function registryEscape(value: string): string {
  return value
    .replace(/%/g, "%25")
    .replace(/\|/g, "%7C")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A")
}

export function registryUnescape(value: string): string {
  return value.replace(REGISTRY_ESCAPE_RE, (m) => {
    switch (m.toUpperCase()) {
      case "%25": return "%"
      case "%0A": return "\n"
      case "%0D": return "\r"
      case "%7C": return "|"
      default: return m
    }
  })
}

const REGISTRY_LOCK_TIMEOUT_MS = 8_000

// Read the owner pid recorded inside a lock dir; returns null if unreadable.
async function readLockOwnerPid(lockDir: string): Promise<number | null> {
  try {
    const raw = await readFile(path.join(lockDir, "pid"), "utf8")
    const pid = Number.parseInt(raw.trim(), 10)
    return Number.isFinite(pid) ? pid : null
  } catch {
    return null
  }
}

// A process is considered alive if we can signal it (kill(pid,0) succeeds).
function isProcessAlive(pid: number): boolean {
  if (pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function acquireRegistryFileLock(
  registry: string,
  onRecover?: (msg: string) => void,
): Promise<() => Promise<void>> {
  const lockDir = `${registry}.lock`
  const deadline = Date.now() + REGISTRY_LOCK_TIMEOUT_MS
  let forceReclaimed = false
  while (true) {
    try {
      await mkdir(lockDir)
      // Record our pid so a later holder can tell whether we are still alive.
      await writeFile(path.join(lockDir, "pid"), String(process.pid), "utf8").catch(() => {})
      return async () => { await rm(lockDir, { recursive: true, force: true }) }
    } catch (error) {
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== "EEXIST") throw error
      // Only reclaim a lock whose owner process is confirmed dead. This makes
      // acquisition atomic with respect to liveness and avoids two holders
      // both winning the rm+continue race.
      const ownerPid = await readLockOwnerPid(lockDir)
      if (ownerPid !== null && ownerPid > 0 && !isProcessAlive(ownerPid)) {
        await rm(lockDir, { recursive: true, force: true }).catch(() => {})
        onRecover?.("Cleared a stale registry lock left by a previous run.")
        continue
      }
      if (!forceReclaimed && Date.now() >= deadline) {
        // Lock is held but never released (wedged, e.g. network hang on a
        // cloud mount). Only force-reclaim when we cannot confirm a live
        // owner — never steal a lock that an alive process still holds.
        if (ownerPid === null || ownerPid <= 0 || !isProcessAlive(ownerPid)) {
          forceReclaimed = true
          await rm(lockDir, { recursive: true, force: true }).catch(() => {})
          onRecover?.("Force-cleared a wedged registry lock.")
          continue
        }
      }
      await Bun.sleep(20)
    }
  }
}

async function writeRegistryAtomically(registry: string, content: string): Promise<void> {
  const tmp = `${registry}.tmp-${process.pid}-${crypto.randomUUID()}`
  await Bun.write(tmp, content)
  // fsync the temp file before renaming so a crash mid-rename cannot leave a
  // partial registry on network/FUSE-backed filesystems.
  try {
    const fd = openSync(tmp, "r+")
    try {
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
  } catch {
    // best-effort; rename still proceeds
  }
  try {
    await rename(tmp, registry)
  } catch (error) {
    await rm(tmp, { force: true }).catch(() => {})
    throw error
  }
}

async function withRegistryFileLock<T>(
  registry: string,
  fn: () => Promise<T>,
  onRecover?: (msg: string) => void,
): Promise<T> {
  const release = await acquireRegistryFileLock(registry, onRecover)
  try {
    return await fn()
  } finally {
    await release()
  }
}

type DecodedRegistryLine = {
  workspacePath: string
  project: string
  registered: string
  workspaceID?: SpinosaWorkspaceID
  presence?: SpinosaWorkspacePresence
}

function decodeRegistryLine(line: string): DecodedRegistryLine | undefined {
  const [rawPath, rawProject = "", registered = "", rawWorkspaceID, rawPresence] = line.split("|")
  if (!rawPath) return
  return {
    workspacePath: registryUnescape(rawPath),
    project: registryUnescape(rawProject),
    registered,
    workspaceID: parseWorkspaceID(rawWorkspaceID),
    presence: parseWorkspacePresence(rawPresence),
  }
}

function parseWorkspacePresence(value: string | undefined): SpinosaWorkspacePresence | undefined {
  switch (value) {
    case "present":
    case "legacy":
    case "moved":
    case "non_existent":
    case "invalid":
    case "identity_mismatch":
      return value
    default:
      return undefined
  }
}

function encodeRegistryLine(input: DecodedRegistryLine, workspaceID?: SpinosaWorkspaceID, presence?: SpinosaWorkspacePresence): string {
  const identityField = workspaceID ? `|${workspaceID}` : presence ? "|" : ""
  return `${registryEscape(input.workspacePath)}|${registryEscape(input.project)}|${input.registered}${identityField}${presence ? `|${presence}` : ""}`
}

function workspaceIDFromMarker(workspacePath: string): SpinosaWorkspaceID | undefined {
  return readWorkspaceID(workspacePath)
}

export async function ensureGlobalMetadata(): Promise<void> {
  const metadataDir = metadataPath()
  mkdirSync(metadataDir, { recursive: true })

  const configPath = path.join(metadataDir, "config.yaml")
  if (!existsSync(configPath)) {
    await Bun.write(configPath, "beta: false\nauto_upgrade: true\n")
  }
}

export async function loadRegistry(
  configPath?: string,
  options?: { allowMissingMarker?: boolean },
): Promise<{ path: string; project: string; workspaceID?: SpinosaWorkspaceID; presence?: SpinosaWorkspacePresence }[]> {
  const registry = configPath ?? metadataPath("workspaces.txt")
  const file = Bun.file(registry)
  if (!(await file.exists())) return []

  const lines = (await file.text()).split(/\r?\n/).filter(Boolean)
  const results: { path: string; project: string; workspaceID?: SpinosaWorkspaceID; presence?: SpinosaWorkspacePresence }[] = []
  const seen = new Set<string>()
  const pathsByID = new Map<SpinosaWorkspaceID, string>()
  const resultIndexByID = new Map<SpinosaWorkspaceID, number>()

  for (const line of lines) {
    const decoded = decodeRegistryLine(line)
    if (!decoded) continue
    const { workspacePath, project } = decoded
    if (!options?.allowMissingMarker && !validateWorkspace(workspacePath)) continue
    if (seen.has(workspacePath)) continue
    seen.add(workspacePath)
    const workspaceID = decoded.workspaceID ?? workspaceIDFromMarker(workspacePath)
    const existingPath = workspaceID ? pathsByID.get(workspaceID) : undefined
    if (workspaceID && existingPath && existingPath !== workspacePath) {
      const existingLive = validateWorkspace(existingPath)
      const currentLive = validateWorkspace(workspacePath)
      if (existingLive && currentLive) {
        throw new Error(`Workspace ID ${workspaceID} maps to multiple live paths`)
      }
      if (!currentLive || existingLive) continue
      const index = resultIndexByID.get(workspaceID)
      if (index !== undefined) {
        results[index] = { path: workspacePath, project, workspaceID }
        pathsByID.set(workspaceID, workspacePath)
        continue
      }
    }
    const result = {
      path: workspacePath,
      project,
      ...(workspaceID ? { workspaceID } : {}),
      ...(decoded.presence ? { presence: decoded.presence } : {}),
    }
    if (workspaceID) {
      pathsByID.set(workspaceID, workspacePath)
      resultIndexByID.set(workspaceID, results.length)
    }
    results.push(result)
  }

  return results
}

export async function registerWorkspace(
  workspacePath: string,
  project: string,
  onRecover?: (msg: string) => void,
  workspaceID?: SpinosaWorkspaceID,
): Promise<void> {
  return withRegistryLock(async () => {
    const registry = metadataPath("workspaces.txt")
    const markerID = workspaceIDFromMarker(workspacePath)
    if (workspaceID && markerID !== workspaceID) {
      throw new Error(`Workspace ID does not match the workspace marker at ${workspacePath}`)
    }
    const canonicalID = workspaceID ?? (validateWorkspace(workspacePath) ? ensureWorkspaceID(workspacePath) : undefined)
    const encodedPath = registryEscape(workspacePath)
    const encodedProject = registryEscape(project)

    await ensureGlobalMetadata()

    await withRegistryFileLock(registry, async () => {
      const file = Bun.file(registry)
      let lines: string[] = []
      if (await file.exists()) {
        const text = await file.text()
        lines = text.split(/\r?\n/).filter(Boolean)
      }

      const filtered = lines.filter((line) => {
        const decoded = decodeRegistryLine(line)
        if (!decoded) return true
        if (decoded.workspacePath === workspacePath) return false
        const existingID = decoded.workspaceID ?? workspaceIDFromMarker(decoded.workspacePath)
        if (canonicalID && existingID === canonicalID) {
          if (validateWorkspace(decoded.workspacePath)) {
            throw new Error(`Workspace ID ${canonicalID} is already registered at ${decoded.workspacePath}`)
          }
          return false
        }
        return true
      })

      const today = new Date().toISOString().slice(0, 10)
      filtered.push(`${encodedPath}|${encodedProject}|${today}${canonicalID ? `|${canonicalID}` : ""}`)
      await writeRegistryAtomically(registry, filtered.join("\n") + "\n")
    }, onRecover)
  })
}

export async function unregisterWorkspace(
  workspacePath: string,
  onRecover?: (msg: string) => void,
): Promise<void> {
  return withRegistryLock(async () => {
    const registry = metadataPath("workspaces.txt")
    await withRegistryFileLock(registry, async () => {
      const file = Bun.file(registry)
      if (!(await file.exists())) return

      const text = await file.text()
      const lines = text.split(/\r?\n/).filter(Boolean)
      const filtered = lines.filter((line) => {
        const rawPath = line.split("|")[0] ?? ""
        return registryUnescape(rawPath) !== workspacePath
      })

      if (filtered.length < lines.length) {
        await writeRegistryAtomically(registry, filtered.join("\n") + (filtered.length > 0 ? "\n" : ""))
      }
    }, onRecover)
  })
}

export async function setWorkspacePresence(input: {
  workspacePath: string
  workspaceID?: SpinosaWorkspaceID
  presence: SpinosaWorkspacePresence
  onRecover?: (msg: string) => void
}): Promise<void> {
  return withRegistryLock(async () => {
    const registry = metadataPath("workspaces.txt")
    await withRegistryFileLock(registry, async () => {
      const file = Bun.file(registry)
      if (!(await file.exists())) return

      const lines = (await file.text()).split(/\r?\n/).filter(Boolean)
      let changed = false
      const updated = lines.map((line) => {
        const decoded = decodeRegistryLine(line)
        if (!decoded) return line
        const existingID = decoded.workspaceID ?? workspaceIDFromMarker(decoded.workspacePath)
        if (decoded.workspacePath !== input.workspacePath && (!input.workspaceID || existingID !== input.workspaceID)) return line
        changed = true
        return encodeRegistryLine(decoded, existingID ?? input.workspaceID, input.presence)
      })
      if (changed) await writeRegistryAtomically(registry, updated.join("\n") + "\n")
    }, input.onRecover)
  })
}

export async function listRegisteredWorkspaces(): Promise<SpinosaRegisteredWorkspace[]> {
  const entries = await loadRegistry(undefined, { allowMissingMarker: true })
  await Promise.all(entries.filter((entry) => validateWorkspace(entry.path)).map((entry) =>
    registerWorkspace(
      entry.path,
      resolveWorkspaceDisplayName(entry.path, entry.project),
      undefined,
      entry.workspaceID,
    ),
  ))
  return entries.map((entry) => ({
    path: entry.path,
    projectName: resolveWorkspaceDisplayName(entry.path, entry.project),
    ...(entry.workspaceID ? { workspaceID: entry.workspaceID } : {}),
    ...(entry.presence ? { presence: entry.presence } : {}),
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

function configuredSearchRoots(roots: string[] = []): string[] {
  const configured = process.env.SPINOSA_WORKSPACE_SEARCH_ROOTS?.split(path.delimiter).filter(Boolean) ?? []
  return [...new Set([...roots, ...configured].map((root) => path.resolve(root)).filter((root) => root !== path.parse(root).root))]
}

/** Finds canonical markers with this exact ID within explicit/configured roots only. */
export function findWorkspaceMatchesByID(workspaceID: SpinosaWorkspaceID, roots: string[] = []): string[] {
  const seen = new Set<string>()
  const results: string[] = []
  for (const root of configuredSearchRoots(roots)) walkWorkspaceIDMarker(root, 0, workspaceID, seen, results)
  return results
}

function walkWorkspaceIDMarker(dir: string, depth: number, workspaceID: SpinosaWorkspaceID, seen: Set<string>, results: string[]) {
  if (depth > 5 || seen.has(dir) || !existsSync(dir)) return
  seen.add(dir)
  if (workspaceIDFromMarker(dir) === workspaceID) results.push(dir)
  if (depth === 5) return
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        walkWorkspaceIDMarker(path.join(dir, entry.name), depth + 1, workspaceID, seen, results)
      }
    }
  } catch {}
}

/** Repairs a stale registry entry only when an ID has one unambiguous marker match. */
export async function recoverWorkspacePathByID(workspaceID: SpinosaWorkspaceID, roots: string[] = []): Promise<string | undefined> {
  const matches = findWorkspaceMatchesByID(workspaceID, roots)
  if (matches.length !== 1) return
  const workspacePath = matches[0]
  await registerWorkspace(workspacePath, resolveWorkspaceDisplayName(workspacePath), undefined, workspaceID)
  return workspacePath
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
  await ensureGlobalMetadata()

  const registryPath = metadataPath("workspaces.txt")
  const registryFile = Bun.file(registryPath)
  if (await registryFile.exists()) {
    const entries = await loadRegistry(registryPath, { allowMissingMarker: true })
    if (entries.length > 0) return entries.map((e) => e.path)
  }

  const cachePath = metadataPath("workspace_cache.txt")
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
