/**
 * Canonical binary-distribution contract shared by release, installer tests,
 * and runtime. Do not invent parallel asset-name mappings elsewhere.
 *
 * Design doc: docs/release/binary-distribution-contract.md
 */

export const PRODUCT_BINARY_TARGETS = [
  "darwin-arm64",
  "darwin-x64",
  "linux-arm64",
  "linux-x64",
] as const

export type ProductBinaryTarget = (typeof PRODUCT_BINARY_TARGETS)[number]

export const PRODUCT_DISTRIBUTION = "binary" as const
export type ProductDistribution = typeof PRODUCT_DISTRIBUTION | "source" | "dev"

export const TEMPLATE_PACK_MANIFEST_NAME = "template-pack.json"
export const TEMPLATE_PACK_COMPLETE_MARKER = ".pack-complete"

export const INSTALL_METADATA_KEYS = {
  spinosa: "spinosa",
  lastInstalledVersion: "last_installed_version",
  distribution: "distribution",
  templatePackId: "template_pack_id",
  beta: "beta",
  legacySourceRuntime: "legacy_source_runtime",
  autoUpgrade: "auto_upgrade",
} as const

export const DEPRECATED_INSTALLER_FLAGS = ["--no-bundled-tools"] as const

export const HOME_LAYOUT = {
  binDir: "bin",
  binaryName: "spinosa",
  templatesDir: "templates",
  metadataDir: "metadata",
  configFile: "config.yaml",
  workspacesFile: "workspaces.json",
  logsDir: "logs",
  stagingDir: ".staging",
  legacyVersionsDir: "versions",
  legacyBun: "bin/bun",
  legacyLib: "lib",
  legacyEnv: "env.sh",
} as const

/** Binary uninstall removes these relative paths under SPINOSA_HOME. */
export const BINARY_UNINSTALL_RUNTIME_TARGETS = [
  "bin/spinosa",
  "templates",
  ".staging",
  "logs",
] as const

/** Paths that remain after binary uninstall (never auto-deleted). */
export const PRESERVED_AFTER_UNINSTALL = [
  "metadata",
  "versions",
] as const

export type BuildManifest = {
  product: "spinosa"
  version: string
  channel: "stable" | "beta"
  templatePackId: string
  assets: Record<ProductBinaryTarget, string>
}

export function productBinaryAssetName(target: ProductBinaryTarget): string {
  return `spinosa-${target}`
}

export function buildManifestAssets(): Record<ProductBinaryTarget, string> {
  return Object.fromEntries(
    PRODUCT_BINARY_TARGETS.map((target) => [target, productBinaryAssetName(target)]),
  ) as Record<ProductBinaryTarget, string>
}

export function expectedImmutableReleaseAssets(version: string): readonly string[] {
  void version
  return [
    "install.sh",
    ...PRODUCT_BINARY_TARGETS.map(productBinaryAssetName),
    "checksums.txt",
    "build-manifest.json",
  ]
}

export function expectedChannelReleaseAssets(): readonly string[] {
  return ["install.sh", "checksums.txt"]
}

export function isProductBinaryTarget(value: string): value is ProductBinaryTarget {
  return (PRODUCT_BINARY_TARGETS as readonly string[]).includes(value)
}

/**
 * Map host uname values to a canonical product target.
 * Rejects Windows / musl / unknown arches.
 */
export function resolveProductBinaryTarget(input: {
  os: string
  arch: string
}): ProductBinaryTarget {
  const osRaw = input.os.trim().toLowerCase()
  const archRaw = input.arch.trim().toLowerCase()

  let os: "darwin" | "linux"
  if (osRaw === "darwin" || osRaw === "macos" || osRaw === "osx") os = "darwin"
  else if (osRaw === "linux") os = "linux"
  else throw new Error(`Unsupported OS for binary distribution: ${input.os}`)

  let arch: "arm64" | "x64"
  if (archRaw === "arm64" || archRaw === "aarch64") arch = "arm64"
  else if (archRaw === "x64" || archRaw === "x86_64" || archRaw === "amd64") arch = "x64"
  else throw new Error(`Unsupported architecture for binary distribution: ${input.arch}`)

  const target = `${os}-${arch}` as ProductBinaryTarget
  if (!isProductBinaryTarget(target)) {
    throw new Error(`Unsupported product binary target: ${target}`)
  }
  return target
}

export function templateCacheDirName(version: string, packId: string): string {
  const short = packId.replace(/^sha256:/i, "").slice(0, 12)
  return `${version}-${short}`
}

export function templateCacheRelativePath(version: string, packId: string): string {
  return `${HOME_LAYOUT.templatesDir}/${templateCacheDirName(version, packId)}`
}
