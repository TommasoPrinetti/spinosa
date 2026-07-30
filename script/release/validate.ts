#!/usr/bin/env bun
// Pre-release gate: branch, clean tree, quality checks.
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

await $`bun run quality`.cwd(root)

console.log("✓ release validation passed")
