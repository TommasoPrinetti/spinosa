#!/usr/bin/env bun
/**
 * Republish an explicit version without a semver bump.
 * Prefer: bun run release:beta:patch / bun run release:stable:patch
 */
import { $ } from "bun"
import { resolve } from "node:path"

const raw = process.argv[2]
if (!raw) {
  console.error("Usage: bun script/release/republish.ts vX.Y.Z[-beta.N]")
  console.error("Prefer: bun run release:beta:patch  (increments prerelease)")
  console.error("        bun run release:stable:patch (increments patch)")
  process.exit(1)
}

const version = raw.replace(/^v/, "")
const root = resolve(import.meta.dir, "../..")
const tag = `v${version}`
const prerelease = version.includes("-")

console.log(`→ Explicit republish for ${tag}`)
await $`bun script/set-version.ts ${version}`.cwd(root)

const dirty = await $`git status --porcelain package.json install.sh`.cwd(root).text()
if (dirty.trim()) {
  await $`git add package.json install.sh`.cwd(root)
  await $`git commit -m ${`release: v${version}`}`.cwd(root)
  await $`git push origin HEAD`.cwd(root)
}

await $`bun script/release/validate.ts`.cwd(root)
await $`bun script/release/build.ts ${version}`.cwd(root)
await $`bun script/release/verify-local.ts ${version}`.cwd(root)

const tagExists = await $`git rev-parse ${tag}`.cwd(root).nothrow().quiet()
if (tagExists.exitCode !== 0) {
  await $`git tag ${tag}`.cwd(root)
}
await $`git push origin refs/tags/${tag}`.cwd(root)

const assets = [
  `dist/v${version}/install.sh`,
  `dist/v${version}/spinosa-v${version}.tar.gz`,
  `dist/v${version}/checksums.txt`,
]
const createArgs = [
  "release", "create", tag,
  "--title", `Spinosa v${version}`,
  "--generate-notes",
  ...(prerelease ? ["--prerelease"] : []),
  ...assets,
]
await $`gh ${createArgs}`.cwd(root)

await $`bun script/release/publish-channel.ts ${version}`.cwd(root)
await $`bun script/release/verify-remote.ts ${version}`.cwd(root)

console.log(`✓ Released Spinosa v${version}`)
