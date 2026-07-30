#!/usr/bin/env bun
// Pre-release gate: branch, clean tree, typecheck, core release tests.
import { resolve } from "node:path"
import { $ } from "bun"

const root = resolve(import.meta.dir, "../..")

console.log("→ release:validate")

const branch = (await $`git branch --show-current`.text()).trim()
  || (await $`git rev-parse --abbrev-ref HEAD`.text()).trim()
if (branch !== "main" && branch !== "beta") {
  console.error(`Error: releases must be cut from main or beta (current: ${branch})`)
  process.exit(1)
}

const dirty = (await $`git status --porcelain`.text()).trim()
if (dirty) {
  console.error("Error: working tree not clean — commit first")
  process.exit(1)
}

await $`bun run typecheck`.cwd(root)
await $`bun test test/version.test.ts test/preflight.test.ts test/channels.test.ts test/yaml-config.test.ts test/upgrade-network.test.ts`.cwd(`${root}/packages/spinosa-core`)
await $`bun test ../../script/release/github.test.ts`.cwd(`${root}/packages/spinosa-core`)

console.log("✓ release validation passed")
