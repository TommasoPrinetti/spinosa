#!/usr/bin/env bun

import { lstat, mkdir, mkdtemp, readdir, readlink, realpath, rm, writeFile } from "node:fs/promises"
import { existsSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  APPROVED_PUBLISH_PACKAGES,
  publishManifestErrors,
} from "./npm-release-config"
import { packageNameForPlatform } from "../packages/spinosa-kernel/bin/platform"
import { prepareKernelPackage } from "./prepare-kernel-package"

const root = path.resolve(import.meta.dir, "..")
const kernelRoot = path.join(root, "packages/spinosa-kernel")
const dist = path.join(kernelRoot, "dist")
const version = (await Bun.file(path.join(root, "package.json")).json()).version
const temp = await mkdtemp(path.join(tmpdir(), "spinosa-packed-install-"))

function packageDirectory(name: string) {
  return name.slice("@spinosa/".length)
}

async function run(command: string[], options: { cwd?: string; env?: Record<string, string | undefined> } = {}) {
  const child = Bun.spawn(command, {
    cwd: options.cwd,
    env: options.env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  if (exitCode !== 0) {
    throw new Error(`${command.join(" ")} failed with ${exitCode}\n${stdout}${stderr}`)
  }
  return { stdout, stderr }
}

async function pack(directory: string, tarball: string) {
  await run(["bun", "pm", "pack", "--filename", tarball, "--ignore-scripts"], { cwd: directory })
}

async function archiveFiles(tarball: string) {
  const result = await run(["tar", "-tzf", tarball])
  return result.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .sort()
}

function currentLibc() {
  if (process.platform !== "linux") return
  if (existsSync("/etc/alpine-release")) return "musl"
  const result = Bun.spawnSync(["ldd", "--version"], { stdout: "pipe", stderr: "pipe" })
  const decoder = new TextDecoder()
  return `${decoder.decode(result.stdout)}${decoder.decode(result.stderr)}`.toLowerCase().includes("musl")
    ? "musl"
    : "glibc"
}

function supportsAvx2() {
  if (process.arch !== "x64") return true
  if (process.platform === "linux") {
    try {
      return /(^|\s)avx2(\s|$)/i.test(readFileSync("/proc/cpuinfo", "utf8"))
    } catch {
      return false
    }
  }
  if (process.platform === "darwin") {
    const result = Bun.spawnSync(["sysctl", "-n", "hw.optional.avx2_0"], { stdout: "pipe", stderr: "pipe" })
    return new TextDecoder().decode(result.stdout).trim() === "1"
  }
  return false
}

async function assertContainedSymlinks(directory: string, boundary: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filepath = path.join(directory, entry.name)
    const metadata = await lstat(filepath)
    if (metadata.isSymbolicLink()) {
      const resolved = await realpath(filepath)
      if (resolved !== boundary && !resolved.startsWith(`${boundary}${path.sep}`)) {
        throw new Error(`Installed symlink escapes node_modules: ${filepath} -> ${await readlink(filepath)}`)
      }
      continue
    }
    if (metadata.isDirectory()) await assertContainedSymlinks(filepath, boundary)
  }
}

async function startupSmoke(
  executable: string,
  cwd: string,
  env: Record<string, string | undefined>,
  runtimeRoot: string,
) {
  const stdoutPath = path.join(runtimeRoot, "serve.stdout.log")
  const stderrPath = path.join(runtimeRoot, "serve.stderr.log")
  await Promise.all([Bun.write(stdoutPath, ""), Bun.write(stderrPath, "")])
  const child = Bun.spawn(
    [executable, "serve", "--port", "0", "--hostname", "127.0.0.1", "--pure", "--print-logs"],
    {
    cwd,
    env: {
      ...env,
      CI: "1",
      TERM: "xterm-256color",
    },
    stdin: "ignore",
      stdout: Bun.file(stdoutPath),
      stderr: Bun.file(stderrPath),
    },
  )
  let exitCode: number | undefined
  void child.exited.then((code) => {
    exitCode = code
  })
  try {
    for (let attempt = 0; attempt < 150; attempt++) {
      const output = `${await Bun.file(stdoutPath).text()}${await Bun.file(stderrPath).text()}`
      if (/listening on http:\/\//i.test(output)) return
      if (exitCode !== undefined) throw new Error(`spinosa server exited with ${exitCode} before readiness\n${output}`)
      await Bun.sleep(100)
    }
    const output = `${await Bun.file(stdoutPath).text()}${await Bun.file(stderrPath).text()}`
    throw new Error(`spinosa server did not report readiness within 15 seconds\n${output}`)
  } finally {
    if (exitCode === undefined) child.kill("SIGTERM")
    const terminated = await Promise.race([
      child.exited.then(() => true),
      Bun.sleep(2_000).then(() => false),
    ])
    if (!terminated) {
      child.kill("SIGKILL")
      await child.exited
    }
  }
}

try {
  const artifacts = path.join(temp, "artifacts")
  const staging = path.join(temp, "staging/kernel")
  const project = path.join(temp, "project")
  await mkdir(artifacts, { recursive: true })

  const tarballs = new Map<string, string>()
  for (const name of APPROVED_PUBLISH_PACKAGES.slice(1)) {
    const packageRoot = path.join(dist, packageDirectory(name))
    const manifest = await Bun.file(path.join(packageRoot, "package.json")).json()
    const errors = publishManifestErrors(manifest, version)
    if (errors.length) throw new Error(`${name}: ${errors.join("; ")}`)
    const tarball = path.join(artifacts, `${packageDirectory(name)}.tgz`)
    await pack(packageRoot, tarball)
    const files = await archiveFiles(tarball)
    const expected = ["package/LICENSE", "package/README.md", "package/bin/spinosa", "package/package.json"].sort()
    if (JSON.stringify(files) !== JSON.stringify(expected)) {
      throw new Error(`${name} packed unexpected files:\n${files.join("\n")}`)
    }
    tarballs.set(name, tarball)
  }

  const optionalDependencies = Object.fromEntries(APPROVED_PUBLISH_PACKAGES.slice(1).map((name) => [name, version]))
  await prepareKernelPackage(staging, version, optionalDependencies)
  const kernelTarball = path.join(artifacts, "kernel.tgz")
  await pack(staging, kernelTarball)
  const kernelFiles = await archiveFiles(kernelTarball)
  const expectedKernelFiles = [
    "package/LICENSE",
    "package/README.md",
    "package/bin/platform.ts",
    "package/bin/spinosa",
    "package/package.json",
  ].sort()
  if (JSON.stringify(kernelFiles) !== JSON.stringify(expectedKernelFiles)) {
    throw new Error(`@spinosa/kernel packed unexpected files:\n${kernelFiles.join("\n")}`)
  }

  const libc = currentLibc()
  const compatiblePackages: string[] = []
  for (const name of APPROVED_PUBLISH_PACKAGES.slice(1)) {
    const manifest = await Bun.file(path.join(dist, packageDirectory(name), "package.json")).json()
    if (!manifest.os?.includes(process.platform) || !manifest.cpu?.includes(process.arch)) continue
    if (process.platform === "linux" && !manifest.libc?.includes(libc)) continue
    compatiblePackages.push(name)
  }
  if (!compatiblePackages.length) throw new Error(`No packed platform package matches ${process.platform}/${process.arch}`)
  const expectedPlatformPackage = packageNameForPlatform({
    platform: process.platform,
    arch: process.arch,
    musl: currentLibc() === "musl",
    avx2: supportsAvx2(),
  })
  if (!compatiblePackages.includes(expectedPlatformPackage)) {
    throw new Error(`Expected packed platform package ${expectedPlatformPackage} is not compatible`)
  }

  await mkdir(project, { recursive: true })
  await writeFile(path.join(project, "package.json"), JSON.stringify({ name: "spinosa-packed-install-test", private: true }))
  await writeFile(path.join(project, "bunfig.toml"), '[install]\nregistry = "http://127.0.0.1:9"\n')
  const installEnv = {
    ...process.env,
    BUN_INSTALL: path.join(temp, "bun-install"),
    BUN_INSTALL_CACHE_DIR: path.join(temp, "bun-cache"),
    HOME: path.join(temp, "install-home"),
  }
  await run(["bun", "add", "--exact", kernelTarball, ...compatiblePackages.map((name) => tarballs.get(name)!)], {
    cwd: project,
    env: installEnv,
  })
  const consumerManifest = await Bun.file(path.join(project, "package.json")).json()
  const installedSpecs = Object.values(consumerManifest.dependencies ?? {})
  const hasNonLocalSpec = installedSpecs.some((specifier) => {
    if (typeof specifier !== "string") return true
    const resolved = path.resolve(project, specifier.startsWith("file:") ? specifier.slice("file:".length) : specifier)
    return !resolved.startsWith(`${artifacts}${path.sep}`) || !resolved.endsWith(".tgz")
  })
  if (hasNonLocalSpec) {
    throw new Error(`Packed install resolved a non-local dependency: ${JSON.stringify(consumerManifest.dependencies)}`)
  }

  const nodeModules = await realpath(path.join(project, "node_modules"))
  await assertContainedSymlinks(nodeModules, nodeModules)
  for (const name of compatiblePackages) {
    if (name === expectedPlatformPackage) continue
    await rm(path.join(project, "node_modules", ...name.split("/")), { recursive: true, force: true })
  }
  if (!existsSync(path.join(project, "node_modules", ...expectedPlatformPackage.split("/"), "bin", "spinosa"))) {
    throw new Error(`Expected installed platform package ${expectedPlatformPackage} is missing`)
  }
  const executable = path.join(project, "node_modules/.bin/spinosa")
  const runtimeRoot = path.join(temp, "runtime")
  const runtimeEnv = {
    ...process.env,
    HOME: path.join(runtimeRoot, "home"),
    SPINOSA_HOME: path.join(runtimeRoot, "spinosa"),
    SPINOSA_TEST_HOME: path.join(runtimeRoot, "home"),
    SPINOSA_CONFIG_DIR: path.join(runtimeRoot, "config"),
    XDG_CACHE_HOME: path.join(runtimeRoot, "cache"),
    XDG_CONFIG_HOME: path.join(runtimeRoot, "config"),
    XDG_DATA_HOME: path.join(runtimeRoot, "data"),
    XDG_STATE_HOME: path.join(runtimeRoot, "state"),
  }
  const versionResult = await run([executable, "--version"], { cwd: project, env: runtimeEnv })
  if (!versionResult.stdout.includes(version)) {
    throw new Error(`Packed spinosa reported unexpected version: ${versionResult.stdout.trim()}`)
  }
  await run([executable, "--help"], { cwd: project, env: runtimeEnv })
  await startupSmoke(executable, project, runtimeEnv, runtimeRoot)

  console.log(
    `Packed-install smoke passed for @spinosa/kernel@${version} with ${expectedPlatformPackage}`,
  )
} finally {
  await rm(temp, { recursive: true, force: true })
}
