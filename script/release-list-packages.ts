#!/usr/bin/env bun

import path from "node:path"
import { APPROVED_PUBLISH_PACKAGES, npmTagForVersion } from "./npm-release-config"

const root = path.resolve(import.meta.dir, "..")
const unexpectedPublicPackages: string[] = []

for (const relativePath of new Bun.Glob("packages/*/package.json").scanSync({ cwd: root })) {
  const manifest = await Bun.file(path.join(root, relativePath)).json()
  if (manifest.private !== true || manifest.publishConfig?.access === "public") {
    unexpectedPublicPackages.push(`${manifest.name ?? relativePath} (${relativePath})`)
  }
}

if (unexpectedPublicPackages.length) {
  console.error("Unexpected public workspace packages:")
  for (const packageName of unexpectedPublicPackages.sort()) console.error(`- ${packageName}`)
  process.exit(1)
}

const version = (await Bun.file(path.join(root, "package.json")).json()).version
const output = {
  version,
  npmTag: npmTagForVersion(version),
  packages: APPROVED_PUBLISH_PACKAGES,
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(output, null, 2))
} else {
  console.log(output.packages.join("\n"))
}
