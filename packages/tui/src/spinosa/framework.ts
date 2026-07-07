import { existsSync, readdirSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { compareFrameworkVersions } from "@opencode-ai/spinosa-core/utils/version"
const MARKER = path.join(".spinosa", "framework-files.tsv")

function hasFrameworkMarker(root: string) {
  return existsSync(path.join(root, MARKER))
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
        if (!bestDir || (compareFrameworkVersions(ver, bestVersion) ?? 0) > 0) {
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

  const installed = discoverInstalledFramework()

  const candidates = [
    path.resolve(process.cwd(), "framework"),
    path.resolve(process.cwd(), "..", "spinosa-main"),
    path.join(homedir(), "Documents", "spinosa-main"),
  ]

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

export async function readFrameworkFile(relativePath: string) {
  const root = resolveFrameworkRoot()
  if (!root) return undefined
  const file = Bun.file(path.join(root, relativePath))
  if (!(await file.exists())) return undefined
  return file.text()
}