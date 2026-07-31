#!/usr/bin/env bun
/**
 * Install / launch smoke — mirrors what end users get from install.sh.
 *
 * Default (no flags): fast smoke against the live checkout (repo-root).
 * Archive mode: ALWAYS runs the same frozen install + launch path as the
 * installer, so a published tarball cannot ship if deps/preload are broken.
 * Use `--structure` only for local iteration (not for release).
 *
 * Usage:
 *   bun script/smoke-install.ts
 *   bun script/smoke-install.ts --repo-root
 *   bun script/smoke-install.ts --archive dist/vX/spinosa-vX.tar.gz
 *   bun script/smoke-install.ts --archive … --structure   # paths only
 */
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { $ } from "bun"
import { buildKernelBunArgv } from "../packages/spinosa-core/src/system/bun-launch.ts"

const root = path.resolve(import.meta.dir, "..")

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  if (index < 0) return undefined
  return process.argv[index + 1]
}

const archive = argValue("--archive")
const explicitRepo = process.argv.includes("--repo-root")
const structureOnly =
  process.argv.includes("--structure") ||
  process.env.SPINOSA_SMOKE_STRUCTURE === "1"
const skipDeps = process.argv.includes("--skip-deps")
// Back-compat: --full / SPINOSA_SMOKE_FULL=1 are no-ops (archive default is full).
const _legacyFull =
  process.argv.includes("--full") || process.env.SPINOSA_SMOKE_FULL === "1"
void _legacyFull

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`Usage:
  bun script/smoke-install.ts                         # live checkout
  bun script/smoke-install.ts --repo-root             # same
  bun script/smoke-install.ts --archive <tar.gz>      # frozen install + launch (default)
  bun script/smoke-install.ts --archive <tar.gz> --structure  # paths only (local)
Env: SPINOSA_SMOKE_STRUCTURE=1 forces structure-only (not for release)`)
  process.exit(0)
}

if (archive && explicitRepo) {
  console.error("Use either --archive or --repo-root, not both")
  process.exit(1)
}

const REQUIRED_ARCHIVE_PATHS = [
  "package.json",
  "bun.lock",
  "install.sh",
  "packages/spinosa-kernel/src/index.ts",
  "packages/spinosa-cli/src/index.ts",
  "packages/spinosa-core/src/system/bun-launch.ts",
  "workspace-template/.bin/spinosa",
] as const

const home = mkdtempSync(path.join(tmpdir(), "spinosa-smoke-home-"))
const project = mkdtempSync(path.join(tmpdir(), "spinosa-smoke-project-"))
writeFileSync(path.join(project, "README.md"), "# smoke project\n")

let frameworkRoot = root
const cleanup: string[] = [home, project]
let skipLaunch = false

try {
  if (archive) {
    if (!existsSync(archive)) throw new Error(`archive not found: ${archive}`)
    const extractRoot = mkdtempSync(path.join(tmpdir(), "spinosa-smoke-fw-"))
    cleanup.push(extractRoot)
    await $`tar -xzf ${archive} -C ${extractRoot}`.quiet()
    const entries = await $`ls ${extractRoot}`.text()
    const top = entries.trim().split("\n")[0]
    if (!top) throw new Error("archive extracted empty")
    frameworkRoot = path.join(extractRoot, top)

    console.log("→ archive structure")
    for (const rel of REQUIRED_ARCHIVE_PATHS) {
      const abs = path.join(frameworkRoot, rel)
      if (!existsSync(abs)) throw new Error(`archive missing ${rel}`)
    }
    console.log("✓ archive structure")

    if (structureOnly) {
      skipLaunch = true
      console.log(`✓ smoke passed (structure-only, framework=${frameworkRoot})`)
    } else if (!skipDeps) {
      // Same contract as install.sh: frozen lockfile must succeed for every user.
      console.log("→ bun install --frozen-lockfile (smoke tree)")
      const install = await $`bun install --frozen-lockfile`.cwd(frameworkRoot).nothrow()
      if (install.exitCode !== 0) {
        throw new Error(
          "bun install --frozen-lockfile failed in extracted archive — do not publish; refresh bun.lock and re-cut",
        )
      }

      const link = await $`bash -c ${`
        set -euo pipefail
        SPINOSA_INSTALLER_LIB_ONLY=1
        source "${root}/install.sh"
        ensure_opentui_links "${frameworkRoot}"
      `}`.nothrow()
      if (link.exitCode !== 0) {
        console.warn("ensure_opentui_links returned non-zero — continuing if preload already resolvable")
      }
    } else {
      console.warn("--skip-deps: launching without install (bare tree will fail)")
    }
  }

  if (!skipLaunch) {
    const kernelEntry = path.join(frameworkRoot, "packages/spinosa-kernel/src/index.ts")
    if (!existsSync(kernelEntry)) throw new Error(`missing kernel entry: ${kernelEntry}`)

    const env = {
      ...process.env,
      SPINOSA_HOME: home,
      SPINOSA_TEMPLATE_ROOT: frameworkRoot,
      PWD: project,
    }

    for (const cmd of ["version", "doctor"] as const) {
      console.log(`→ smoke ${cmd}`)
      const argv = buildKernelBunArgv({
        bunPath: process.execPath,
        frameworkRoot,
        kernelEntry,
        args: [cmd],
      })
      const result = await $`${argv}`.cwd(project).env(env).nothrow()
      if (result.exitCode !== 0) {
        throw new Error(`smoke ${cmd} failed with exit ${result.exitCode}`)
      }
    }

    const { resolveThreadDirectory } = await import(
      "../packages/spinosa-kernel/src/cli/cmd/tui.ts"
    )
    const resolved = resolveThreadDirectory(undefined, project, frameworkRoot)
    const expected = realpathSync(project)
    if (resolved !== expected) {
      throw new Error(`expected project cwd ${expected}, got ${resolved}`)
    }

    console.log(`✓ smoke passed (framework=${frameworkRoot}, project=${project})`)
  }
} finally {
  for (const dir of cleanup) {
    rmSync(dir, { recursive: true, force: true })
  }
}
