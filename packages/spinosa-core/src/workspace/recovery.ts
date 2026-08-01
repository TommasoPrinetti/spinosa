import { existsSync } from "node:fs"
import { readdir } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"
import { resolveWorkspaceDisplayName } from "../workspace-name"
import { readWorkspaceID, type SpinosaWorkspaceID } from "./identity"
import { registerWorkspace, validateWorkspace } from "./registry"

const DEFAULT_SCAN_DEPTH = 8

/** Directory basenames skipped while walking (privacy + noise). Dot-directories are also skipped. */
export const WORKSPACE_RECOVERY_SKIPPED_DIRECTORIES = [
  "node_modules",
  ".git",
  ".cache",
  ".Trash",
  "Trash",
  "Library",
  "AppData",
  "Application Data",
  "Applications",
  "Movies",
  "Music",
  "Pictures",
  "Caches",
] as const

const SKIPPED_SCAN_DIRECTORIES = new Set<string>(WORKSPACE_RECOVERY_SKIPPED_DIRECTORIES)

export type WorkspaceScanProgress = {
  visited: number
  currentPath: string
}

export type WorkspaceScanResult =
  | { status: "found"; path: string }
  | { status: "not_found" }
  | { status: "ambiguous"; matches: string[] }

export type WorkspaceRecoveryScanPlan = {
  roots: string[]
  maxDepth: number
  skippedDirectoryNames: string[]
  notes: string[]
}

function expandHome(value: string): string {
  const trimmed = value.trim()
  if (trimmed === "~") return homedir()
  if (trimmed.startsWith(`~${path.sep}`)) return path.join(homedir(), trimmed.slice(2))
  return trimmed
}

function configuredRoots(roots: string[]): string[] {
  const configured = process.env.SPINOSA_WORKSPACE_SEARCH_ROOTS?.split(path.delimiter).filter(Boolean) ?? []
  return [...new Set([...roots, ...configured]
    .map((root) => path.resolve(root))
    .filter((root) => root !== path.parse(root).root && existsSync(root)))]
}

/** Common user folders preferred over a blind full-home walk. */
export function preferredWorkspaceRecoveryRoots(home = homedir()): string[] {
  return ["Documents", "Desktop", "Downloads", "Projects", "Developer"]
    .map((name) => path.join(home, name))
}

/**
 * Platform mount roots considered for lost-workspace recovery (before existsSync filter).
 * Darwin: /Volumes. Linux: /mnt, /media, /run/media (udisks removable mounts).
 */
export function platformWorkspaceRecoveryRoots(platform = process.platform): string[] {
  if (platform === "darwin") return ["/Volumes"]
  if (platform === "linux") return ["/mnt", "/media", "/run/media"]
  return []
}

export function defaultWorkspaceRecoveryRoots(indexedPath: string): string[] {
  const home = homedir()
  const roots = [
    path.dirname(indexedPath),
    ...preferredWorkspaceRecoveryRoots(home),
    process.cwd(),
  ]
  // Include home last so common folders are searched first; walk dedupes via seen set.
  roots.push(home)
  roots.push(...platformWorkspaceRecoveryRoots())
  return configuredRoots(roots)
}

export function workspaceRecoveryScanPlan(indexedPath: string, roots?: string[]): WorkspaceRecoveryScanPlan {
  return {
    roots: roots ? configuredRoots(roots) : defaultWorkspaceRecoveryRoots(indexedPath),
    maxDepth: DEFAULT_SCAN_DEPTH,
    skippedDirectoryNames: [...WORKSPACE_RECOVERY_SKIPPED_DIRECTORIES],
    notes: [
      "Local only — nothing is uploaded.",
      "Looks for .spinosa workspace markers matching this workspace ID (not file contents).",
      "Skips dot-directories and bulky/sensitive folders (node_modules, Library, AppData, …).",
      "Add extra roots with SPINOSA_WORKSPACE_SEARCH_ROOTS (path-delimited).",
    ],
  }
}

export function shouldSkipWorkspaceRecoveryDirectory(name: string): boolean {
  return name.startsWith(".") || SKIPPED_SCAN_DIRECTORIES.has(name)
}

export async function findWorkspaceMatchesByIDAsync(input: {
  workspaceID: SpinosaWorkspaceID
  roots: string[]
  signal?: AbortSignal
  maxDepth?: number
  onProgress?: (progress: WorkspaceScanProgress) => void
}): Promise<string[]> {
  const seen = new Set<string>()
  const matches: string[] = []
  const maxDepth = input.maxDepth ?? DEFAULT_SCAN_DEPTH
  let visited = 0

  const walk = async (dir: string, depth: number): Promise<void> => {
    if (input.signal?.aborted) throw new Error("Workspace scan canceled")
    if (depth > maxDepth || seen.has(dir)) return
    seen.add(dir)
    visited++
    input.onProgress?.({ visited, currentPath: dir })

    if (readWorkspaceID(dir) === input.workspaceID) {
      matches.push(dir)
      return
    }
    if (depth === maxDepth) return

    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || shouldSkipWorkspaceRecoveryDirectory(entry.name)) continue
      await walk(path.join(dir, entry.name), depth + 1)
    }
  }

  for (const root of configuredRoots(input.roots)) await walk(root, 0)
  return [...new Set(matches)]
}

export async function recoverWorkspaceAtPath(input: {
  indexedPath: string
  candidatePath: string
  projectName: string
  workspaceID?: SpinosaWorkspaceID
}): Promise<string> {
  const candidatePath = path.resolve(expandHome(input.candidatePath))
  if (!validateWorkspace(candidatePath)) throw new Error("That folder is not a Spinosa workspace.")

  const markerID = readWorkspaceID(candidatePath)
  if (input.workspaceID && markerID && markerID !== input.workspaceID) {
    console.warn(
      `[spinosa:recovery] ID mismatch at ${candidatePath}: expected ${input.workspaceID}, found ${markerID}`,
    )
    throw new Error("That folder belongs to a different workspace ID.")
  }

  await registerWorkspace(
    candidatePath,
    resolveWorkspaceDisplayName(candidatePath, input.projectName),
    undefined,
    input.workspaceID ?? markerID,
    { presence: "present", replacePath: input.indexedPath },
  )
  return candidatePath
}

export async function scanAndRecoverWorkspace(input: {
  indexedPath: string
  projectName: string
  workspaceID: SpinosaWorkspaceID
  roots?: string[]
  signal?: AbortSignal
  onProgress?: (progress: WorkspaceScanProgress) => void
}): Promise<WorkspaceScanResult> {
  const matches = await findWorkspaceMatchesByIDAsync({
    workspaceID: input.workspaceID,
    roots: input.roots ?? defaultWorkspaceRecoveryRoots(input.indexedPath),
    signal: input.signal,
    onProgress: input.onProgress,
  })
  if (matches.length === 0) return { status: "not_found" }
  if (matches.length > 1) return { status: "ambiguous", matches }
  return {
    status: "found",
    path: await recoverWorkspaceAtPath({
      indexedPath: input.indexedPath,
      candidatePath: matches[0]!,
      projectName: input.projectName,
      workspaceID: input.workspaceID,
    }),
  }
}
