#!/usr/bin/env bun
import { releaseChannel } from "../../packages/spinosa-core/src/utils/version.ts"
import { assertRollingChannelInstaller } from "./github.ts"

const version = process.argv[2]
if (!version) {
  console.error("Usage: bun script/release/verify-remote.ts <version>")
  process.exit(1)
}

const channel = releaseChannel(version)

try {
  if (process.env.GITHUB_TOKEN || process.env.GH_TOKEN) {
    const pinned = await assertRollingChannelInstaller({ version, channel })
    console.log(`✓ Rolling ${channel} release verified (PINNED_VERSION=${pinned})`)
    process.exit(0)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}

const url = `https://github.com/medialab/spinosa/releases/download/${channel}/install.sh`
const response = await fetch(url)
if (!response.ok) {
  console.error(`Error: failed to download live ${channel} installer (${response.status})`)
  process.exit(1)
}

const script = await response.text()
const pinned = script.match(/^PINNED_VERSION="([^"]+)"/m)?.[1]
if (!pinned) {
  console.error(`Error: could not read PINNED_VERSION from live ${channel} installer`)
  process.exit(1)
}

if (pinned !== version) {
  console.error(`Error: live ${channel} installer serves PINNED_VERSION=${pinned}, expected ${version}`)
  process.exit(1)
}

console.log(`✓ Live ${channel} installer PINNED_VERSION=${pinned}`)
