import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { copyDirContents, safeCopy } from "../utils/fs"
import { resolvePathWithinRoot } from "../utils/path"

export interface FrameworkManifestEntry {
  path: string
  role: string
  policy: string
}

export function readFrameworkFilesTsv(tsvPath: string): FrameworkManifestEntry[] {
  const content = readFileSync(tsvPath, "utf-8")
  const entries: FrameworkManifestEntry[] = []
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

export function frameworkManifestPath(templateRoot: string): string {
  return path.join(templateRoot, ".spinosa", "workspace-files.tsv")
}

/** Copy only paths declared in workspace-files.tsv from template → workspace. */
export function copyFrameworkManifestPaths(templateRoot: string, workspacePath: string): void {
  const manifestPath = frameworkManifestPath(templateRoot)
  if (!existsSync(manifestPath)) {
    throw new Error(`Framework manifest not found: ${manifestPath}`)
  }

  const entries = readFrameworkFilesTsv(manifestPath)
  for (const entry of entries) {
    const src = resolvePathWithinRoot(templateRoot, entry.path, "framework manifest path")
    const dst = resolvePathWithinRoot(workspacePath, entry.path, "framework manifest path")
    if (!existsSync(src)) continue

    mkdirSync(path.dirname(dst), { recursive: true })
    const srcStat = statSync(src)
    if (srcStat.isDirectory()) {
      copyDirContents(src, dst)
    } else {
      if (!safeCopy(src, dst)) {
        throw new Error(`Failed to copy framework file: ${entry.path}`)
      }
    }
  }
}
