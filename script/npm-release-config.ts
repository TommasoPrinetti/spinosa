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
  return [baseName, target.os, target.arch, target.avx2 === false ? "baseline" : undefined, target.abi]
    .filter(Boolean)
    .join("-")
}

export const APPROVED_PUBLISH_PACKAGES = [
  "@spinosa/kernel",
  ...KERNEL_RELEASE_TARGETS.map((target) => platformPackageName("@spinosa/kernel", target)),
]

export function npmTagForVersion(version: string) {
  if (/^\d+\.\d+\.\d+$/.test(version)) return "latest"
  if (/^\d+\.\d+\.\d+-beta\.\d+$/.test(version)) return "beta"
  throw new Error(`Unsupported product version: ${version}`)
}
