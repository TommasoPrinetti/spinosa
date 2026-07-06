import { existsSync, readFileSync, readdirSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

const MARKER = path.join(".spinosa", "framework-files.tsv")

export function hasFrameworkMarker(root: string): boolean {
  return existsSync(path.join(root, MARKER))
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
  if (va.pre > vb.pre) return 1
  if (va.pre < vb.pre) return -1
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
      for (const fwEntry of readdirSync(versionBase, { withFileTypes: true })) {
        if (!fwEntry.isDirectory() || !fwEntry.name.startsWith("spinosa-framework-")) continue
        const fwPath = path.join(versionBase, fwEntry.name)
        if (!hasFrameworkMarker(fwPath)) continue
        const ver = fwEntry.name.replace("spinosa-framework-", "")
        if (!bestDir || compareFrameworkVersions(ver, bestVersion) > 0) {
          bestVersion = ver
          bestDir = fwPath
        }
      }
    }
  } catch {
    // ignore unreadable versions directory
  }
  return bestDir || undefined
}

export function resolveFrameworkRoot(): string | undefined {
  const env = process.env.SPINOSA_FRAMEWORK_ROOT
  if (env && hasFrameworkMarker(env)) return env

  const candidates = [
    path.resolve(process.cwd(), "framework"),
    path.resolve(process.cwd(), "..", "spinosa-main"),
    path.join(homedir(), "Documents", "spinosa-main"),
  ]

  const installed = discoverInstalledFramework()
  if (installed) candidates.push(installed)

  for (const candidate of candidates) {
    if (hasFrameworkMarker(candidate)) return candidate
  }

  return undefined
}

export function resolveFrameworkBin(): string | undefined {
  const root = resolveFrameworkRoot()
  if (!root) return undefined
  const bin = path.join(root, ".bin", "spinosa")
  return existsSync(bin) ? bin : undefined
}

export async function readFrameworkFile(relativePath: string): Promise<string | undefined> {
  const root = resolveFrameworkRoot()
  if (!root) return undefined
  const file = Bun.file(path.join(root, relativePath))
  if (!(await file.exists())) return undefined
  return file.text()
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
