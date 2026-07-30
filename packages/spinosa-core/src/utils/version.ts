import semver from "semver"

export function normalizeFrameworkVersion(value: string | undefined): string {
  return value?.trim().replace(/^v/i, "") ?? ""
}

export function isLegacyDevWorkspaceVersion(value: string | undefined): boolean {
  const normalized = normalizeFrameworkVersion(value).toLowerCase()
  return normalized === "dev" || normalized === "vdev"
}

export function isPrereleaseFrameworkVersion(value: string | undefined): boolean {
  const normalized = normalizeFrameworkVersion(value)
  if (!normalized) return false
  return semver.prerelease(normalized) !== null
}

function coerceComparableVersion(value: string | undefined): string | undefined {
  const normalized = normalizeFrameworkVersion(value)
  if (!normalized || normalized === "unknown") return undefined
  if (isLegacyDevWorkspaceVersion(normalized)) return undefined
  if (!semver.valid(normalized)) return undefined
  return normalized
}

/** Returns -1, 0, or 1 when both sides are comparable semver strings. */
export function compareFrameworkVersions(
  left: string | undefined,
  right: string | undefined,
): number | undefined {
  if (isLegacyDevWorkspaceVersion(left) && isLegacyDevWorkspaceVersion(right)) return 0
  if (isLegacyDevWorkspaceVersion(left)) return -1
  if (isLegacyDevWorkspaceVersion(right)) return 1

  const leftComparable = coerceComparableVersion(left)
  const rightComparable = coerceComparableVersion(right)
  if (!leftComparable || !rightComparable) return undefined

  return semver.compare(leftComparable, rightComparable)
}

export function isUpgrade(current: string | undefined, target: string | undefined): boolean {
  const cmp = compareFrameworkVersions(current, target)
  return cmp !== undefined && cmp < 0
}

export function isSameVersion(current: string | undefined, target: string | undefined): boolean {
  const cmp = compareFrameworkVersions(current, target)
  return cmp === 0
}

export function releaseChannel(version: string | undefined): "stable" | "beta" {
  const normalized = coerceComparableVersion(version)
  if (!normalized) return "stable"
  return semver.prerelease(normalized) ? "beta" : "stable"
}

export function comparePrereleaseTokens(left: string[], right: string[]): number {
  const leftVersion = left.length > 0 ? `0.0.0-${left.join(".")}` : "0.0.0"
  const rightVersion = right.length > 0 ? `0.0.0-${right.join(".")}` : "0.0.0"
  if (!semver.valid(leftVersion) || !semver.valid(rightVersion)) {
    return compareFrameworkVersions(leftVersion, rightVersion) ?? 0
  }
  return semver.compare(leftVersion, rightVersion)
}

export function parseInstallPinnedVersion(installScript: string | undefined): string | undefined {
  if (!installScript) return undefined
  const match = installScript.match(/^PINNED_VERSION="([^"]+)"/m)
  return match?.[1]?.trim()
}

export function resolveBundledFrameworkVersion(
  metadataVersion: string | undefined,
  installScript: string | undefined,
): string | undefined {
  const metadata = metadataVersion?.trim()
  if (metadata && metadata !== "dev") return metadata
  const pinned = parseInstallPinnedVersion(installScript)
  if (pinned === "__VERSION__") return "dev"
  return pinned
}
