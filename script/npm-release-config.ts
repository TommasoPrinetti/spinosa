export type KernelReleaseTarget = {
  os: string
  arch: "arm64" | "x64"
  abi?: "musl"
  avx2?: false
}

export const PRODUCT_PACKAGE_MANIFESTS = [
  "packages/spinosa-kernel/package.json",
  "packages/spinosa-cli/package.json",
  "packages/spinosa-core/package.json",
  "packages/spinosa-runtime/package.json",
  "packages/spinosa-harness/package.json",
]

export const KERNEL_RELEASE_TARGETS: KernelReleaseTarget[] = [
  { os: "darwin", arch: "arm64" },
  { os: "darwin", arch: "x64" },
  { os: "darwin", arch: "x64", avx2: false },
  { os: "linux", arch: "arm64" },
  { os: "linux", arch: "x64" },
  { os: "linux", arch: "x64", avx2: false },
  { os: "linux", arch: "arm64", abi: "musl" },
  { os: "linux", arch: "x64", abi: "musl" },
  { os: "linux", arch: "x64", abi: "musl", avx2: false },
]

export function platformPackageName(baseName: string, target: KernelReleaseTarget) {
  return [baseName, target.os, target.arch, target.avx2 === false ? "baseline" : undefined, target.abi].filter(Boolean).join("-")
}

export const APPROVED_PUBLISH_PACKAGES = [
  "@spinosa/kernel",
  ...KERNEL_RELEASE_TARGETS.map((target) => platformPackageName("@spinosa/kernel", target)),
]

export const NPM_PACKAGE_METADATA = {
  license: "MIT",
  repository: {
    type: "git",
    url: "git+https://github.com/medialab/spinosa.git",
  },
  homepage: "https://github.com/medialab/spinosa#readme",
  bugs: {
    url: "https://github.com/medialab/spinosa/issues",
  },
  publishConfig: {
    access: "public",
  },
} as const

export function createPlatformPackageManifest(baseName: string, version: string, target: KernelReleaseTarget) {
  const name = platformPackageName(baseName, target)
  return {
    name,
    version,
    description: `Spinosa kernel binary for ${target.os} ${target.arch}${target.avx2 === false ? " baseline" : ""}${target.abi ? ` ${target.abi}` : ""}`,
    ...NPM_PACKAGE_METADATA,
    preferUnplugged: true,
    files: ["bin", "README.md", "LICENSE"],
    os: [target.os],
    cpu: [target.arch],
    ...(target.abi ? { libc: [target.abi] } : {}),
  }
}

export function createKernelPackageManifest(version: string, optionalDependencies: Record<string, string>) {
  return {
    name: "@spinosa/kernel",
    version,
    description: "Spinosa AI coding agent",
    ...NPM_PACKAGE_METADATA,
    type: "module",
    bin: {
      spinosa: "./bin/spinosa",
    },
    files: ["bin", "README.md", "LICENSE"],
    os: ["darwin", "linux"],
    cpu: ["arm64", "x64"],
    optionalDependencies,
  }
}

export function publishManifestErrors(manifest: Record<string, any>, expectedVersion: string) {
  const errors: string[] = []
  if (!APPROVED_PUBLISH_PACKAGES.includes(manifest.name)) errors.push(`unexpected package name ${manifest.name}`)
  if (manifest.version !== expectedVersion) errors.push(`version ${manifest.version} does not match ${expectedVersion}`)
  if (manifest.private === true) errors.push("published manifest must not be private")
  if (Object.prototype.hasOwnProperty.call(manifest.scripts ?? {}, "postinstall")) {
    errors.push("published manifest must not define a postinstall script")
  }
  if (manifest.publishConfig?.access !== "public") errors.push("publishConfig.access must be public")
  if (manifest.license !== NPM_PACKAGE_METADATA.license) errors.push("license must be MIT")
  if (manifest.repository?.url !== NPM_PACKAGE_METADATA.repository.url) errors.push("repository must point to medialab/spinosa")
  if (manifest.homepage !== NPM_PACKAGE_METADATA.homepage) errors.push("homepage must point to medialab/spinosa")
  if (manifest.bugs?.url !== NPM_PACKAGE_METADATA.bugs.url) errors.push("bugs must point to medialab/spinosa")
  if (!Array.isArray(manifest.files) || !manifest.files.includes("README.md") || !manifest.files.includes("LICENSE")) {
    errors.push("files must explicitly include README.md and LICENSE")
  }

  for (const section of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    for (const [name, value] of Object.entries(manifest[section] ?? {})) {
      if (typeof value !== "string") {
        errors.push(`${section}.${name} must be a string`)
        continue
      }
      if (/^(workspace:|catalog:|file:|link:|github:|git\+|https?:\/\/.*\.git(?:#|$)|\.{1,2}\/|\/)/.test(value)) {
        errors.push(`${section}.${name} contains forbidden release dependency ${value}`)
      }
    }
  }

  if (manifest.name === "@spinosa/kernel") {
    const optionalDependencies = manifest.optionalDependencies ?? {}
    const actualNames = Object.keys(optionalDependencies).sort()
    const expectedNames = APPROVED_PUBLISH_PACKAGES.slice(1).sort()
    if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
      errors.push("optionalDependencies must contain the exact approved platform package set")
    }
    for (const name of expectedNames) {
      if (optionalDependencies[name] !== expectedVersion) {
        errors.push(`optionalDependencies.${name} must equal ${expectedVersion}`)
      }
    }
  } else {
    const target = KERNEL_RELEASE_TARGETS.find((candidate) => platformPackageName("@spinosa/kernel", candidate) === manifest.name)
    if (target) {
      if (JSON.stringify(manifest.os) !== JSON.stringify([target.os])) errors.push(`os must equal ${target.os}`)
      if (JSON.stringify(manifest.cpu) !== JSON.stringify([target.arch])) errors.push(`cpu must equal ${target.arch}`)
      const expectedLibc = target.abi ? [target.abi] : undefined
      if (JSON.stringify(manifest.libc) !== JSON.stringify(expectedLibc)) {
        errors.push(`libc must equal ${target.abi ?? "undefined"}`)
      }
    }
  }
  return errors
}

export function npmTagForVersion(version: string) {
  if (/^\d+\.\d+\.\d+$/.test(version)) return "latest"
  if (/^\d+\.\d+\.\d+-beta\.\d+$/.test(version)) return "beta"
  throw new Error(`Unsupported product version: ${version}`)
}
