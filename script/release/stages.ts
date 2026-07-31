import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "node:fs"
import { resolve } from "node:path"
import { createHash } from "node:crypto"
import { $ } from "bun"
import { parseInstallPinnedVersion } from "../../packages/spinosa-core/src/utils/version.ts"
import { syncProductVersion, assertChangelogHasVersion } from "../set-version.ts"
import { assertRollingChannelInstaller, publishRollingChannelRelease } from "./github.ts"
import { RELEASE_ROOT, releasePaths, type ReleasePaths } from "./lib.ts"
import type { Reporter } from "./reporter.ts"
import { markStage, writeState, type ReleaseState, type StageName } from "./state.ts"

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
  const expectedBranch = ctx.paths.channel === "stable" ? "main" : "beta"
  if (branch !== expectedBranch) {
    throw new Error(
      `${ctx.paths.channel} releases must run from ${expectedBranch} (current: ${branch})`,
    )
  }
  ctx.reporter.detail(`branch ${branch} (${ctx.paths.channel})`)

  assertChangelogHasVersion(RELEASE_ROOT, ctx.version)
  ctx.reporter.detail(`CHANGELOG has section for v${ctx.version}`)

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

  const { previous, syncedPackages } = syncProductVersion(ctx.version, RELEASE_ROOT)
  ctx.reporter.detail(`${previous} → ${ctx.version}`)
  if (syncedPackages.length > 0) {
    ctx.reporter.detail(`synced packages: ${syncedPackages.join(", ")}`)
  }

  // Version bumps rewrite workspace package.json versions; refresh bun.lock so
  // user installs with `bun install --frozen-lockfile` succeed.
  const lock = await $`bun install`.cwd(RELEASE_ROOT).nothrow()
  if (lock.exitCode !== 0) {
    throw new Error("bun install failed after version sync — lockfile not refreshed")
  }
  ctx.reporter.detail("bun.lock refreshed for frozen installs")

  // Root + installer are source of truth; product packages (spinosa-core/cli/…) are synced too.
  // Kernel/tui stay on their own 1.17.x fork versions — see script/set-version.ts.
  const versionPaths = [
    "package.json",
    "install.sh",
    "bun.lock",
    ...syncedPackages.map((dir) => `${dir}/package.json`),
  ]
  const dirty = await $`git status --porcelain ${versionPaths}`.cwd(RELEASE_ROOT).text()
  if (dirty.trim()) {
    await $`git add ${versionPaths}`.cwd(RELEASE_ROOT)
    await $`git commit -m ${`release: v${ctx.version}`}`.cwd(RELEASE_ROOT)
    // Push the current branch tip by SHA-backed HEAD, but name the destination
    // ref explicitly so a local `beta`/`stable` tag cannot make `git push origin beta` ambiguous.
    const branch = ((await $`git branch --show-current`.cwd(RELEASE_ROOT).text()).trim()
      || (await $`git rev-parse --abbrev-ref HEAD`.cwd(RELEASE_ROOT).text()).trim()).replace(/^heads\//, "")
    await $`git push origin HEAD:refs/heads/${branch}`.cwd(RELEASE_ROOT)
    ctx.reporter.detail(`version commit pushed to ${branch}`)
  }

  const sha = (await $`git rev-parse HEAD`.cwd(RELEASE_ROOT).text()).trim()
  ctx.state = { ...ctx.state, sha, updatedAt: new Date().toISOString() }
  writeState(ctx.version, ctx.state)
  ctx.reporter.detail(`release state sha ${sha.slice(0, 8)}`)

  return ctx.version
}

export async function runBuild(ctx: StageContext): Promise<void> {
  const { paths, version } = ctx
  if (ctx.dryRun) {
    ctx.reporter.detail(`would build dist/v${version}/ and dist/${paths.channel}/`)
    return
  }

  const head = (await $`git rev-parse HEAD`.cwd(RELEASE_ROOT).text()).trim()
  const archiveSha = ctx.state.sha || head
  if (ctx.state.sha && ctx.state.sha !== head) {
    throw new Error(
      `refusing to build: release state sha ${ctx.state.sha.slice(0, 8)} ≠ HEAD ${head.slice(0, 8)}`,
    )
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

  await $`git archive --format=tar.gz --prefix=spinosa-${version}/ -o ${paths.archivePath} ${archiveSha}`.cwd(RELEASE_ROOT)

  const checksums = await $`shasum -a 256 install.sh ${paths.archiveName}`.cwd(paths.dist).text()
  writeFileSync(paths.checksumsPath, formatChecksums(checksums))

  const channelChecksums = await $`shasum -a 256 install.sh`.cwd(paths.channelDist).text()
  writeFileSync(paths.channelChecksumsPath, formatChecksums(channelChecksums))

  ctx.reporter.detail(paths.dist)
  ctx.reporter.detail(paths.channelDist)
  ctx.reporter.detail(`archived ${archiveSha.slice(0, 8)}`)
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

export async function runSmoke(ctx: StageContext): Promise<void> {
  const { paths } = ctx
  if (ctx.dryRun) {
    ctx.reporter.detail(
      process.env.SPINOSA_SMOKE_FULL === "1"
        ? "would full-smoke local archive (install + version/doctor + cwd)"
        : "would structure-smoke local archive (key paths; set SPINOSA_SMOKE_FULL=1 for install+launch)",
    )
    return
  }
  if (!existsSync(paths.archivePath)) {
    throw new Error(`smoke requires archive at ${paths.archivePath}`)
  }
  // Default: structure-only (fast). Full frozen install + launch: SPINOSA_SMOKE_FULL=1.
  // Skip deps inside a full smoke with SPINOSA_SMOKE_SKIP_DEPS=1 (local iteration only).
  const flags = ["--archive", paths.archivePath]
  if (process.env.SPINOSA_SMOKE_FULL === "1") flags.push("--full")
  if (process.env.SPINOSA_SMOKE_SKIP_DEPS === "1") flags.push("--skip-deps")
  const result = await $`bun script/smoke-install.ts ${flags}`.cwd(RELEASE_ROOT).nothrow()
  if (result.exitCode !== 0) {
    throw new Error("local archive smoke failed — see script/smoke-install.ts output")
  }
  ctx.reporter.detail(
    process.env.SPINOSA_SMOKE_FULL === "1"
      ? `full-smoked ${paths.archiveName}`
      : `structure-smoked ${paths.archiveName}`,
  )
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

  const head = (await $`git rev-parse HEAD`.cwd(RELEASE_ROOT).text()).trim()
  if (ctx.state.sha && ctx.state.sha !== head) {
    throw new Error(
      `refusing to tag: release state sha ${ctx.state.sha.slice(0, 8)} ≠ HEAD ${head.slice(0, 8)}`,
    )
  }

  const tagExists = await $`git rev-parse ${paths.tag}`.cwd(RELEASE_ROOT).nothrow().quiet()
  if (tagExists.exitCode === 0) {
    const tagSha = (await $`git rev-list -1 ${paths.tag}`.cwd(RELEASE_ROOT).text()).trim()
    if (tagSha !== head) {
      throw new Error(
        `refusing to reuse ${paths.tag}: points at ${tagSha.slice(0, 8)}, HEAD is ${head.slice(0, 8)}`,
      )
    }
    ctx.reporter.detail(`tag ${paths.tag} already at HEAD`)
  } else {
    await $`git tag ${paths.tag} ${head}`.cwd(RELEASE_ROOT)
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
    const remoteCheck = resolve(paths.dist, ".remote-check")
    mkdirSync(remoteCheck, { recursive: true })
    const downloaded = await $`gh release download ${paths.tag} --pattern checksums.txt --dir ${remoteCheck} --clobber`
      .cwd(RELEASE_ROOT)
      .nothrow()
      .quiet()
    if (downloaded.exitCode === 0 && existsSync(resolve(remoteCheck, "checksums.txt"))) {
      const localHash = sha256(paths.checksumsPath)
      const remoteHash = sha256(resolve(remoteCheck, "checksums.txt"))
      if (localHash !== remoteHash) {
        throw new Error(
          `refusing to clobber immutable release ${paths.tag}: checksums.txt differs (local ${localHash.slice(0, 12)} ≠ remote ${remoteHash.slice(0, 12)})`,
        )
      }
      ctx.reporter.detail(`existing ${paths.tag} checksums match — skip upload`)
      return
    }
    throw new Error(
      `GitHub release ${paths.tag} already exists but checksums.txt could not be verified — refuse immutable republish`,
    )
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

  // Optional remote archive smoke. Structure-only by default; full install+launch with
  // SPINOSA_SMOKE_FULL=1 (and SPINOSA_SMOKE_REMOTE=1 to enable the download).
  if (process.env.SPINOSA_SMOKE_REMOTE === "1") {
    const remoteDir = resolve(paths.dist, ".remote-smoke")
    mkdirSync(remoteDir, { recursive: true })
    await $`gh release download ${paths.tag} --pattern ${paths.archiveName} --dir ${remoteDir} --clobber`
      .cwd(RELEASE_ROOT)
    const remoteArchive = resolve(remoteDir, paths.archiveName)
    const flags = ["--archive", remoteArchive]
    if (process.env.SPINOSA_SMOKE_FULL === "1") flags.push("--full")
    const smoke = await $`bun script/smoke-install.ts ${flags}`.cwd(RELEASE_ROOT).nothrow()
    if (smoke.exitCode !== 0) throw new Error("remote archive smoke failed")
    ctx.reporter.detail(`remote smoke passed for ${paths.tag}`)
  }
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
  smoke: runSmoke,
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
