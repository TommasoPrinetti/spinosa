#!/usr/bin/env bun
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { parseInstallPinnedVersion } from "../../packages/spinosa-core/src/utils/version.ts"

const version = process.argv[2]
if (!version) {
  console.error("Usage: bun script/release/verify-local.ts <version>")
  process.exit(1)
}

const root = resolve(import.meta.dir, "../..")
const dist = resolve(root, `dist/v${version}`)
const installPath = resolve(dist, "install.sh")
const archivePath = resolve(dist, `spinosa-v${version}.tar.gz`)
const checksumsPath = resolve(dist, "checksums.txt")

for (const file of [installPath, archivePath, checksumsPath]) {
  if (!existsSync(file)) {
    console.error(`Error: missing local asset ${file}`)
    process.exit(1)
  }
}

const pinned = parseInstallPinnedVersion(readFileSync(installPath, "utf-8"))
if (pinned !== version) {
  console.error(`Error: dist installer PINNED_VERSION=${pinned}, expected ${version}`)
  process.exit(1)
}

const checksums = readFileSync(checksumsPath, "utf-8")
if (!checksums.includes("install.sh") || !checksums.includes(`spinosa-v${version}.tar.gz`)) {
  console.error("Error: checksums.txt missing install.sh or archive entry")
  process.exit(1)
}

console.log(`✓ Local release assets verified for v${version}`)
