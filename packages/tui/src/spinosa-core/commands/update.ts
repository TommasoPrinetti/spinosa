import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
  rmSync,
} from "node:fs"
import { createHash } from "node:crypto"
import path from "node:path"
import { safeCopy, copyDirContents, cleanMacMetadata, isCloudStoragePath } from "../utils/fs"
import { compareFrameworkVersions } from "../utils/version"
import { writeWorkspaceFrameworkVersion } from "../workspace/meta"
import { spinosaLogInfo } from "../utils/log"

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

function frameworkVersion(root: string): string {
  const versionPath = path.join(root, "metadata", "version")
  if (existsSync(versionPath)) {
    return readFileSync(versionPath, "utf-8").trim()
  }
  return "dev"
}

function templateRoot(root: string): string {
  const nested = path.join(root, "workspace-template")
  return existsSync(path.join(nested, ".spinosa", "workspace-files.tsv")) ? nested : root
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
  const content = readFileSync(filePath)
  return createHash("sha256").update(content).digest("hex")
}

export async function updateWorkspace(options: UpdateOptions): Promise<UpdateResult> {
  const { workspacePath, frameworkRoot, dryRun = false, onPhase } = options
  const phase = onPhase ?? ((_p: string, _d: string) => {})
  spinosaLogInfo("update", `workspacePath=${workspacePath} dryRun=${dryRun}`)

  const sourceTemplateRoot = templateRoot(frameworkRoot)
  const fwManifestPath = path.join(sourceTemplateRoot, ".spinosa", "workspace-files.tsv")
  const wsManifestPath = path.join(workspacePath, ".spinosa", "manifest.tsv")

  if (!existsSync(fwManifestPath)) {
    return { success: false, added: 0, updated: 0, removed: 0, skipped: 0, changes: false }
  }

  const fwEntries = readFrameworkFilesTsv(fwManifestPath)
  const wsManifest = readWorkspaceManifest(wsManifestPath)

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

  // Load stored checksums for replace_if_unmodified detection
  const storedChecksums = readFrameworkChecksums(workspacePath)

  const changedPaths: string[] = []
  let added = 0
  let updated = 0
  let removed = 0
  let skipped = 0

  // Phase 1-2: ADD + REPLACE from workspace-files.tsv
  phase("1", `Process ${fwEntries.length} template paths`)
  for (const entry of fwEntries) {
    if (entry.policy === "never_replace" || entry.policy === "exclude_from_update") {
      skipped++
      continue
    }

    const src = path.join(sourceTemplateRoot, entry.path)
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


    // replace_if_unmodified: skip if user modified since last update
    if (entry.policy === "replace_if_unmodified" && srcStat.isFile() && dstStat.isFile()) {
      const storedHash = storedChecksums[entry.path]
      if (storedHash !== undefined) {
        const currentHash = sha256File(dst)
        if (currentHash !== storedHash) {
          skipped++
          continue
        }
      } // no stored hash → first update with tracking → proceed
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

  // ── Generate template file checksums (for next update's replace_if_unmodified) ──
  if (!dryRun) {
    phase("5", "Record file checksums")
    const newChecksums: FrameworkChecksums = {}
    for (const entry of fwEntries) {
      if (entry.role === "user_state" || entry.policy === "exclude_from_update") continue
      const fullPath = path.join(workspacePath, entry.path)
      if (!existsSync(fullPath)) continue
      const s = statSync(fullPath)
      if (s.isFile()) {
        newChecksums[entry.path] = sha256File(fullPath)
      }
    }
    writeFrameworkChecksums(workspacePath, newChecksums)
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
