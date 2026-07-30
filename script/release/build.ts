#!/usr/bin/env bun
import { mkdirSync, writeFileSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { $ } from "bun"
import { releaseChannel } from "../../packages/spinosa-core/src/utils/version.ts"

const version = process.argv[2]
if (!version) {
  console.error("Usage: bun script/release/build.ts <version>")
  process.exit(1)
}

const root = resolve(import.meta.dir, "../..")
const tag = `v${version}`
const channel = releaseChannel(version)
const dist = resolve(root, `dist/v${version}`)
const channelDist = resolve(root, `dist/${channel}`)

mkdirSync(dist, { recursive: true })
mkdirSync(channelDist, { recursive: true })

function patchInstaller(source: string, pinnedVersion: string, pinnedTag: string): string {
  return source
    .replace(/^PINNED_VERSION=".*"/m, `PINNED_VERSION="${pinnedVersion}"`)
    .replace(/^PINNED_TAG=".*"/m, `PINNED_TAG="${pinnedTag}"`)
}

const installSource = readFileSync(resolve(root, "install.sh"), "utf-8")

const versionInstaller = patchInstaller(installSource, version, tag)
const versionInstallerPath = resolve(dist, "install.sh")
writeFileSync(versionInstallerPath, versionInstaller)

const channelInstaller = patchInstaller(installSource, version, channel)
const channelInstallerPath = resolve(channelDist, "install.sh")
writeFileSync(channelInstallerPath, channelInstaller)

const archiveName = `spinosa-v${version}.tar.gz`
const archivePath = resolve(dist, archiveName)
await $`git archive --format=tar.gz --prefix=spinosa-${version}/ -o ${archivePath} HEAD`.cwd(root)

const checksums = await $`shasum -a 256 install.sh ${archiveName}`.cwd(dist).text()
writeFileSync(resolve(dist, "checksums.txt"), checksums.split("\n").filter(Boolean).map((line) => {
  const [hash, file] = line.split(/\s+/, 2)
  return `${hash}  ${file}`
}).join("\n") + "\n")

const channelChecksums = await $`shasum -a 256 install.sh`.cwd(channelDist).text()
writeFileSync(resolve(channelDist, "checksums.txt"), channelChecksums.split("\n").filter(Boolean).map((line) => {
  const [hash, file] = line.split(/\s+/, 2)
  return `${hash}  ${file}`
}).join("\n") + "\n")

console.log(`✓ Built release assets for v${version} (${channel})`)
console.log(`  ${dist}`)
console.log(`  ${channelDist}`)
