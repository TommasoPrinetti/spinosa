#!/usr/bin/env bun
// Sync the product version across release-bearing files.
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import semver from "semver"

export function syncProductVersion(version: string, root: string): { previous: string } {
  const clean = version.replace(/^v/, "")
  if (!semver.valid(clean)) {
    throw new Error(`Invalid semantic version: ${clean}`)
  }

  const pkgPath = resolve(root, "package.json")
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version: string }
  const previous = pkg.version
  pkg.version = clean
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)

  const installPath = resolve(root, "install.sh")
  if (!existsSync(installPath)) throw new Error(`Installer not found: ${installPath}`)
  let installScript = readFileSync(installPath, "utf-8")
  const pinRegex = /^PINNED_VERSION="([^"]+)"/m
  if (!pinRegex.test(installScript)) throw new Error("PINNED_VERSION line not found in install.sh")
  installScript = installScript.replace(pinRegex, `PINNED_VERSION="${clean}"`)
  writeFileSync(installPath, installScript)

  return { previous }
}

function main() {
  const version = process.argv[2]
  if (!version) {
    console.error("Usage: bun script/set-version.ts <version>")
    process.exit(1)
  }

  const root = resolve(import.meta.dir, "..")
  const { previous } = syncProductVersion(version, root)
  console.log(`✓ Synchronized product version: v${previous} → v${version.replace(/^v/, "")}`)
}

if (import.meta.main) main()
