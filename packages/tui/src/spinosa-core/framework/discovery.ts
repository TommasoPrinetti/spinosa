import { comparePrereleaseTokens } from "../utils/version"

import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

// New layout (post restructure): workspace-template/.spinosa/workspace-files.tsv
const MARKER = path.join("workspace-template", ".spinosa", "workspace-files.tsv")
// Backward compat: old installations before workspace-template restructure
const LEGACY_MARKER = path.join(".spinosa", "workspace-files.tsv")
// Further-back compat: original framework/spinosa/framework-files.tsv
const ANCIENT_MARKER = path.join("framework", "spinosa", "framework-files.tsv")

export function hasFrameworkMarker(root: string): boolean {
  return existsSync(path.join(root, MARKER))
      || existsSync(path.join(root, LEGACY_MARKER))
      || existsSync(path.join(root, ANCIENT_MARKER))
}

function normalizeExistingRoot(root: string): string {
  try {
    return realpathSync(root)
  } catch {
    return root
  }
}

export function resolveTemplateRootFromFrameworkRoot(root: string): string | undefined {
  const nested = path.join(root, "workspace-template")
  if (existsSync(path.join(nested, ".spinosa", "workspace-files.tsv"))) return nested
  if (existsSync(path.join(root, ".spinosa", "workspace-files.tsv"))) return root
  return undefined
}
function compareFrameworkVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [base, ...rest] = v.split("-")
    return { parts: base.split(".").map(Number), pre: rest.join("-") }
  }
  const va = parse(a)
  const vb = parse(b)
  for (let i = 0; i < Math.max(va.parts.length, vb.parts.length); i++) {
    const na = va.parts[i] ?? 0
    const nb = vb.parts[i] ?? 0
    if (na !== nb) return na - nb
  }
  if (!va.pre && vb.pre) return 1
  if (va.pre && !vb.pre) return -1
  const prereleaseResult = comparePrereleaseTokens(
    va.pre ? va.pre.split(".") : [],
    vb.pre ? vb.pre.split(".") : [],
  )
  if (prereleaseResult !== 0) return prereleaseResult
  return 0
}

function discoverInstalledFramework(): string | undefined {
  const versionsDir = path.join(homedir(), ".spinosa", "versions")
  if (!existsSync(versionsDir)) return undefined
  let bestDir = ""
  let bestVersion = ""
  try {
    for (const verEntry of readdirSync(versionsDir, { withFileTypes: true })) {
      if (!verEntry.isDirectory()) continue
      const versionBase = path.join(versionsDir, verEntry.name)
      const ver = verEntry.name
      if (!/^\d/.test(ver)) continue

      // New installer format: framework files directly in the version directory
      if (hasFrameworkMarker(versionBase)) {
        if (!bestDir || compareFrameworkVersions(ver, bestVersion) > 0) {
          bestVersion = ver
          bestDir = versionBase
        }
        continue
      }

      // Old installer format: spinosa-framework-<version>/ subdirectory
      for (const fwEntry of readdirSync(versionBase, { withFileTypes: true })) {
        if (!fwEntry.isDirectory() || !fwEntry.name.startsWith("spinosa-framework-")) continue
        const fwPath = path.join(versionBase, fwEntry.name)
        if (!hasFrameworkMarker(fwPath)) continue
        const fwVer = fwEntry.name.replace("spinosa-framework-", "")
        if (!bestDir || compareFrameworkVersions(fwVer, bestVersion) > 0) {
          bestVersion = fwVer
          bestDir = fwPath
        }
      }
    }
  } catch {
    // ignored — unreadable versions directory
  }
  return bestDir || undefined
}

export function resolveFrameworkRoot(): string | undefined {
  const env = process.env.SPINOSA_TEMPLATE_ROOT ?? process.env.SPINOSA_FRAMEWORK_ROOT
  if (env && hasFrameworkMarker(env)) return normalizeExistingRoot(env)

  const candidates = [
    process.cwd(),
    path.join(homedir(), "Documents", "spinosa-main"),
  ]

  const installed = discoverInstalledFramework()
  if (installed) candidates.push(installed)

  for (const candidate of candidates) {
    if (hasFrameworkMarker(candidate)) return normalizeExistingRoot(candidate)
  }
  return undefined
}
export function resolveFrameworkBin(): string | undefined {
  const root = resolveFrameworkRoot()
  if (!root) return undefined
  const templateRoot = resolveTemplateRootFromFrameworkRoot(root)
  if (!templateRoot) return undefined
  const bin = path.join(templateRoot, ".bin", "spinosa")
  return existsSync(bin) ? bin : undefined
}

export async function readFrameworkFile(relativePath: string): Promise<string | undefined> {
  const root = resolveFrameworkRoot()
  if (!root) return undefined
  const directFile = Bun.file(path.join(root, relativePath))
  if (await directFile.exists()) return directFile.text()

  const templateRoot = resolveTemplateRootFromFrameworkRoot(root)
  if (!templateRoot) return undefined
  const templateFile = Bun.file(path.join(templateRoot, relativePath))
  if (!(await templateFile.exists())) return undefined
  return templateFile.text()
}

export function installedReleaseVersion(frameworkRoot: string | undefined): string {
  if (frameworkRoot) {
    try {
      const versionPath = path.join(frameworkRoot, "metadata", "version")
      if (existsSync(versionPath)) {
        return readFileSync(versionPath, "utf-8").trim()
      }
    } catch {
      // fall through
    }
  }
  const versionsDir = path.join(homedir(), ".spinosa", "versions")
  if (!existsSync(versionsDir)) return ""
  let best = ""
  try {
    for (const entry of readdirSync(versionsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const ver = entry.name
      if (!/^\d/.test(ver)) continue
      const versionPath = path.join(versionsDir, ver)
      if (!existsSync(path.join(versionPath, ".spinosa-install-complete"))) continue
      if (!best || compareFrameworkVersions(ver, best) > 0) {
        best = ver
      }
    }
  } catch {
    // ignore
  }
  return best
}
