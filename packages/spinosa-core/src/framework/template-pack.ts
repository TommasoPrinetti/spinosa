import { createHash } from "node:crypto"
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  chmodSync,
} from "node:fs"
import path from "node:path"
import { shouldSkipTemplateCopyEntry } from "../utils/fs"
import { resolvePathWithinRoot } from "../utils/path"
import {
  TEMPLATE_PACK_COMPLETE_MARKER,
  TEMPLATE_PACK_MANIFEST_NAME,
} from "../distribution/contract"
import {
  frameworkManifestPath,
  readFrameworkFilesTsv,
  type FrameworkManifestEntry,
} from "./manifest"

export type ManifestFile = {
  relativePath: string
  sourcePath: string
  mode: number
  sha256: string
}

export type TemplatePackManifestEntry = {
  path: string
  sha256: string
  mode: number
}

export type TemplatePackMeta = {
  version: string
  packId: string
  files: TemplatePackManifestEntry[]
}

function sha256Buffer(buf: Buffer | string): string {
  return createHash("sha256").update(buf).digest("hex")
}

function fileMode(sourcePath: string): number {
  const mode = statSync(sourcePath).mode & 0o777
  return mode
}

function walkFiles(root: string, relativeDir: string, out: string[]): void {
  const absDir = relativeDir ? path.join(root, relativeDir) : root
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    if (shouldSkipTemplateCopyEntry(entry.name, entry.isDirectory() || entry.isSymbolicLink())) {
      continue
    }
    const rel = relativeDir ? path.posix.join(relativeDir.replaceAll("\\", "/"), entry.name) : entry.name
    const abs = path.join(absDir, entry.name)
    if (entry.isSymbolicLink()) {
      // Record symlink as a leaf; content hash uses link target text.
      out.push(rel.replaceAll("\\", "/"))
      continue
    }
    if (entry.isDirectory()) {
      walkFiles(root, rel, out)
      continue
    }
    if (entry.isFile()) out.push(rel.replaceAll("\\", "/"))
  }
}

function collectEntryPaths(templateRoot: string, entry: FrameworkManifestEntry): string[] {
  const src = resolvePathWithinRoot(templateRoot, entry.path, "framework manifest path")
  if (!existsSync(src)) return []
  const st = lstatSync(src)
  if (st.isDirectory()) {
    const files: string[] = []
    walkFiles(templateRoot, entry.path.replaceAll("\\", "/"), files)
    return files
  }
  return [entry.path.replaceAll("\\", "/")]
}

/** Pure enumeration of every file reachable through the framework manifest. */
export function listFrameworkManifestFiles(templateRoot: string): ManifestFile[] {
  const manifestPath = frameworkManifestPath(templateRoot)
  if (!existsSync(manifestPath)) {
    throw new Error(`Framework manifest not found: ${manifestPath}`)
  }

  const entries = readFrameworkFilesTsv(manifestPath)
  const relativePaths = new Set<string>()

  // Always include the manifest itself and pack meta when present.
  relativePaths.add(".spinosa/workspace-files.tsv")

  for (const entry of entries) {
    for (const rel of collectEntryPaths(templateRoot, entry)) {
      relativePaths.add(rel)
    }
  }

  // Binary forwarder must be in the pack even if omitted from tsv.
  const forwarder = ".bin/spinosa"
  if (existsSync(path.join(templateRoot, forwarder))) {
    relativePaths.add(forwarder)
  }

  const files: ManifestFile[] = []
  for (const relativePath of [...relativePaths].sort()) {
    if (relativePath === `.spinosa/${TEMPLATE_PACK_MANIFEST_NAME}`) continue
    if (relativePath === `.spinosa/${TEMPLATE_PACK_COMPLETE_MARKER}`) continue
    const sourcePath = resolvePathWithinRoot(templateRoot, relativePath, "framework manifest path")
    if (!existsSync(sourcePath)) continue
    const st = lstatSync(sourcePath)
    if (st.isDirectory()) continue
    let content: Buffer
    if (st.isSymbolicLink()) {
      content = Buffer.from(`symlink:${readlinkSync(sourcePath)}`)
    } else {
      content = readFileSync(sourcePath)
    }
    files.push({
      relativePath,
      sourcePath,
      mode: fileMode(sourcePath),
      sha256: sha256Buffer(content),
    })
  }
  return files
}

export function computeTemplatePackId(files: readonly ManifestFile[]): string {
  const canonical = files
    .map((f) => `${f.relativePath}\0${f.sha256}\0${(f.mode & 0o111) !== 0 ? "x" : "-"}\n`)
    .sort()
    .join("")
  return sha256Buffer(canonical)
}

export function buildTemplatePackMeta(version: string, files: readonly ManifestFile[]): TemplatePackMeta {
  const packId = computeTemplatePackId(files)
  return {
    version,
    packId,
    files: files.map((f) => ({
      path: f.relativePath,
      sha256: f.sha256,
      mode: f.mode,
    })),
  }
}

export function assertSafePackRelativePath(relativePath: string): void {
  resolvePathWithinRoot("/tmp/spinosa-pack-root", relativePath, "template pack path")
}

export function isTemplateCacheComplete(cacheRoot: string, expectedPackId?: string): boolean {
  const marker = path.join(cacheRoot, ".spinosa", TEMPLATE_PACK_COMPLETE_MARKER)
  const metaPath = path.join(cacheRoot, ".spinosa", TEMPLATE_PACK_MANIFEST_NAME)
  if (!existsSync(marker) || !existsSync(metaPath)) return false
  if (!expectedPackId) return true
  try {
    const meta = JSON.parse(readFileSync(metaPath, "utf-8")) as TemplatePackMeta
    return meta.packId === expectedPackId
  } catch {
    return false
  }
}

export function verifyExtractedTemplatePack(
  cacheRoot: string,
  expected: TemplatePackMeta,
  options?: { requireCompleteMarker?: boolean },
): { ok: true } | { ok: false; error: string } {
  const requireMarker = options?.requireCompleteMarker !== false
  if (requireMarker && !isTemplateCacheComplete(cacheRoot, expected.packId)) {
    return { ok: false, error: "template cache incomplete or pack id mismatch" }
  }
  if (!requireMarker) {
    const metaPath = path.join(cacheRoot, ".spinosa", TEMPLATE_PACK_MANIFEST_NAME)
    if (!existsSync(metaPath)) {
      // During extraction, meta may be written just before this call.
    }
  }
  for (const entry of expected.files) {
    try {
      assertSafePackRelativePath(entry.path)
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
    const abs = path.join(cacheRoot, entry.path)
    if (!existsSync(abs)) return { ok: false, error: `missing ${entry.path}` }
    const st = lstatSync(abs)
    if (st.isDirectory()) return { ok: false, error: `expected file: ${entry.path}` }
    const content = st.isSymbolicLink()
      ? Buffer.from(`symlink:${readlinkSync(abs)}`)
      : readFileSync(abs)
    const hash = sha256Buffer(content)
    if (hash !== entry.sha256) return { ok: false, error: `hash mismatch: ${entry.path}` }
    if ((statSync(abs).mode & 0o777) !== (entry.mode & 0o777)) {
      // Soft: modes may differ on some FS; require executable bit match at least.
      const wantExec = (entry.mode & 0o111) !== 0
      const gotExec = (statSync(abs).mode & 0o111) !== 0
      if (wantExec !== gotExec) return { ok: false, error: `mode mismatch: ${entry.path}` }
    }
  }
  return { ok: true }
}

export type EmbeddedPackFile = {
  path: string
  mode: number
  sha256: string
  /** Absolute path to a Bun-embedded file blob, or inline utf8 for tiny scripts. */
  contentPath?: string
  content?: string
}

export type EmbeddedTemplatePack = {
  version: string
  packId: string
  files: EmbeddedPackFile[]
}

/**
 * Atomically extract an embedded pack into cacheRoot.
 * Writes to a sibling temp directory, verifies, then renames into place.
 */
export function extractTemplatePackAtomic(
  pack: EmbeddedTemplatePack,
  cacheRoot: string,
): { ok: true; templateRoot: string } | { ok: false; error: string } {
  const parent = path.dirname(cacheRoot)
  mkdirSync(parent, { recursive: true })
  const staging = `${cacheRoot}.extracting-${process.pid}-${Date.now()}`
  try {
    rmSync(staging, { recursive: true, force: true })
    mkdirSync(staging, { recursive: true })

    for (const file of pack.files) {
      assertSafePackRelativePath(file.path)
      const dest = path.join(staging, file.path)
      mkdirSync(path.dirname(dest), { recursive: true })
      let bytes: Buffer
      if (file.content !== undefined) bytes = Buffer.from(file.content, "utf-8")
      else if (file.contentPath) bytes = readFileSync(file.contentPath)
      else return { ok: false, error: `pack file missing content: ${file.path}` }
      const hash = sha256Buffer(bytes)
      if (hash !== file.sha256) {
        return { ok: false, error: `embedded hash mismatch before write: ${file.path}` }
      }
      writeFileSync(dest, bytes, { mode: file.mode })
      chmodSync(dest, file.mode)
    }

    const meta: TemplatePackMeta = {
      version: pack.version,
      packId: pack.packId,
      files: pack.files.map((f) => ({ path: f.path, sha256: f.sha256, mode: f.mode })),
    }
    const metaDir = path.join(staging, ".spinosa")
    mkdirSync(metaDir, { recursive: true })
    writeFileSync(path.join(metaDir, TEMPLATE_PACK_MANIFEST_NAME), `${JSON.stringify(meta, null, 2)}\n`)

    const verified = verifyExtractedTemplatePack(staging, meta, { requireCompleteMarker: false })
    if (!verified.ok) return verified

    // Completion marker last — partial extracts never look complete.
    writeFileSync(path.join(metaDir, TEMPLATE_PACK_COMPLETE_MARKER), `${pack.packId}\n`)

    rmSync(cacheRoot, { recursive: true, force: true })
    renameSync(staging, cacheRoot)
    return { ok: true, templateRoot: cacheRoot }
  } catch (error) {
    try {
      rmSync(staging, { recursive: true, force: true })
    } catch {
      /* best-effort */
    }
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
