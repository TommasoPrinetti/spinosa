#!/usr/bin/env bun
// ── build-tui.ts — Compile spinosa-tui into platform binaries ─────────────
// Based on packages/spinosa-kernel/script/build.ts but adapted for the spinosa fork.
//
// Usage: bun run script/build-tui.ts [--single] [--skip-install] [--sourcemaps]

import { $ } from "bun"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { createSolidTransformPlugin } from "../packages/spinosa-kernel/node_modules/@opentui/solid/scripts/solid-plugin.ts"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, "..")

process.chdir(repoRoot)

const singleFlag = process.argv.includes("--single")
const skipInstall = process.argv.includes("--skip-install")
const sourcemapsFlag = process.argv.includes("--sourcemaps")
const plugin = createSolidTransformPlugin()

const rootPkg = await Bun.file(path.join(repoRoot, "package.json")).json()
const TUI_VERSION: string = rootPkg.version

const allTargets: {
  os: string
  arch: "arm64" | "x64"
  abi?: "musl"
  avx2?: false
}[] = [
  { os: "darwin", arch: "arm64" },
  { os: "darwin", arch: "x64" },
  { os: "darwin", arch: "x64", avx2: false },
  { os: "linux", arch: "arm64" },
  { os: "linux", arch: "x64" },
  { os: "linux", arch: "x64", avx2: false },
  { os: "linux", arch: "arm64", abi: "musl" },
  { os: "linux", arch: "x64", abi: "musl" },
  { os: "linux", arch: "x64", abi: "musl", avx2: false },
  { os: "win32", arch: "arm64" },
  { os: "win32", arch: "x64" },
  { os: "win32", arch: "x64", avx2: false },
]

const targets = singleFlag
  ? allTargets.filter((t) => t.os === process.platform && t.arch === process.arch && !t.abi)
  : allTargets

const kernelPkg = await Bun.file("packages/spinosa-kernel/package.json").json()

await $`rm -rf dist`

// Pre-install native modules for all platforms (needs the version from opencode's deps)
if (!skipInstall) {
  await $`bun install --os="*" --cpu="*" @opentui/core@${kernelPkg.dependencies["@opentui/core"]}`
  await $`bun install --os="*" --cpu="*" @parcel/watcher@${kernelPkg.dependencies["@parcel/watcher"]}`
  await $`bun install --os="*" --cpu="*" @ff-labs/fff-bun@${kernelPkg.dependencies["@ff-labs/fff-bun"]}`
}

// ── Build each platform target ──────────────────────────────────────────────
const buildErrors: string[] = []
for (const item of targets) {
  const name = [
    "@spinosa/tui",
    item.os === "win32" ? "windows" : item.os,
    item.arch,
    item.avx2 === false ? "baseline" : undefined,
    item.abi === undefined ? undefined : item.abi,
  ]
    .filter(Boolean)
    .join("-")

  console.log(`Building ${name}...`)
  await $`mkdir -p dist/${name}/bin`

  const binaryName = item.os === "win32" ? "spinosa-tui.exe" : "spinosa-tui"
  const kernelDir = path.resolve(repoRoot, "packages/spinosa-kernel")

  // Find the @opentui/core parser worker binary
  const parserWorker = (() => {
    const local = path.join(kernelDir, "node_modules/@opentui/core/parser.worker.js")
    if (fs.existsSync(local)) return fs.realpathSync(local)
    const root = path.resolve(repoRoot, "node_modules/@opentui/core/parser.worker.js")
    if (fs.existsSync(root)) return fs.realpathSync(root)
    throw new Error("Could not find @opentui/core/parser.worker.js")
  })()
  const workerPath = "./src/cli/tui/worker.ts"
  const bunfsRoot = item.os === "win32" ? "B:/~BUN/root/" : "/$bunfs/root/"
  const parserWorkerRelativePath = path.relative(kernelDir, parserWorker).replaceAll("\\", "/")
  console.log(`  parserWorker: ${parserWorker}`)
  console.log(`  workerPath: ${workerPath}`)

  let result
  try {
    result = await Bun.build({
      conditions: ["bun", "node"],
      tsconfig: path.join(kernelDir, "tsconfig.json"),
      plugins: [plugin],
      external: ["node-gyp", "youtube-transcript", "unzipper"],
      format: "esm",
      minify: true,
      sourcemap: sourcemapsFlag ? "linked" : "none",
      splitting: true,
      compile: {
        autoloadBunfig: false,
        autoloadDotenv: false,
        autoloadTsconfig: true,
        autoloadPackageJson: true,
        target: name.replace("@spinosa/tui", "bun") as any,
        outfile: `dist/${name}/bin/${binaryName}`,
        execArgv: [`--user-agent=spinosa-tui/${TUI_VERSION}`, "--use-system-ca", "--"],
        windows: {},
      },
      entrypoints: [
        path.join(repoRoot, "packages/spinosa-cli/src/compiled.ts"),
        parserWorker,
        path.join(kernelDir, "src/cli/tui/worker.ts"),
      ],
      define: {
        FFF_LIBC: JSON.stringify(item.abi === "musl" ? "musl" : "gnu"),
        SPINOSA_VERSION: `'${TUI_VERSION}'`,
        SPINOSA_CHANNEL: "'beta'",
        OTUI_TREE_SITTER_WORKER_PATH: bunfsRoot + parserWorkerRelativePath,
        SPINOSA_WORKER_PATH: workerPath,
        SPINOSA_LIBC: item.os === "linux" ? `'${item.abi ?? "glibc"}'` : "",
        ...(item.os === "linux" ? { "process.env.OPENTUI_LIBC": JSON.stringify(item.abi ?? "glibc") } : {}),
      },
    })
  } catch (err) {
    const detail = err instanceof AggregateError ? err.errors.map(String).join("; ") : err instanceof Error ? err.message : String(err)
    buildErrors.push(`${name}: ${detail}`)
    console.error(`  Build failed for ${name}: ${detail}`)
    continue
  }

  if (!result.success) {
    const logs = result.logs?.map((l) => l.message).join("; ") ?? "unknown error"
    buildErrors.push(`${name}: ${logs}`)
    console.error(`  Build failed for ${name}: ${logs}`)
    continue
  }

  // Smoke test: run --version on current platform
  if (item.os === process.platform && item.arch === process.arch && !item.abi) {
    console.log(`  Smoke test: ${binaryName} --version`)
    try {
      const versionOutput = await $`./dist/${name}/bin/${binaryName} --version`.text()
      console.log(`  Version: ${versionOutput.trim()}`)
    } catch (e) {
      console.error(`  Smoke test failed for ${name}:`, e)
      buildErrors.push(`${name}: smoke test failed`)
    }
  }

  // Write platform package.json
  await Bun.file(`dist/${name}/package.json`).write(
    JSON.stringify(
      {
        name,
        version: TUI_VERSION,
        preferUnplugged: true,
        os: [item.os],
        cpu: [item.arch],
        ...(item.abi ? { libc: [item.abi] } : {}),
      },
      null,
      2,
    ),
  )
}

if (buildErrors.length > 0) {
  console.error(`\n${buildErrors.length} build target(s) failed:`)
  for (const err of buildErrors) console.error(`  - ${err}`)
  process.exit(1)
}

console.log("\nBuild complete. Platform binaries in dist/")
