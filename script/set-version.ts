#!/usr/bin/env bun
// Sync the product version across release-bearing files.
// Updates root package.json and install.sh PINNED_VERSION only.
// Does not change internal @spinosa/* package versions.
//
// Usage: bun script/set-version.ts 1.0.2-beta.14

import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import semver from "semver"

const ROOT = resolve(import.meta.dir, "..")

function die(message: string): never {
  console.error(`Error: ${message}`)
  process.exit(1)
}

function main() {
  const version = process.argv[2]
  if (!version) {
    console.error("Usage: bun script/set-version.ts <version>")
    console.error("Example: bun script/set-version.ts 1.0.2-beta.14")
    process.exit(1)
  }
  if (!semver.valid(version)) {
    die(`Invalid semantic version: ${version}`)
  }

  console.log(`Synchronizing product version to v${version}`)

  // 1. Root package.json
  const pkgPath = resolve(ROOT, "package.json")
  let pkg: { version: string; [key: string]: unknown }
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf-8"))
  } catch {
    die(`Cannot read or parse ${pkgPath}`)
  }
  const previousRoot = pkg.version
  pkg.version = version
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n")
  console.log(`  Updated root package.json: ${previousRoot} → ${version}`)

  // 2. Committed install.sh PINNED_VERSION
  const installPath = resolve(ROOT, "install.sh")
  if (!existsSync(installPath)) {
    die(`Installer not found: ${installPath}`)
  }
  let installScript = readFileSync(installPath, "utf-8")
  const pinRegex = /^PINNED_VERSION="([^"]+)"/m
  const pinMatch = installScript.match(pinRegex)
  if (!pinMatch) {
    die("PINNED_VERSION line not found in install.sh")
  }
  const previousPin = pinMatch[1]!
  installScript = installScript.replace(pinRegex, `PINNED_VERSION="${version}"`)
  writeFileSync(installPath, installScript)
  console.log(`  Updated install.sh PINNED_VERSION: ${previousPin} → ${version}`)

  if (previousPin !== version) {
    console.log(`  Note: install.sh version changed (${previousPin} → ${version})`)
  }

  // 3. Verify consistency across release-bearing references
  const mismatches: string[] = []

  const releaseBearingFiles = [
    { file: pkgPath, label: "root package.json" },
    { file: installPath, label: "install.sh" },
  ]

  for (const { file, label } of releaseBearingFiles) {
    const content = readFileSync(file, "utf-8")
    if (!content.includes(`"version": "${version}"`) && !content.includes(`PINNED_VERSION="${version}"`)) {
      mismatches.push(`${label}: expected version ${version}`)
    }
  }

  const searchPaths = [
    { path: installPath, label: "install.sh" },
  ]
  for (const { path: filePath, label } of searchPaths) {
    const content = readFileSync(filePath, "utf-8")
    const stalePin = content.match(pinRegex)
    if (stalePin && stalePin[1] !== version) {
      mismatches.push(`${label}: PINNED_VERSION=${stalePin[1]} (expected ${version})`)
    }
  }

  if (mismatches.length > 0) {
    console.error("Consistency check failed:")
    for (const m of mismatches) {
      console.error(`  - ${m}`)
    }
    die("Release-bearing files are inconsistent. Fix before tagging.")
  }

  console.log("\n✓ Version synchronized successfully.")
  console.log(`  Product version: v${version}`)
  console.log(`  Previous version: v${previousRoot}`)
  console.log("\nNext steps:")
  console.log("  1. Run typecheck: bun run typecheck")
  console.log("  2. Run tests:     bun test")
  console.log("  3. Release:       bun run release:beta   # or release:stable")
}

main()
