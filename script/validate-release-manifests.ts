#!/usr/bin/env bun

import path from "node:path"
import { APPROVED_PUBLISH_PACKAGES, publishManifestErrors } from "./npm-release-config"

const root = path.resolve(import.meta.dir, "..")
const dist = path.join(root, "packages/spinosa-kernel/dist")
const version = (await Bun.file(path.join(root, "package.json")).json()).version
const manifests = new Map<string, string>()
const allowPartial = process.argv.includes("--allow-partial")
const platformOnly = process.argv.includes("--platform-only")

for (const relativePath of new Bun.Glob("*/package.json").scanSync({ cwd: dist })) {
  const manifest = await Bun.file(path.join(dist, relativePath)).json()
  const errors = publishManifestErrors(manifest, version)
  if (errors.length) {
    for (const error of errors) console.error(`${relativePath}: ${error}`)
    process.exitCode = 1
  }
  manifests.set(manifest.name, relativePath)
}

const expectedPackages = platformOnly ? APPROVED_PUBLISH_PACKAGES.slice(1) : APPROVED_PUBLISH_PACKAGES
const missing = expectedPackages.filter((name) => !manifests.has(name))
const unexpected = [...manifests.keys()].filter((name) => !APPROVED_PUBLISH_PACKAGES.includes(name))
if (!manifests.size) {
  console.error("No release manifests found")
  process.exitCode = 1
}
if (missing.length && !allowPartial) {
  console.error(`Missing release packages: ${missing.join(", ")}`)
  process.exitCode = 1
}
if (unexpected.length) {
  console.error(`Unexpected release packages: ${unexpected.join(", ")}`)
  process.exitCode = 1
}
if (!process.exitCode) console.log(`Validated ${manifests.size} release manifests at ${version}`)
