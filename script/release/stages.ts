import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "node:fs"
import { resolve } from "node:path"
import { createHash } from "node:crypto"
import { $ } from "bun"
import { parseInstallPinnedVersion } from "../../packages/spinosa-core/src/utils/version.ts"
import { syncProductVersion } from "../set-version.ts"
import { assertRollingChannelInstaller, publishRollingChannelRelease } from "./github.ts"
import { RELEASE_ROOT, releasePaths, type ReleasePaths } from "./lib.ts"
import type { Reporter } from "./reporter.ts"
import { markStage, type ReleaseState, type StageName } from "./state.ts"

export interface StageContext {
  version: string
  paths: ReleasePaths
  dryRun: boolean
  reporter: Reporter
  state: ReleaseState
  skipBump: boolean
}

/** Resolve GitHub auth into the process env. Never logs or persists the token. */
export async function resolveGhToken(): Promise<void> {
  if (process.env.GITHUB_TOKEN || process.env.GH_TOKEN) return
  const result = await $`gh auth token`.quiet().nothrow()
  if (result.exitCode === 0) {
    process.env.GH_TOKEN = result.text().trim()
    return
  }
  throw new Error("GitHub auth required. Run: export GH_TOKEN=$(gh auth token)")
}

export async function runPreflight(ctx: StageContext): Promise<void> {
  const rawBranch = (await $`git branch --show-current`.text()).trim()
    || (await $`git rev-parse --abbrev-ref HEAD`.text()).trim()
  const branch = rawBranch.replace(/^heads\//, "")
  if (branch !== "main" && branch !== "beta") {
    throw new Error(`releases must be cut from main or beta (current: ${branch})`)
  }
  ctx.reporter.detail(`branch ${branch}`)

  const dirty = (await $`git status --porcelain`.text()).trim()
  if (dirty && !ctx.dryRun) throw new Error("working tree not clean — commit first")
  ctx.reporter.detail(ctx.dryRun && dirty ? "working tree dirty (ignored in dry-run)" : "working tree clean")

  if (ctx.dryRun) {
    ctx.reporter.detail("would run bun run quality")
    return
  }

  const result = await $`bun run quality`.cwd(RELEASE_ROOT).nothrow()
  if (result.exitCode !== 0) process.exit(result.exitCode ?? 1)
  ctx.reporter.detail("quality checks passed")
}

export async function runBump(ctx: StageContext): Promise<string> {
  if (ctx.skipBump) {
    ctx.reporter.detail(`using existing v${ctx.version}`)
    return ctx.version
  }

  if (ctx.dryRun) {
    ctx.reporter.detail(`would sync version files to v${ctx.version}`)
    ctx.reporter.detail(`would commit and push release: v${ctx.version}`)
    return ctx.version
  }

  const { previous } = syncProductVersion(ctx.version, RELEASE_ROOT)
  ctx.reporter.detail(`${previous} → ${ctx.version}`)

  const dirty = await $`git status --porcelain package.json install.sh`.cwd(RELEASE_ROOT).text()
  if (dirty.trim()) {
    await $`git add package.json install.sh`.cwd(RELEASE_ROOT)
    await $`git commit -m ${`release: v${ctx.version}`}`.cwd(RELEASE_ROOT)
    // Push the current branch tip by SHA-backed HEAD, but name the destination
    // ref explicitly so a local `beta`/`stable` tag cannot make `git push origin beta` ambiguous.
    const branch = ((await $`git branch --show-current`.cwd(RELEASE_ROOT).text()).trim()
      || (await $`git rev-parse --abbrev-ref HEAD`.cwd(RELEASE_ROOT).text()).trim()).replace(/^heads\//, "")
    await $`git push origin HEAD:refs/heads/${branch}`.cwd(RELEASE_ROOT)
    ctx.reporter.detail(`version commit pushed to ${branch}`)
  }

  return ctx.version
}

export async function runBuild(ctx: StageContext): Promise<void> {
  const { paths, version } = ctx
  if (ctx.dryRun) {
    ctx.reporter.detail(`would build dist/v${version}/ and dist/${paths.channel}/`)
    return
  }

  mkdirSync(paths.dist, { recursive: true })
  mkdirSync(paths.channelDist, { recursive: true })

  const installSource = readFileSync(resolve(RELEASE_ROOT, "install.sh"), "utf-8")
  const patchInstaller = (source: string, pinnedVersion: string, pinnedTag: string) =>
    source
      .replace(/^PINNED_VERSION=".*"/m, `PINNED_VERSION="${pinnedVersion}"`)
      .replace(/^PINNED_TAG=".*"/m, `PINNED_TAG="${pinnedTag}"`)

  writeFileSync(paths.installPath, patchInstaller(installSource, version, paths.tag))
  writeFileSync(paths.channelInstallPath, patchInstaller(installSource, version, paths.channel))

  await $`git archive --format=tar.gz --prefix=spinosa-${version}/ -o ${paths.archivePath} HEAD`.cwd(RELEASE_ROOT)

  const checksums = await $`shasum -a 256 install.sh ${paths.archiveName}`.cwd(paths.dist).text()
  writeFileSync(paths.checksumsPath, formatChecksums(checksums))

  const channelChecksums = await $`shasum -a 256 install.sh`.cwd(paths.channelDist).text()
  writeFileSync(paths.channelChecksumsPath, formatChecksums(channelChecksums))

  ctx.reporter.detail(paths.dist)
  ctx.reporter.detail(paths.channelDist)
}

function formatChecksums(text: string): string {
  return text.split("\n").filter(Boolean).map((line) => {
    const [hash, file] = line.split(/\s+/, 2)
    return `${hash}  ${file}`
  }).join("\n") + "\n"
}

export async function runVerifyLocal(ctx: StageContext): Promise<void> {
  const { paths, version } = ctx
  if (ctx.dryRun) {
    ctx.reporter.detail("would verify local installers, archive, and checksums")
    return
  }

  for (const file of [
    paths.installPath,
    paths.archivePath,
    paths.checksumsPath,
    paths.channelInstallPath,
    paths.channelChecksumsPath,
  ]) {
    if (!existsSync(file)) throw new Error(`missing local asset ${file}`)
  }
  if (statSync(paths.archivePath).size < 1024) throw new Error(`archive looks empty: ${paths.archivePath}`)

  const pinned = parseInstallPinnedVersion(readFileSync(paths.installPath, "utf-8"))
  if (pinned !== version) throw new Error(`dist installer PINNED_VERSION=${pinned}, expected ${version}`)

  const channelPinned = parseInstallPinnedVersion(readFileSync(paths.channelInstallPath, "utf-8"))
  if (channelPinned !== version) {
    throw new Error(`channel installer PINNED_VERSION=${channelPinned}, expected ${version}`)
  }

  const checksums = parseChecksums(readFileSync(paths.checksumsPath, "utf-8"))
  assertChecksum(paths.installPath, checksums.get("install.sh"), "install.sh")
  assertChecksum(paths.archivePath, checksums.get(paths.archiveName), paths.archiveName)

  const channelChecksums = parseChecksums(readFileSync(paths.channelChecksumsPath, "utf-8"))
  assertChecksum(paths.channelInstallPath, channelChecksums.get("install.sh"), `${paths.channel}/install.sh`)
}

function sha256(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex")
}

function parseChecksums(text: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const line of text.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const match = trimmed.match(/^([a-f0-9]{64})\s+(.+)$/i)
    if (!match) continue
    map.set(match[2]!.replace(/^\*\.?/, "").trim(), match[1]!.toLowerCase())
  }
  return map
}

function assertChecksum(filePath: string, expectedHash: string | undefined, label: string): void {
  if (!expectedHash) throw new Error(`checksums.txt missing entry for ${label}`)
  const actual = sha256(filePath)
  if (actual !== expectedHash) {
    throw new Error(`checksum mismatch for ${label}`)
  }
}

export async function runGitTag(ctx: StageContext): Promise<void> {
  const { paths } = ctx
  if (ctx.dryRun) {
    ctx.reporter.detail(`would tag and push ${paths.tag}`)
    return
  }

  const tagExists = await $`git rev-parse ${paths.tag}`.cwd(RELEASE_ROOT).nothrow().quiet()
  if (tagExists.exitCode !== 0) {
    await $`git tag ${paths.tag}`.cwd(RELEASE_ROOT)
  }
  await $`git push origin refs/tags/${paths.tag}`.cwd(RELEASE_ROOT)
  ctx.reporter.detail(`tag ${paths.tag} pushed`)
}

export async function runPublishVersion(ctx: StageContext): Promise<void> {
  const { paths, version } = ctx
  if (ctx.dryRun) {
    ctx.reporter.detail(`would create GitHub release ${paths.tag}`)
    return
  }

  await resolveGhToken()
  const assets = [
    `dist/v${version}/install.sh`,
    `dist/v${version}/spinosa-v${version}.tar.gz`,
    `dist/v${version}/checksums.txt`,
  ]
  const prerelease = version.includes("-")
  const createArgs = [
    "release", "create", paths.tag,
    "--title", `Spinosa v${version}`,
    "--generate-notes",
    ...(prerelease ? ["--prerelease"] : []),
    ...assets,
  ]

  const existing = await $`gh release view ${paths.tag}`.cwd(RELEASE_ROOT).nothrow().quiet()
  if (existing.exitCode === 0) {
    const uploadArgs = ["release", "upload", paths.tag, ...assets, "--clobber"]
    await $`gh ${uploadArgs}`.cwd(RELEASE_ROOT)
    ctx.reporter.detail(`uploaded assets to existing ${paths.tag}`)
    return
  }

  await $`gh ${createArgs}`.cwd(RELEASE_ROOT)
  ctx.reporter.detail(`created GitHub release ${paths.tag}`)
}

export async function runChannel(ctx: StageContext): Promise<void> {
  const { paths, version } = ctx
  if (!existsSync(paths.channelInstallPath)) {
    throw new Error(`channel assets missing at ${paths.channelDist} — run build first`)
  }
  if (ctx.dryRun) {
    ctx.reporter.detail(`would sync rolling ${paths.channel} channel to v${version}`)
    return
  }

  await resolveGhToken()
  const sha = (await $`git rev-parse HEAD`.cwd(RELEASE_ROOT)).text().trim()
  await $`git tag -f ${paths.channel} ${sha}`.cwd(RELEASE_ROOT)
  await $`git push origin refs/tags/${paths.channel}:refs/tags/${paths.channel} --force`.cwd(RELEASE_ROOT)
  await publishRollingChannelRelease({
    version,
    channel: paths.channel,
    channelDist: paths.channelDist,
  })
  ctx.reporter.detail(`rolling ${paths.channel} → ${sha.slice(0, 8)}`)
}

export async function runVerifyRemote(ctx: StageContext): Promise<void> {
  const { paths, version } = ctx
  if (ctx.dryRun) {
    ctx.reporter.detail("would verify live rolling and versioned installers")
    return
  }

  if (process.env.GITHUB_TOKEN || process.env.GH_TOKEN) {
    const pinned = await assertRollingChannelInstaller({ version, channel: paths.channel })
    ctx.reporter.detail(`rolling ${paths.channel} PINNED_VERSION=${pinned}`)
  } else {
    const pinned = await assertLiveInstaller(
      `https://github.com/medialab/spinosa/releases/download/${paths.channel}/install.sh`,
      paths.channel,
      version,
    )
    ctx.reporter.detail(`rolling ${paths.channel} PINNED_VERSION=${pinned}`)
  }

  const versionPinned = await assertLiveInstaller(
    `https://github.com/medialab/spinosa/releases/download/${paths.tag}/install.sh`,
    paths.tag,
    version,
  )
  ctx.reporter.detail(`versioned ${paths.tag} PINNED_VERSION=${versionPinned}`)
}

async function assertLiveInstaller(url: string, label: string, version: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`failed to download live ${label} installer (${response.status})`)
  const script = await response.text()
  const pinned = script.match(/^PINNED_VERSION="([^"]+)"/m)?.[1]
  if (!pinned) throw new Error(`could not read PINNED_VERSION from live ${label} installer`)
  if (pinned !== version) {
    throw new Error(`live ${label} installer serves PINNED_VERSION=${pinned}, expected ${version}`)
  }
  return pinned
}

const STAGE_RUNNERS: Record<StageName, (ctx: StageContext) => Promise<void | string>> = {
  preflight: runPreflight,
  bump: runBump,
  build: runBuild,
  verifyLocal: runVerifyLocal,
  gitTag: runGitTag,
  publishVersion: runPublishVersion,
  channel: runChannel,
  verifyRemote: runVerifyRemote,
}

export async function runStage(stage: StageName, ctx: StageContext): Promise<StageContext> {
  const started = performance.now()
  ctx.reporter.start(stage)
  try {
    const result = await STAGE_RUNNERS[stage](ctx)
    let next = ctx
    if (stage === "bump" && typeof result === "string") {
      next = {
        ...ctx,
        version: result,
        paths: releasePaths(result),
      }
    }
    const durationMs = Math.round(performance.now() - started)
    if (!ctx.dryRun) next.state = markStage(next.state, stage, { status: "ok", durationMs })
    else next.state = { ...next.state, stages: { ...next.state.stages, [stage]: { status: "ok", at: new Date().toISOString(), durationMs } } }
    ctx.reporter.complete()
    return next
  } catch (error) {
    const durationMs = Math.round(performance.now() - started)
    const message = error instanceof Error ? error.message : String(error)
    if (!ctx.dryRun) markStage(ctx.state, stage, { status: "failed", durationMs, error: message })
    throw error
  }
}

export { readCurrentVersion } from "./bump.ts"
