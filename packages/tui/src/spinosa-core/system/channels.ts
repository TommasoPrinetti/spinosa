import { homedir } from "node:os"
import { mkdirSync } from "node:fs"
import { parseInstallPinnedVersion, isPrereleaseFrameworkVersion } from "../utils/version"

export type ReleaseChannel = "stable" | "beta"

const SPINOSA_STABLE_INSTALL_URL =
  process.env.SPINOSA_STABLE_INSTALL_URL ??
  "https://github.com/TommasoPrinetti/spinosa/raw/stable/install.sh"

const SPINOSA_BETA_INSTALL_URL =
  process.env.SPINOSA_BETA_INSTALL_URL ??
  "https://github.com/TommasoPrinetti/spinosa/raw/beta/install.sh"


const SPINOSA_RELEASE_REPO =
  process.env.SPINOSA_RELEASE_REPO ?? "TommasoPrinetti/spinosa"
const FETCH_TIMEOUT_MS = 10_000

export function spinosaConfigFile(): string {
  const home = process.env.SPINOSA_HOME ?? `${homedir()}/.spinosa`
  return `${home}/metadata/config.yaml`
}

export function spinosaBetaToggleChannel(value: string): ReleaseChannel {
  const clean = value.replace(/["']/g, "")
  switch (clean) {
    case "true":
    case "yes":
    case "on":
    case "1":
      return "beta"
    case "false":
    case "no":
    case "off":
    case "0":
      return "stable"
    default:
      throw new Error(`Invalid beta config value: ${value} (use true or false)`)
  }
}

export async function readConfigValue(path: string, key: string): Promise<string | undefined> {
  const file = Bun.file(path)
  if (!(await file.exists())) return undefined
  const text = await file.text()
  const match = text.match(new RegExp(`^${key}:\\s*(.+)$`, "m"))
  return match?.[1]?.trim()
}

export async function spinosaReleaseChannel(): Promise<ReleaseChannel> {
  const envChannel = process.env.SPINOSA_RELEASE_CHANNEL
  if (envChannel) {
    return normalizeChannel(envChannel)
  }

  const configPath = spinosaConfigFile()
  const betaToggle = await readConfigValue(configPath, "beta")
  if (betaToggle) {
    return spinosaBetaToggleChannel(betaToggle)
  }

  const releaseChannel = await readConfigValue(configPath, "release_channel")
  return normalizeChannel(releaseChannel ?? "stable")
}

function normalizeChannel(ch: string): ReleaseChannel {
  const clean = ch.replace(/["']/g, "")
  switch (clean) {
    case "stable":
      return "stable"
    case "beta":
      return "beta"
    case "dev":
      return "beta"
    default:
      throw new Error(`Invalid release channel: ${clean} (use stable or beta)`)
  }
}

export async function setConfigKey(
  configPath: string,
  key: string,
  value: string,
): Promise<void> {
  const file = Bun.file(configPath)
  let text = (await file.exists()) ? await file.text() : ""

  const regex = new RegExp(`^${key}:.*`, "m")
  if (regex.test(text)) {
    text = text.replace(regex, `${key}: ${value}`)
  } else {
    text += `\n${key}: ${value}\n`
  }

  await Bun.write(configPath, text)
}

export async function deleteConfigKey(
  configPath: string,
  key: string,
): Promise<void> {
  const file = Bun.file(configPath)
  if (!(await file.exists())) return

  let text = await file.text()
  const regex = new RegExp(`^${key}:.*\\n?`, "m")
  text = text.replace(regex, "")
  await Bun.write(configPath, text)
}

export async function setReleaseChannel(channel: ReleaseChannel): Promise<void> {
  const configDir = process.env.SPINOSA_METADATA_DIR ??
    `${process.env.SPINOSA_HOME ?? `${homedir()}/.spinosa`}/metadata`
  const configPath = `${configDir}/config.yaml`
  const betaValue = channel === "beta" ? "true" : "false"

  mkdirSync(configDir, { recursive: true })

  const file = Bun.file(configPath)
  if (!(await file.exists())) {
    await Bun.write(configPath, `beta: ${betaValue}\n`)
    return
  }

  await setConfigKey(configPath, "beta", betaValue)
  await deleteConfigKey(configPath, "release_channel")
}

export async function resolvePinnedVersionFromInstaller(
  channel: ReleaseChannel,
  url: string,
): Promise<string | undefined> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(url, { signal: controller.signal })
  } catch {
    return undefined
  } finally {
    clearTimeout(timer)
  }
  if (!response.ok) return undefined
  const script = await response.text()
  const version = parseInstallPinnedVersion(script)
  return version ?? undefined
}

export async function resolveLatestStableVersion(): Promise<string | undefined> {
  return resolvePinnedVersionFromInstaller("stable", SPINOSA_STABLE_INSTALL_URL)
}

export async function resolveLatestBetaVersion(): Promise<string | undefined> {
  return resolvePinnedVersionFromInstaller("beta", SPINOSA_BETA_INSTALL_URL)
}

export async function resolveReleaseVersionForChannel(
  channel: ReleaseChannel,
): Promise<string | undefined> {
  switch (channel) {
    case "stable":
      return resolveLatestStableVersion()
    case "beta":
      return resolveLatestBetaVersion()
  }
}

export function installUrlForChannel(
  channel: ReleaseChannel,
  version?: string,
): string {
  if (version && version !== "latest") {
    return `https://github.com/${SPINOSA_RELEASE_REPO}/releases/download/v${version}/install.sh`
  }
  return channel === "stable" ? SPINOSA_STABLE_INSTALL_URL : SPINOSA_BETA_INSTALL_URL
}

export function isPrereleaseVersion(version: string): boolean {
  return isPrereleaseFrameworkVersion(version)
}
