#!/usr/bin/env bun
import { releaseChannel } from "../../packages/spinosa-core/src/utils/version.ts"
import { assertRollingChannelInstaller } from "./github.ts"

const version = process.argv[2]
if (!version) {
  console.error("Usage: bun script/release/verify-remote.ts <version>")
  process.exit(1)
}

const channel = releaseChannel(version)
const tag = `v${version}`

async function assertLiveInstaller(url: string, label: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`failed to download live ${label} installer (${response.status})`)
  }
  const script = await response.text()
  const pinned = script.match(/^PINNED_VERSION="([^"]+)"/m)?.[1]
  if (!pinned) {
    throw new Error(`could not read PINNED_VERSION from live ${label} installer`)
  }
  if (pinned !== version) {
    throw new Error(`live ${label} installer serves PINNED_VERSION=${pinned}, expected ${version}`)
  }
  return pinned
}

try {
  if (process.env.GITHUB_TOKEN || process.env.GH_TOKEN) {
    const pinned = await assertRollingChannelInstaller({ version, channel })
    console.log(`✓ Rolling ${channel} release verified (PINNED_VERSION=${pinned})`)
  } else {
    const pinned = await assertLiveInstaller(
      `https://github.com/medialab/spinosa/releases/download/${channel}/install.sh`,
      channel,
    )
    console.log(`✓ Live ${channel} installer PINNED_VERSION=${pinned}`)
  }

  // Also confirm the immutable versioned installer is reachable and pinned.
  const versionPinned = await assertLiveInstaller(
    `https://github.com/medialab/spinosa/releases/download/${tag}/install.sh`,
    tag,
  )
  console.log(`✓ Versioned ${tag} installer PINNED_VERSION=${versionPinned}`)
} catch (error) {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
