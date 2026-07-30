#!/usr/bin/env bun
import { createHash } from "node:crypto"
import { existsSync, readFileSync, statSync } from "node:fs"
import { resolve } from "node:path"
import { parseInstallPinnedVersion } from "../../packages/spinosa-core/src/utils/version.ts"

const version = process.argv[2]
if (!version) {
  console.error("Usage: bun script/release/verify-local.ts <version>")
  process.exit(1)
}

const root = resolve(import.meta.dir, "../..")
const dist = resolve(root, `dist/v${version}`)
const channel = version.includes("-") ? "beta" : "stable"
const channelDist = resolve(root, `dist/${channel}`)
const installPath = resolve(dist, "install.sh")
const archiveName = `spinosa-v${version}.tar.gz`
const archivePath = resolve(dist, archiveName)
const checksumsPath = resolve(dist, "checksums.txt")
const channelInstallPath = resolve(channelDist, "install.sh")
const channelChecksumsPath = resolve(channelDist, "checksums.txt")

function sha256(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex")
}

function parseChecksums(text: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const line of text.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const match = trimmed.match(/^([a-f0-9]{64})\s+(.+)$/i)
    if (!match) continue
    map.set(match[2]!.replace(/^\*\.?/, "").trim(), match[1]!.toLowerCase())
  }
  return map
}

function assertChecksum(filePath: string, expectedHash: string | undefined, label: string): void {
  if (!expectedHash) {
    console.error(`Error: checksums.txt missing entry for ${label}`)
    process.exit(1)
  }
  const actual = sha256(filePath)
  if (actual !== expectedHash) {
    console.error(`Error: checksum mismatch for ${label}`)
    console.error(`  expected ${expectedHash}`)
    console.error(`  actual   ${actual}`)
    process.exit(1)
  }
}

for (const file of [installPath, archivePath, checksumsPath, channelInstallPath, channelChecksumsPath]) {
  if (!existsSync(file)) {
    console.error(`Error: missing local asset ${file}`)
    process.exit(1)
  }
}

if (statSync(archivePath).size < 1024) {
  console.error(`Error: archive looks empty: ${archivePath}`)
  process.exit(1)
}

const pinned = parseInstallPinnedVersion(readFileSync(installPath, "utf-8"))
if (pinned !== version) {
  console.error(`Error: dist installer PINNED_VERSION=${pinned}, expected ${version}`)
  process.exit(1)
}

const channelPinned = parseInstallPinnedVersion(readFileSync(channelInstallPath, "utf-8"))
if (channelPinned !== version) {
  console.error(`Error: channel installer PINNED_VERSION=${channelPinned}, expected ${version}`)
  process.exit(1)
}

const checksums = parseChecksums(readFileSync(checksumsPath, "utf-8"))
assertChecksum(installPath, checksums.get("install.sh"), "install.sh")
assertChecksum(archivePath, checksums.get(archiveName), archiveName)

const channelChecksums = parseChecksums(readFileSync(channelChecksumsPath, "utf-8"))
assertChecksum(channelInstallPath, channelChecksums.get("install.sh"), `${channel}/install.sh`)

console.log(`✓ Local release assets verified for v${version} (${channel})`)
