export function normalizeFrameworkVersion(value: string | undefined): string {
  return value?.trim().replace(/^v/i, "") ?? ""
}

export function isLegacyDevWorkspaceVersion(value: string | undefined): boolean {
  const normalized = normalizeFrameworkVersion(value).toLowerCase()
  return normalized === "dev" || normalized === "vdev"
}

export function isPrereleaseFrameworkVersion(value: string | undefined): boolean {
  const normalized = normalizeFrameworkVersion(value)
  return /^\d+\.\d+\.\d+-.+$/.test(normalized)
}

export function compareFrameworkVersions(
  left: string | undefined,
  right: string | undefined,
): number | undefined {
  if (isLegacyDevWorkspaceVersion(left) && isLegacyDevWorkspaceVersion(right)) return 0
  if (isLegacyDevWorkspaceVersion(left)) return -1
  if (isLegacyDevWorkspaceVersion(right)) return 1

  const leftParsed = parseComparableFrameworkVersion(left)
  const rightParsed = parseComparableFrameworkVersion(right)
  if (!leftParsed || !rightParsed) return

  const maxCore = Math.max(leftParsed.core.length, rightParsed.core.length)
  for (let index = 0; index < maxCore; index++) {
    const leftValue = leftParsed.core[index] ?? 0
    const rightValue = rightParsed.core[index] ?? 0
    if (leftValue > rightValue) return 1
    if (leftValue < rightValue) return -1
  }

  if (leftParsed.prerelease.length === 0 && rightParsed.prerelease.length > 0) return 1
  if (leftParsed.prerelease.length > 0 && rightParsed.prerelease.length === 0) return -1
  if (leftParsed.prerelease.length > 0 && rightParsed.prerelease.length > 0) {
    return comparePrereleaseTokens(leftParsed.prerelease, rightParsed.prerelease)
  }
  return 0
}

function parseComparableFrameworkVersion(
  value: string | undefined,
): { core: number[]; prerelease: string[] } | undefined {
  if (!value) return
  const normalized = normalizeFrameworkVersion(value)
  if (!normalized || normalized === "unknown" || normalized.toLowerCase() === "dev") return

  const [base, ...rest] = normalized.split("-")
  const prerelease = rest.join("-").split(".").filter(Boolean)
  const coreTokens = base.split(".")
  if (coreTokens.length === 0 || coreTokens.some((part) => !/^\d+$/.test(part))) return

  return {
    core: coreTokens.map((part) => Number.parseInt(part, 10)),
    prerelease,
  }
}

export function comparePrereleaseTokens(left: string[], right: string[]): number {
  const max = Math.max(left.length, right.length)
  for (let index = 0; index < max; index++) {
    const leftToken = left[index] ?? ""
    const rightToken = right[index] ?? ""
    if (leftToken === rightToken) continue
    if (!leftToken) return -1
    if (!rightToken) return 1

    const leftNumeric = /^\d+$/.test(leftToken) ? Number.parseInt(leftToken, 10) : undefined
    const rightNumeric = /^\d+$/.test(rightToken) ? Number.parseInt(rightToken, 10) : undefined
    if (leftNumeric !== undefined && rightNumeric !== undefined) {
      if (leftNumeric > rightNumeric) return 1
      if (leftNumeric < rightNumeric) return -1
      continue
    }
    if (leftNumeric !== undefined) return -1
    if (rightNumeric !== undefined) return 1
    if (leftToken > rightToken) return 1
    if (leftToken < rightToken) return -1
  }
  return 0
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
  return parseInstallPinnedVersion(installScript)
}
