#!/usr/bin/env bun
import { existsSync } from "node:fs"
import path from "node:path"
import { $ } from "zx"
import { releaseChannel } from "../../packages/spinosa-core/src/utils/version.ts"
import { publishRollingChannelRelease } from "./github.ts"

$.verbose = false
$.stdio = "inherit"

const version = process.argv[2]
if (!version) {
  console.error("Usage: bun script/release/publish-channel.ts <version>")
  process.exit(1)
}

const root = path.resolve(import.meta.dir, "../..")
const channel = releaseChannel(version)
const channelDist = path.join(root, "dist", channel)
const installPath = path.join(channelDist, "install.sh")

if (!existsSync(installPath)) {
  console.error(`Error: channel assets missing at ${channelDist} — run release:build first`)
  process.exit(1)
}

console.log(`→ publish rolling ${channel} channel for v${version}`)

const sha = (await $`git rev-parse HEAD`.cwd(root)).stdout.trim()
await $`git tag -f ${channel} ${sha}`.cwd(root)
await $`git push origin refs/tags/${channel}:refs/tags/${channel} --force`.cwd(root)

await publishRollingChannelRelease({
  version,
  channel,
  channelDist,
})

console.log(`✓ Rolling ${channel} channel synced to v${version}`)
