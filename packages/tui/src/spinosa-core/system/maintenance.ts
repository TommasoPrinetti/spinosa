import { type Dirent } from "node:fs"
import { readdir, rm, stat } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"
import { resolveFrameworkRoot } from "../framework/discovery"

const STALE_INSTALL_DIRECTORY = /^\.\d[\w.+-]*\.(?:staging|backup)\.(\d+)$/
export const MIN_STALE_INSTALL_AGE_MS = 60 * 60 * 1000

export type SpinosaMaintenanceStatus = {
  installInProgress: boolean
  staleInstallDirectories: string[]
  staleNodeModulesDirectories: number
  dependencyRepairRequired: boolean
}

export type SpinosaCleanupResult = SpinosaMaintenanceStatus & {
  removedDirectories: string[]
}

function spinosaHome(): string {
  return process.env.SPINOSA_HOME ?? path.join(homedir(), ".spinosa")
}

async function exists(target: string): Promise<boolean> {
  try {
    await stat(target)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false
    throw error
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return code !== "ESRCH"
  }
}

async function findStaleInstallerDirectories(versionsDir: string, now: number): Promise<string[]> {
  let entries: Dirent[]
  try {
    entries = await readdir(versionsDir, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
    throw error
  }

  const stale: string[] = []
  for (const entry of entries) {
    const match = entry.isDirectory() ? STALE_INSTALL_DIRECTORY.exec(entry.name) : undefined
    if (!match) continue
    const pid = Number.parseInt(match[1]!, 10)
    const candidate = path.join(versionsDir, entry.name)
    const info = await stat(candidate)
    if (now - info.mtimeMs < MIN_STALE_INSTALL_AGE_MS || isProcessAlive(pid)) continue
    stale.push(candidate)
  }
  return stale
}

function isInstalledRelease(frameworkRoot: string | undefined, versionsDir: string): boolean {
  if (!frameworkRoot) return false
  const relative = path.relative(versionsDir, frameworkRoot)
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
}

export async function inspectSpinosaMaintenance(input: {
  home?: string
  frameworkRoot?: string
  now?: number
} = {}): Promise<SpinosaMaintenanceStatus> {
  const home = input.home ?? spinosaHome()
  const versionsDir = path.join(home, "versions")
  const frameworkRoot = input.frameworkRoot ?? resolveFrameworkRoot()
  const installInProgress = await exists(path.join(versionsDir, ".install.lock"))
  const staleInstallDirectories = installInProgress
    ? []
    : await findStaleInstallerDirectories(versionsDir, input.now ?? Date.now())
  const staleNodeModulesDirectories = (
    await Promise.all(staleInstallDirectories.map((directory) => exists(path.join(directory, "node_modules"))))
  ).filter(Boolean).length
  const dependencyRepairRequired =
    isInstalledRelease(frameworkRoot, versionsDir) && !(await exists(path.join(frameworkRoot!, "node_modules")))

  return {
    installInProgress,
    staleInstallDirectories,
    staleNodeModulesDirectories,
    dependencyRepairRequired,
  }
}

export async function cleanupStaleInstallDirectories(input: {
  home?: string
  frameworkRoot?: string
  now?: number
} = {}): Promise<SpinosaCleanupResult> {
  const status = await inspectSpinosaMaintenance(input)
  if (status.installInProgress) return { ...status, removedDirectories: [] }

  for (const directory of status.staleInstallDirectories) {
    await rm(directory, { recursive: true, force: true, maxRetries: 2 })
  }
  return { ...status, removedDirectories: status.staleInstallDirectories }
}
