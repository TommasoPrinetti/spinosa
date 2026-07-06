import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
  rmSync,
  readdirSync,
  renameSync,
} from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { safeCopy, copyDirContents, cleanMacMetadata, isCloudStoragePath } from "../utils/fs"
import { compareFrameworkVersions } from "../utils/version"
import { writeWorkspaceFrameworkVersion } from "../workspace/meta"

export interface UpdateOptions {
  workspacePath: string
  frameworkRoot: string
  dryRun?: boolean
  force?: boolean
  onPhase?: (phase: string, detail: string) => void
}

export interface UpdateResult {
  success: boolean
  added: number
  updated: number
  removed: number
  skipped: number
  changes: boolean
}

interface FrameworkEntry {
  path: string
  role: string
  policy: string
}

interface ManifestEntry {
  path: string
  kind: string
}

function readFrameworkFilesTsv(tsvPath: string): FrameworkEntry[] {
  const content = readFileSync(tsvPath, "utf-8")
  const entries: FrameworkEntry[] = []
  for (const line of content.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const parts = trimmed.split("\t")
    const filePath = parts[0] ?? ""
    const role = parts[1] ?? ""
    const policy = parts[2] ?? ""
    if (role && !role.startsWith("#")) {
      entries.push({ path: filePath, role, policy })
    }
  }
  return entries
}

function readWorkspaceManifest(manifestPath: string): ManifestEntry[] {
  if (!existsSync(manifestPath)) return []
  const content = readFileSync(manifestPath, "utf-8")
  const entries: ManifestEntry[] = []
  const lines = content.split("\n")
  for (let i = 1; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (!trimmed) continue
    const parts = trimmed.split("\t")
    entries.push({ path: parts[0] ?? "", kind: parts[1] ?? "" })
  }
  return entries
}

function readRetiredFilesTsv(tsvPath: string): string[] {
  if (!existsSync(tsvPath)) return []
  const content = readFileSync(tsvPath, "utf-8")
  const paths: string[] = []
  for (const line of content.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const parts = trimmed.split("\t")
    const relPath = parts[0] ?? ""
    if (relPath && relPath !== "path") {
      paths.push(relPath)
    }
  }
  return paths
}

function frameworkVersion(root: string): string {
  const versionPath = path.join(root, "metadata", "version")
  if (existsSync(versionPath)) {
    return readFileSync(versionPath, "utf-8").trim()
  }
  return "dev"
}

function readWorkspaceFrameworkVersion(workspacePath: string): string | undefined {
  const markerPath = path.join(workspacePath, ".spinosa", "workspace")
  if (!existsSync(markerPath)) return undefined
  const content = readFileSync(markerPath, "utf-8")
  const match = content.match(/^framework_version:\s*(.+)$/m)
  return match?.[1]?.trim()
}

function filesMatch(a: string, b: string): boolean {
  try {
    const sa = statSync(a)
    const sb = statSync(b)
    if (sa.size !== sb.size) return false
    if (!sa.isFile() || !sb.isFile()) return false
    if (sa.size < 1_000_000) {
      const ca = readFileSync(a)
      const cb = readFileSync(b)
      return ca.equals(cb)
    }
    return true
  } catch {
    return false
  }
}

function shouldSyncAgentMirrors(changedPaths: string[]): boolean {
  for (const p of changedPaths) {
    if (p === "AGENTS.md" || p.startsWith(".agents/")) return true
  }
  return false
}

function migrateLegacyLogs(workspacePath: string): void {
  const logsDir = path.join(workspacePath, "logs")
  const dotLogsDir = path.join(workspacePath, ".logs")
  if (!existsSync(logsDir)) return

  if (!existsSync(dotLogsDir)) {
    mkdirSync(dotLogsDir, { recursive: true })
  }
  for (const entry of readdirSync(logsDir)) {
    const src = path.join(logsDir, entry)
    const dst = path.join(dotLogsDir, entry)
    if (!existsSync(dst)) {
      try { renameSync(src, dst) } catch { /* best effort */ }
    }
  }
}

function finalizeLegacyLogs(workspacePath: string): void {
  const logsDir = path.join(workspacePath, "logs")
  if (!existsSync(logsDir)) return
  try {
    const remaining = readdirSync(logsDir)
    const filtered = remaining.filter((n) => n !== ".DS_Store" && !n.startsWith("._"))
    if (filtered.length === 0) {
      rmSync(logsDir, { force: true, recursive: true })
    }
  } catch { /* best effort */ }
}

export async function updateWorkspace(options: UpdateOptions): Promise<UpdateResult> {
  const { workspacePath, frameworkRoot, dryRun = false, onPhase } = options
  const phase = onPhase ?? ((_p: string, _d: string) => {})

  const fwManifestPath = path.join(frameworkRoot, ".spinosa", "framework-files.tsv")
  const retiredManifestPath = path.join(frameworkRoot, ".spinosa", "retired-framework-files.tsv")
  const wsManifestPath = path.join(workspacePath, ".spinosa", "manifest.tsv")

  if (!existsSync(fwManifestPath)) {
    return { success: false, added: 0, updated: 0, removed: 0, skipped: 0, changes: false }
  }

  const fwEntries = readFrameworkFilesTsv(fwManifestPath)
  const wsManifest = readWorkspaceManifest(wsManifestPath)
  const retiredPaths = readRetiredFilesTsv(retiredManifestPath)

  const installedVersion = frameworkVersion(frameworkRoot)
  const workspaceVersion = readWorkspaceFrameworkVersion(workspacePath)

  if (
    installedVersion !== "dev" &&
    workspaceVersion !== undefined &&
    workspaceVersion !== "unknown" &&
    workspaceVersion !== "dev"
  ) {
    const cmp = compareFrameworkVersions(installedVersion, workspaceVersion)
    if (cmp !== undefined && cmp < 0) {
      return { success: false, added: 0, updated: 0, removed: 0, skipped: 0, changes: false }
    }
  }

  const manifestHasEntries = wsManifest.length > 0
  const declaredPaths = new Set(fwEntries.map((e) => e.path))
  const processedPaths = new Set(
    fwEntries.filter((e) => e.role && !e.role.startsWith("#")).map((e) => e.path),
  )

  const changedPaths: string[] = []
  let added = 0
  let updated = 0
  let removed = 0
  let skipped = 0

  // Phase 0: migrate legacy logs/ → .logs/
  phase("0", "Migrate legacy logs to .logs")
  if (!dryRun) {
    migrateLegacyLogs(workspacePath)
  }

  // Phase 1-2: ADD + REPLACE from framework-files.tsv
  phase("1", `Process ${fwEntries.length} framework paths`)
  for (const entry of fwEntries) {
    if (entry.policy === "never_replace" || entry.policy === "exclude_from_update") {
      skipped++
      continue
    }

    const src = path.join(frameworkRoot, entry.path)
    const dst = path.join(workspacePath, entry.path)

    if (!existsSync(src)) {
      skipped++
      continue
    }

    if (!existsSync(dst)) {
      if (dryRun) {
        added++
        changedPaths.push(entry.path)
        continue
      }
      phase("2", `Add ${entry.path}`)
      mkdirSync(path.dirname(dst), { recursive: true })
      const s = statSync(src)
      if (s.isDirectory()) {
        copyDirContents(src, dst)
      } else {
        safeCopy(src, dst)
      }
      added++
      changedPaths.push(entry.path)
      continue
    }

    const srcStat = statSync(src)
    const dstStat = statSync(dst)

    if (srcStat.isFile() && dstStat.isFile() && filesMatch(src, dst)) {
      skipped++
      continue
    }

    if (dryRun) {
      updated++
      changedPaths.push(entry.path)
      continue
    }

    phase("2", `${dstStat.isDirectory() ? "Sync" : "Update"} ${entry.path}`)
    mkdirSync(path.dirname(dst), { recursive: true })
    if (srcStat.isDirectory()) {
      copyDirContents(src, dst)
    } else {
      safeCopy(src, dst)
    }
    updated++
    changedPaths.push(entry.path)
  }

  // Phase 3: remove files no longer in framework TSV
  phase("3", "Remove files absent from framework")
  if (manifestHasEntries) {
    for (const mentry of wsManifest) {
      if (mentry.kind === "dir") continue
      if (!mentry.path || mentry.path === "path") continue
      if (processedPaths.has(mentry.path)) continue
      if (declaredPaths.has(mentry.path)) {
        skipped++
        continue
      }

      const target = path.join(workspacePath, mentry.path)
      if (!existsSync(target)) continue

      if (dryRun) {
        removed++
      } else {
        try {
          rmSync(target, { force: true, recursive: true })
          removed++
        } catch { /* best effort */ }
      }
    }
  }

  // Phase 4: remove retired framework files
  phase("4", "Remove retired framework files")
  for (const relPath of retiredPaths) {
    const target = path.join(workspacePath, relPath)
    if (!existsSync(target)) continue

    if (dryRun) {
      removed++
    } else {
      try {
        rmSync(target, { force: true, recursive: true })
        removed++
      } catch { /* best effort */ }
    }
  }

  // Phase 5: finalize logs migration
  phase("5", "Finalize legacy logs cleanup")
  if (!dryRun) {
    finalizeLegacyLogs(workspacePath)
  }

  // Regenerate manifest.tsv
  phase("5", "Regenerate manifest")
  if (!dryRun) {
    const manifestLines = ["path\tkind"]
    for (const entry of fwEntries) {
      const fullPath = path.join(workspacePath, entry.path)
      if (!existsSync(fullPath)) continue
      const kind = statSync(fullPath).isDirectory() ? "dir" : "file"
      manifestLines.push(`${entry.path}\t${kind}`)
    }
    mkdirSync(path.dirname(wsManifestPath), { recursive: true })
    writeFileSync(wsManifestPath, manifestLines.join("\n") + "\n", "utf-8")
  }

  // Update workspace metadata
  if (!dryRun && installedVersion && installedVersion !== "dev") {
    phase("5", "Update framework version")
    await writeWorkspaceFrameworkVersion(workspacePath, installedVersion)
  }

  // Clean macOS metadata (skip on cloud storage, matching bash behavior)
  if (!dryRun && !isCloudStoragePath(workspacePath)) {
    phase("5", "Clean macOS metadata")
    cleanMacMetadata(workspacePath)
  }

  // Sync agent mirrors if AGENTS.md or .agents/ changed
  if (!dryRun && shouldSyncAgentMirrors(changedPaths)) {
    const syncScript = path.join(workspacePath, ".bin", "sync-agents.sh")
    if (existsSync(syncScript)) {
      phase("5", "Sync agent mirrors")
      spawnSync("bash", [syncScript], { stdio: "ignore" })
    }
  }

  return {
    success: true,
    added,
    updated,
    removed,
    skipped,
    changes: added > 0 || updated > 0 || removed > 0,
  }
}
