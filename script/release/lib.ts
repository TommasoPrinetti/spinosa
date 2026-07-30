import { resolve } from "node:path"
import { releaseChannel } from "../../packages/spinosa-core/src/utils/version.ts"

export const RELEASE_ROOT = resolve(import.meta.dir, "../..")

export type ReleasePaths = {
  version: string
  tag: string
  channel: ReturnType<typeof releaseChannel>
  dist: string
  channelDist: string
  archiveName: string
  installPath: string
  archivePath: string
  checksumsPath: string
  channelInstallPath: string
  channelChecksumsPath: string
}

export function releasePaths(version: string): ReleasePaths {
  const tag = `v${version}`
  const channel = releaseChannel(version)
  const dist = resolve(RELEASE_ROOT, `dist/v${version}`)
  const channelDist = resolve(RELEASE_ROOT, `dist/${channel}`)
  const archiveName = `spinosa-v${version}.tar.gz`
  return {
    version,
    tag,
    channel,
    dist,
    channelDist,
    archiveName,
    installPath: resolve(dist, "install.sh"),
    archivePath: resolve(dist, archiveName),
    checksumsPath: resolve(dist, "checksums.txt"),
    channelInstallPath: resolve(channelDist, "install.sh"),
    channelChecksumsPath: resolve(channelDist, "checksums.txt"),
  }
}
