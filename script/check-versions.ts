#!/usr/bin/env bun

import path from "node:path"
import { PRODUCT_PACKAGE_MANIFESTS, npmTagForVersion } from "./npm-release-config"

const root = path.resolve(import.meta.dir, "..")
const rootManifest = await Bun.file(path.join(root, "package.json")).json()
const version = rootManifest.version
const errors: string[] = []

if (typeof version !== "string") {
  errors.push("Root package.json must define a string version")
} else {
  try {
    npmTagForVersion(version)
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error))
  }
}

const installer = await Bun.file(path.join(root, "install.sh")).text()
const pinnedVersion = installer.match(/^PINNED_VERSION="([^"]+)"$/m)?.[1]
if (pinnedVersion !== version) {
  errors.push(`install.sh PINNED_VERSION is ${pinnedVersion ?? "missing"}; expected ${version}`)
}

const changelog = await Bun.file(path.join(root, "CHANGELOG.md")).text()
const changelogVersion = changelog.match(/^## \[([^\]]+)\]/m)?.[1]
if (changelogVersion !== version) {
  errors.push(`Latest CHANGELOG.md version is ${changelogVersion ?? "missing"}; expected ${version}`)
}

for (const relativePath of PRODUCT_PACKAGE_MANIFESTS) {
  const manifest = await Bun.file(path.join(root, relativePath)).json()
  if (manifest.version !== version) {
    errors.push(`${relativePath} version is ${manifest.version ?? "missing"}; expected ${version}`)
  }
}

if (errors.length) {
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log(`${version} -> npm dist-tag ${npmTagForVersion(version)}`)
