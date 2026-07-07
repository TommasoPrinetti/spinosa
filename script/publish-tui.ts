#!/usr/bin/env bun
import fs from "fs"
// ── publish-tui.ts — Build and publish @spinosa/tui to npm ─────────────────
//
// Usage: bun run script/publish-tui.ts
// Prerequisites: npm login (with @spinosa org access)

import { $ } from "bun"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "..")

process.chdir(repoRoot)

const TUI_VERSION = "0.8.0-beta.12"
const CHANNEL = "beta"

async function published(name: string, version: string) {
  return (await $`npm view ${name}@${version} version`.nothrow()).exitCode === 0
}

async function publishPackage(dir: string, name: string, version: string) {
  if (process.platform !== "win32") await $`chmod -R 755 .`.cwd(dir)
  if (await published(name, version)) {
    console.log(`  ✓ Already published ${name}@${version}`)
    return
  }
  await $`bun pm pack`.cwd(dir)
  await $`npm publish *.tgz --access public --tag ${CHANNEL}`.cwd(dir)
  console.log(`  ✓ Published ${name}@${version}`)
}

// Step 1: Build platform binaries
console.log("Building platform binaries...")
await $`bun run script/build-tui.ts`.cwd(repoRoot)

// Step 2: Publish each platform package
console.log("\nPublishing platform packages...")
const distDir = path.join(repoRoot, "dist")
let publishedCount = 0
for (const entry of fs.readdirSync(distDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const pkgJson = path.join(distDir, entry.name, "package.json")
  if (!fs.existsSync(pkgJson)) continue
  const pkg = JSON.parse(await Bun.file(pkgJson).text())
  const name = pkg.name
  if (name === "@spinosa/tui") continue // skip umbrella, handled below

  await publishPackage(path.join(distDir, entry.name), name, TUI_VERSION)
  publishedCount++
}

// Step 3: Create and publish umbrella package
console.log("\nCreating umbrella package @spinosa/tui...")
const umbrellaDir = path.join(distDir, "@spinosa/tui")
await $`mkdir -p ${umbrellaDir}/bin`

// Launcher script
const launcherScript = `#!/usr/bin/env node
const { spawn } = require("child_process")
const fs = require("fs")
const path = require("path")
const os = require("os")

const forwardedSignals = ["SIGINT", "SIGTERM", "SIGHUP"]
function run(target) {
  const child = spawn(target, process.argv.slice(2), { stdio: "inherit" })
  child.on("error", (e) => { console.error(e.message); process.exit(1) })
  for (const s of forwardedSignals) process.on(s, () => { try { child.kill(s) } catch {} })
  child.on("exit", (code, signal) => {
    for (const s of forwardedSignals) process.removeListener(s, () => {})
    if (signal) { process.kill(process.pid, signal); return }
    process.exit(typeof code === "number" ? code : 0)
  })
}

const scriptDir = path.dirname(fs.realpathSync(__filename))
const platform = { darwin: "darwin", linux: "linux", win32: "windows" }[os.platform()] || os.platform()
const arch = { x64: "x64", arm64: "arm64" }[os.arch()] || os.arch()
const base = "@spinosa/tui-" + platform + "-" + arch
const isAlpine = platform === "linux" && (() => { try { return fs.existsSync("/etc/alpine-release") } catch { return false } })()
const names = isAlpine ? [base + "-musl", base] : [base, base + "-baseline"]

function findBinary(dir) {
  let current = dir
  for (;;) {
    const modules = path.join(current, "node_modules")
    if (fs.existsSync(modules)) {
      for (const name of names) {
        const binName = platform === "windows" ? "spinosa-tui.exe" : "spinosa-tui"
        const candidate = path.join(modules, name, "bin", binName)
        if (fs.existsSync(candidate)) return candidate
      }
    }
    const parent = path.dirname(current)
    if (parent === current) return
    current = parent
  }
}

const resolved = findBinary(scriptDir)
if (!resolved) {
  console.error("spinosa-tui: platform binary not found. Run: bun install -g @spinosa/tui")
  process.exit(1)
}
run(resolved)
`

await Bun.file(path.join(umbrellaDir, "bin/spinosa-tui")).write(launcherScript)
await $`chmod +x ${umbrellaDir}/bin/spinosa-tui`

await $`mkdir -p ${umbrellaDir}/bin`
await Bun.file(path.join(umbrellaDir, "bin/spinosa-tui.exe")).write(
  [
    `@echo off`,
    `echo spinosa-tui: This command requires a Unix-like environment (macOS or Linux).`,
    `echo For Windows, use: bunx @spinosa/tui`,
    `exit /b 1`,
  ].join("\n"),
)

// Umbrella package.json with optionalDependencies for all platform packages
const platformPkgs: Record<string, string> = {}
for (const entry of fs.readdirSync(distDir, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name === "@spinosa/tui") continue
  const pkgJsonPath = path.join(distDir, entry.name, "package.json")
  if (!fs.existsSync(pkgJsonPath)) continue
  const pkg = JSON.parse(await Bun.file(pkgJsonPath).text())
  if (pkg.os && pkg.cpu) {
    platformPkgs[pkg.name] = pkg.version
  }
}

await Bun.file(path.join(umbrellaDir, "package.json")).write(
  JSON.stringify(
    {
      name: "@spinosa/tui",
      version: TUI_VERSION,
      description: "Spinosa TUI — enhanced opencode with Spinosa workspace management",
      type: "module",
      license: "MIT",
      bin: {
        "spinosa-tui": "./bin/spinosa-tui",
      },
      preferUnplugged: true,
      optionalDependencies: platformPkgs,
    },
    null,
    2,
  ),
)

// Publish umbrella
console.log(`Publishing @spinosa/tui@${TUI_VERSION}...`)
await publishPackage(umbrellaDir, "@spinosa/tui", TUI_VERSION)

console.log(`\n✓ Published ${publishedCount} platform binaries + @spinosa/tui umbrella`)
console.log(`Install: bun install -g @spinosa/tui`)
