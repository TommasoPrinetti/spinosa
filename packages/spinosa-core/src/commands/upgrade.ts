import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { homedir } from "node:os"
import path from "node:path"
import {
  type ReleaseChannel,
  installUrlForChannel,
  resolveReleaseVersionForChannel,
  setReleaseChannel,
  spinosaReleaseChannel,
} from "../system/channels"
import { installedReleaseVersion, resolveFrameworkRoot } from "../framework/discovery"
import { compareFrameworkVersions } from "../utils/version"
import { ensureGlobalMetadata, discoverRegisteredWorkspaces } from "../workspace/registry"
import { readWorkspaceMeta } from "../workspace/meta"
import { spinosaLogInfo } from "../utils/log"

export interface UpgradeOptions {
  version?: string
  channel?: ReleaseChannel
  reinstall?: boolean
  yes?: boolean
  onPhase?: (phase: string, detail: string) => void
}

export interface UpgradeResult {
  success: boolean
  previousVersion?: string
  newVersion?: string
  workspaceUpgradesNeeded: string[]
}

export interface AutoUpgradeResult {
  available: boolean
  currentVersion?: string
  latestVersion?: string
}

interface VersionCache {
  timestamp: number
  version: string
  skipUntil: number
}

const SPINOSA_RELEASE_REPO: string =
  process.env.SPINOSA_RELEASE_REPO ?? "TommasoPrinetti/spinosa"

function spinosaHome(): string {
  return process.env.SPINOSA_HOME ?? `${homedir()}/.spinosa`
}

function metadataDir(): string {
  return process.env.SPINOSA_METADATA_DIR ?? `${spinosaHome()}/metadata`
}

function versionCachePath(channel: string): string {
  return path.join(metadataDir(), `version_check_cache_${channel}`)
}

async function readConfigValue(key: string): Promise<string | undefined> {
  const configPath = path.join(metadataDir(), "config.yaml")
  if (!existsSync(configPath)) return undefined
  const text = readFileSync(configPath, "utf-8")
  const match = text.match(new RegExp(`^${key}:\\s*(.+)$`, "m"))
  return match?.[1]?.trim()
}

async function fetchReleaseNotes(version: string): Promise<string | undefined> {
  const apiUrl =
    version === "latest"
      ? `https://api.github.com/repos/${SPINOSA_RELEASE_REPO}/releases/latest`
      : `https://api.github.com/repos/${SPINOSA_RELEASE_REPO}/releases/tags/v${version}`
  try {
    const response = await fetch(apiUrl)
    if (!response.ok) return undefined
    const data = (await response.json()) as {
      tag_name?: string
      published_at?: string
      body?: string
    }
    const tag = data.tag_name ?? ""
    const published = (data.published_at ?? "").replace("T", " ").replace("Z", "")
    const body = data.body ?? ""
    return `${tag}|${published}|${body}`
  } catch {
    return undefined
  }
}

export function readVersionCache(
  channel: string,
): VersionCache | undefined {
  const cachePath = versionCachePath(channel)
  if (!existsSync(cachePath)) return undefined
  try {
    const lines = readFileSync(cachePath, "utf-8").split(/\r?\n/)
    if (lines.length < 3) return undefined
    return {
      timestamp: Number(lines[0]) || 0,
      version: lines[1]?.trim() ?? "",
      skipUntil: Number(lines[2]) || 0,
    }
  } catch {
    return undefined
  }
}

export function writeVersionCache(
  channel: string,
  version: string,
  skipUntil: number,
): void {
  const cachePath = versionCachePath(channel)
  mkdirSync(path.dirname(cachePath), { recursive: true })
  const now = Math.floor(Date.now() / 1000)
  writeFileSync(cachePath, `${now}\n${version}\n${skipUntil}\n${channel}\n`)
}

export async function upgradeFramework(
  options: UpgradeOptions,
): Promise<UpgradeResult> {
  const explicitChannel = !!options.channel
  spinosaLogInfo("upgrade", `channel=${options.channel ?? "default"} version=${options.version ?? "latest"} reinstall=${options.reinstall}`)
  const channel = options.channel ?? (await spinosaReleaseChannel())

  if (explicitChannel) {
    await setReleaseChannel(channel)
  }

  options.onPhase?.("channel", `Channel: ${channel}`)

  let resolvedVersion: string
  if (options.version && options.version !== "latest") {
    resolvedVersion = options.version
  } else {
    options.onPhase?.("resolve", `Resolving latest ${channel} version`)
    const latest = await resolveReleaseVersionForChannel(channel)
    if (!latest) {
      return { success: false, workspaceUpgradesNeeded: [] }
    }
    resolvedVersion = latest
  }

  options.onPhase?.("resolve", `Target version: v${resolvedVersion}`)

  const fwRoot = resolveFrameworkRoot()
  const installedVersion = installedReleaseVersion(fwRoot)
  const normalizedInstalled =
    installedVersion === "dev" || !installedVersion ? "" : installedVersion

  if (!options.reinstall && normalizedInstalled && normalizedInstalled === resolvedVersion) {
    return {
      success: true,
      previousVersion: normalizedInstalled,
      newVersion: normalizedInstalled,
      workspaceUpgradesNeeded: [],
    }
  }

  if (!options.yes) {
    options.onPhase?.("release_notes", "Fetching release notes")
    const releaseData = await fetchReleaseNotes(resolvedVersion)
    if (releaseData) {
      options.onPhase?.("release_notes", `Release: ${releaseData}`)
    } else {
      options.onPhase?.("release_notes", "Could not fetch release notes")
    }
    options.onPhase?.("confirm", "Awaiting confirmation")
  }

  options.onPhase?.("download", `Downloading installer v${resolvedVersion} (${channel})`)

  const installerUrl = installUrlForChannel(channel, options.version ?? "latest")

  const tmpdir = mkdtempSync(path.join(homedir(), "spinosa-upgrade-"))
  const installerPath = path.join(tmpdir, "install-spinosa.sh")

  const response = await fetch(installerUrl)
  if (!response.ok) {
    rmSync(tmpdir, { recursive: true, force: true })
    return {
      success: false,
      previousVersion: normalizedInstalled || undefined,
      workspaceUpgradesNeeded: [],
    }
  }

  const installerScript = await response.text()
  writeFileSync(installerPath, installerScript, { mode: 0o755 })

  options.onPhase?.("install", "Running installer...")

  const upgradeArgs = ["--upgrade", "--version", resolvedVersion, "--no-launch"]
  if (options.yes) upgradeArgs.push("--yes")
  if (options.reinstall) upgradeArgs.push("--reinstall")

  const result = spawnSync("bash", [installerPath, ...upgradeArgs], {
    stdio: "inherit",
  })
  if (result.status !== 0) {
    rmSync(tmpdir, { recursive: true, force: true })
    return {
      success: false,
      previousVersion: normalizedInstalled || undefined,
      workspaceUpgradesNeeded: [],
    }
  }

  const cacheDir = metadataDir()
  if (existsSync(cacheDir)) {
    for (const entry of readdirSync(cacheDir)) {
      if (entry.startsWith("version_check_cache")) {
        rmSync(path.join(cacheDir, entry), { force: true })
      }
    }
  }
  rmSync(tmpdir, { recursive: true, force: true })

  const postInstallVersion = installedReleaseVersion(resolveFrameworkRoot())
  if (postInstallVersion !== resolvedVersion) {
    return {
      success: false,
      previousVersion: normalizedInstalled || undefined,
      newVersion: postInstallVersion || undefined,
      workspaceUpgradesNeeded: [],
    }
  }

  const workspaces = await discoverRegisteredWorkspaces()
  const needsUpdate: string[] = []
  for (const ws of workspaces) {
    const meta = await readWorkspaceMeta(ws)
    if (
      meta &&
      meta.frameworkVersion &&
      meta.frameworkVersion !== "unknown" &&
      meta.frameworkVersion !== resolvedVersion
    ) {
      needsUpdate.push(ws)
    }
  }

  return {
    success: true,
    previousVersion: normalizedInstalled || undefined,
    newVersion: resolvedVersion,
    workspaceUpgradesNeeded: needsUpdate,
  }
}

export async function checkUpgradeAvailable(): Promise<AutoUpgradeResult> {
  spinosaLogInfo("upgrade", "checkUpgradeAvailable start")
  if (process.env.SPINOSA_NO_UPGRADE_CHECK === "1") {
  }

  const autoUpgrade = await readConfigValue("auto_upgrade")
  if (autoUpgrade === "false") {
    return { available: false }
  }

  if (!process.stdin.isTTY) {
    return { available: false }
  }

  const fwRoot = resolveFrameworkRoot()
  const installedVersion = installedReleaseVersion(fwRoot)
  if (installedVersion === "dev" || !installedVersion) {
    return { available: false }
  }

  ensureGlobalMetadata()

  const channel = await spinosaReleaseChannel()
  const now = Math.floor(Date.now() / 1000)

  const cache = readVersionCache(channel)
  if (cache) {
    const cmp = compareFrameworkVersions(installedVersion, cache.version)
    if (cmp !== undefined && cmp >= 0) {
      if (cmp > 0) {
        rmSync(versionCachePath(channel), { force: true })
      } else if (now < cache.skipUntil) {
        return { available: false }
      }
    } else {
      rmSync(versionCachePath(channel), { force: true })
    }
  }

  let latest: string | undefined
  try {
    latest = await resolveReleaseVersionForChannel(channel)
  } catch {
    return { available: false }
  }
  if (!latest) {
    return { available: false }
  }

  const latestCmp = compareFrameworkVersions(latest, installedVersion)
  const available = latestCmp !== undefined && latestCmp > 0

  // Cache: no-upgrade skips re-check for 1h (matches bash behavior pattern)
  const skipUntil = available ? 0 : Math.floor(Date.now() / 1000) + 3600
  writeVersionCache(channel, latest, skipUntil)

  return {
    available,
    currentVersion: installedVersion,
    latestVersion: available ? latest : undefined,
  }
}
