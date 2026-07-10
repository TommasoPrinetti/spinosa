import {
  existsSync,
  closeSync,
  openSync,
  mkdirSync,
  readSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
  rmSync,
} from "node:fs"
import { createHash } from "node:crypto"
import path from "node:path"
import { safeCopy, copyDirContents, cleanMacMetadata, isCloudStoragePath, shouldSkipTemplateCopyEntry } from "../utils/fs"
import { compareFrameworkVersions } from "../utils/version"
import { writeWorkspaceFrameworkVersion } from "../workspace/meta"
import { readFrameworkVersionFromRoot, resolveTemplateRootFromFrameworkRoot } from "../framework/discovery"
import { spinosaLogInfo, spinosaLogWarn } from "../utils/log"
import { resolvePathWithinRoot } from "../utils/path"

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
    if (filePath === "path" && role === "role") continue
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
    return sha256File(a) === sha256File(b)
  } catch {
    return false
  }
}

// ── Template checksum tracking (replace_if_unmodified enforcement) ─────────

const CHECKSUMS_RELPATH = ".spinosa/framework-checksums.json"

interface FrameworkChecksums {
  [relativePath: string]: string
}

function readFrameworkChecksums(wsPath: string): FrameworkChecksums {
  const p = path.join(wsPath, CHECKSUMS_RELPATH)
  if (!existsSync(p)) return {}
  try {
    return JSON.parse(readFileSync(p, "utf-8"))
  } catch {
    return {}
  }
}

function writeFrameworkChecksums(wsPath: string, checksums: FrameworkChecksums): void {
  const p = path.join(wsPath, CHECKSUMS_RELPATH)
  mkdirSync(path.dirname(p), { recursive: true })
  writeFileSync(p, JSON.stringify(checksums, null, 2) + "\n")
}

function sha256File(filePath: string): string {
  const hash = createHash("sha256")
  const buffer = Buffer.allocUnsafe(1024 * 1024)
  const fd = openSync(filePath, "r")
  try {
    let bytesRead = 0
    while ((bytesRead = readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, bytesRead))
    }
  } finally {
    closeSync(fd)
  }
  return hash.digest("hex")
}

function managedFilesUnder(root: string, relativePath: string): string[] {
  const start = resolvePathWithinRoot(root, relativePath, "framework manifest path")
  if (!existsSync(start)) return []
  const result: string[] = []

  const visit = (absolute: string, relative: string) => {
    const stat = statSync(absolute)
    if (stat.isFile()) {
      result.push(relative)
      return
    }
    if (!stat.isDirectory()) return
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      if (shouldSkipTemplateCopyEntry(entry.name, entry.isDirectory())) continue
      const childRelative = path.join(relative, entry.name)
      const child = resolvePathWithinRoot(root, childRelative, "framework manifest path")
      visit(child, childRelative)
    }
  }

  visit(start, relativePath.replace(/[\\/]$/, ""))
  return result
}

function copyManagedDirectory(
  sourceTemplateRoot: string,
  workspacePath: string,
  entry: FrameworkEntry,
  storedChecksums: FrameworkChecksums,
  force: boolean,
): { changed: boolean; failed: boolean } {
  let changed = false
  let failed = false
  for (const relativeFile of managedFilesUnder(sourceTemplateRoot, entry.path)) {
    const src = resolvePathWithinRoot(sourceTemplateRoot, relativeFile, "framework manifest path")
    const dst = resolvePathWithinRoot(workspacePath, relativeFile, "framework manifest path")
    if (!existsSync(dst)) {
      mkdirSync(path.dirname(dst), { recursive: true })
      if (safeCopy(src, dst)) changed = true
      else failed = true
      continue
    }

    const srcStat = statSync(src)
    const dstStat = statSync(dst)
    if (!srcStat.isFile() || !dstStat.isFile()) {
      failed = true
      continue
    }
    if (filesMatch(src, dst)) continue

    const storedHash = storedChecksums[relativeFile]
    const mayReplace = entry.policy === "always_replace"
      || force
      || (storedHash !== undefined && sha256File(dst) === storedHash)
    if (!mayReplace) continue

    if (safeCopy(src, dst)) changed = true
    else failed = true
  }
  return { changed, failed }
}

export async function updateWorkspace(options: UpdateOptions): Promise<UpdateResult> {
  const { workspacePath, frameworkRoot, dryRun = false, force = false, onPhase } = options
  const phase = onPhase ?? ((_p: string, _d: string) => {})
  spinosaLogInfo("update", `workspacePath=${workspacePath} dryRun=${dryRun}`)

  const sourceTemplateRoot = resolveTemplateRootFromFrameworkRoot(frameworkRoot)
  if (!sourceTemplateRoot) {
    return { success: false, added: 0, updated: 0, removed: 0, skipped: 0, changes: false }
  }
  const fwManifestPath = path.join(sourceTemplateRoot, ".spinosa", "workspace-files.tsv")
  const wsManifestPath = path.join(workspacePath, ".spinosa", "manifest.tsv")

  if (!existsSync(fwManifestPath)) {
    return { success: false, added: 0, updated: 0, removed: 0, skipped: 0, changes: false }
  }

  const fwEntries = readFrameworkFilesTsv(fwManifestPath)
  const wsManifest = readWorkspaceManifest(wsManifestPath)

  for (const entry of fwEntries) {
    resolvePathWithinRoot(sourceTemplateRoot, entry.path, "framework manifest path")
    resolvePathWithinRoot(workspacePath, entry.path, "framework manifest path")
  }
  for (const entry of wsManifest) {
    if (!entry.path || entry.path === "path") continue
    resolvePathWithinRoot(workspacePath, entry.path, "workspace manifest path")
  }

  const installedVersion = readFrameworkVersionFromRoot(frameworkRoot)
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

  // Load stored checksums for replace_if_unmodified detection
  const storedChecksums = readFrameworkChecksums(workspacePath)

  const changedPaths: string[] = []
  let added = 0
  let updated = 0
  let removed = 0
  let skipped = 0
  let hadFailures = false

  // Phase 1-2: ADD + REPLACE from workspace-files.tsv
  phase("1", `Process ${fwEntries.length} template paths`)
  for (const entry of fwEntries) {
    if (entry.policy === "never_replace" || entry.policy === "exclude_from_update") {
      skipped++
      continue
    }

    const src = resolvePathWithinRoot(sourceTemplateRoot, entry.path, "framework manifest path")
    const dst = resolvePathWithinRoot(workspacePath, entry.path, "framework manifest path")

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
        try {
          copyDirContents(src, dst)
        } catch (error) {
          hadFailures = true
          spinosaLogWarn("update", `copy failed: ${entry.path} — ${String(error)}`)
          continue
        }
      } else {
        if (!safeCopy(src, dst)) {
          hadFailures = true
          spinosaLogWarn("update", `copy failed: ${entry.path}`)
          continue
        }
      }
      added++
      changedPaths.push(entry.path)
      continue
    }

    const srcStat = statSync(src)
    const dstStat = statSync(dst)


    // replace_if_unmodified: skip if user modified since last update
    if (entry.policy === "replace_if_unmodified" && srcStat.isFile() && dstStat.isFile() && !force) {
      const storedHash = storedChecksums[entry.path]
      if (storedHash !== undefined) {
        const currentHash = sha256File(dst)
        if (currentHash !== storedHash) {
          skipped++
          continue
        }
      } else if (!filesMatch(src, dst)) {
        skipped++
        continue
      }
    }
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
      const sync = copyManagedDirectory(sourceTemplateRoot, workspacePath, entry, storedChecksums, force)
      if (sync.failed) hadFailures = true
      if (!sync.changed) {
        skipped++
        continue
      }
    } else {
      if (!safeCopy(src, dst)) {
        hadFailures = true
        spinosaLogWarn("update", `copy failed: ${entry.path}`)
        continue
      }
    }
    updated++
    changedPaths.push(entry.path)
  }

  // Phase 3: remove files no longer in framework TSV
  phase("3", "Remove files absent from framework")
  if (manifestHasEntries && !hadFailures) {
    for (const mentry of wsManifest) {
      if (mentry.kind === "dir") continue
      if (!mentry.path || mentry.path === "path") continue
      if (processedPaths.has(mentry.path)) continue
      if (declaredPaths.has(mentry.path)) {
        skipped++
        continue
      }

      const target = resolvePathWithinRoot(workspacePath, mentry.path, "workspace manifest path")
      if (!existsSync(target)) continue

      if (dryRun) {
        removed++
      } else {
        try {
          rmSync(target, { force: true, recursive: true })
          removed++
        } catch (error) {
          hadFailures = true
          spinosaLogWarn("update", `remove failed: ${mentry.path} — ${String(error)}`)
        }
      }
    }
  }

  // Regenerate manifest.tsv
  phase("5", "Regenerate manifest")
  if (!dryRun && !hadFailures) {
    const manifestLines = ["path\tkind"]
    for (const entry of fwEntries) {
      const fullPath = resolvePathWithinRoot(workspacePath, entry.path, "framework manifest path")
      if (!existsSync(fullPath)) continue
      const kind = statSync(fullPath).isDirectory() ? "dir" : "file"
      manifestLines.push(`${entry.path}\t${kind}`)
    }
    mkdirSync(path.dirname(wsManifestPath), { recursive: true })
    writeFileSync(wsManifestPath, manifestLines.join("\n") + "\n", "utf-8")
  }

  // Update workspace metadata
  if (!dryRun && !hadFailures && installedVersion && installedVersion !== "dev") {
    phase("5", "Update framework version")
    await writeWorkspaceFrameworkVersion(workspacePath, installedVersion)
  }

  // Clean macOS metadata (skip on cloud storage, matching bash behavior)
  if (!dryRun && !hadFailures && !isCloudStoragePath(workspacePath)) {
    phase("5", "Clean macOS metadata")
    cleanMacMetadata(workspacePath)
  }

  // ── Generate template file checksums (for next update's replace_if_unmodified) ──
  if (!dryRun && !hadFailures) {
    phase("5", "Record file checksums")
    const newChecksums: FrameworkChecksums = {}
    for (const entry of fwEntries) {
      if (entry.role === "user_state" || entry.policy === "exclude_from_update") continue
      for (const relativeFile of managedFilesUnder(sourceTemplateRoot, entry.path)) {
        const sourceFile = resolvePathWithinRoot(sourceTemplateRoot, relativeFile, "framework manifest path")
        const workspaceFile = resolvePathWithinRoot(workspacePath, relativeFile, "framework manifest path")
        if (!existsSync(workspaceFile)) continue
        if (statSync(sourceFile).isFile() && statSync(workspaceFile).isFile() && filesMatch(sourceFile, workspaceFile)) {
          newChecksums[relativeFile] = sha256File(workspaceFile)
        }
      }
    }
    writeFrameworkChecksums(workspacePath, newChecksums)
  }

  return {
    success: !hadFailures,
    added,
    updated,
    removed,
    skipped,
    changes: added > 0 || updated > 0 || removed > 0,
  }
}
