#!/usr/bin/env bun
import { $ } from "bun"
import pkg from "../package.json"
import { Script } from "@spinosa/script"
import { fileURLToPath } from "url"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  APPROVED_PUBLISH_PACKAGES,
  platformPackageSetErrors,
  publishManifestErrors,
} from "../../../script/npm-release-config"
import { assertPlatformPackagesPublished } from "../../../script/npm-registry"
import { prepareKernelPackage } from "../../../script/prepare-kernel-package"

const dir = fileURLToPath(new URL("..", import.meta.url))
process.chdir(dir)

const releaseRepo = "medialab/spinosa"
const mainDirectory = "./dist/kernel"

function packageDirectory(name: string) {
  return name.startsWith("@spinosa/") ? name.slice("@spinosa/".length) : name
}

async function registryVersion(name: string, version: string) {
  const specifier = `${name}@${version}`
  const result = await $`npm view ${specifier} version --json --registry=https://registry.npmjs.org`.quiet().nothrow()
  if (result.exitCode !== 0) return
  try {
    const actual = JSON.parse(result.text())
    return typeof actual === "string" ? actual : undefined
  } catch {
    return
  }
}

async function published(name: string, version: string) {
  return (await registryVersion(name, version)) === version
}

async function publish(dir: string, name: string, version: string) {
  // GitHub artifact downloads can drop the executable bit, and Docker uses the
  // unpacked dist binaries directly rather than the published tarball.
  if (process.platform !== "win32") await $`chmod -R 755 .`.cwd(dir)
  if (await published(name, version)) {
    console.log(`already published ${name}@${version}`)
    return
  }
  await $`bun pm pack`.cwd(dir)
  await $`npm publish *.tgz --access public --tag ${Script.channel}`.cwd(dir)
}

const binaries: Record<string, string> = {}
for (const filepath of new Bun.Glob("*/package.json").scanSync({
  cwd: "./dist",
})) {
  const manifest = await Bun.file(`./dist/${filepath}`).json()
  const errors = publishManifestErrors(manifest, pkg.version)
  if (errors.length) throw new Error(`${filepath}: ${errors.join("; ")}`)
  binaries[manifest.name] = manifest.version
}
console.log("binaries", binaries)
const platformSetErrors = platformPackageSetErrors(Object.keys(binaries))
if (platformSetErrors.length) throw new Error(`Platform package set mismatch: ${platformSetErrors.join("; ")}`)
const version = Object.values(binaries)[0]
if (!version) throw new Error("No platform packages found in dist")

await prepareKernelPackage(mainDirectory, version, binaries)

const tasks = Object.entries(binaries).map(async ([name]) => {
  await publish(`./dist/${packageDirectory(name)}`, name, binaries[name])
})
await Promise.all(tasks)
await assertPlatformPackagesPublished(APPROVED_PUBLISH_PACKAGES.slice(1), version, registryVersion, {
  attempts: 6,
  retryDelayMs: 5_000,
})
await publish(mainDirectory, pkg.name, version)

const image = "ghcr.io/medialab/spinosa"
const platforms = "linux/amd64,linux/arm64"
const tags = [`${image}:${version}`, `${image}:${Script.channel}`]
const tagFlags = tags.flatMap((t) => ["-t", t])

// registries
if (!Script.preview) {
  await $`docker buildx build --platform ${platforms} ${tagFlags} --push .`
  // Calculate SHA values
  const arm64Sha = await $`sha256sum ./dist/spinosa-linux-arm64.tar.gz | cut -d' ' -f1`.text().then((x) => x.trim())
  const x64Sha = await $`sha256sum ./dist/spinosa-linux-x64.tar.gz | cut -d' ' -f1`.text().then((x) => x.trim())
  const macX64Sha = await $`sha256sum ./dist/spinosa-darwin-x64.zip | cut -d' ' -f1`.text().then((x) => x.trim())
  const macArm64Sha = await $`sha256sum ./dist/spinosa-darwin-arm64.zip | cut -d' ' -f1`.text().then((x) => x.trim())

  const [pkgver, _subver = ""] = Script.version.split(/(-.*)/, 2)

  // arch
  const binaryPkgbuild = [
    "# Maintainer: dax",
    "# Maintainer: adam",
    "",
    "pkgname='spinosa-bin'",
    `pkgver=${pkgver}`,
    `_subver=${_subver}`,
    "options=('!debug' '!strip')",
    "pkgrel=1",
    "pkgdesc='The AI coding agent built for the terminal.'",
    `url='https://github.com/${releaseRepo}'`,
    "arch=('aarch64' 'x86_64')",
    "license=('MIT')",
    "provides=('spinosa')",
    "conflicts=('spinosa')",
    "depends=('ripgrep')",
    "",
    `source_aarch64=("\${pkgname}_\${pkgver}_aarch64.tar.gz::https://github.com/${releaseRepo}/releases/download/v\${pkgver}\${_subver}/spinosa-linux-arm64.tar.gz")`,
    `sha256sums_aarch64=('${arm64Sha}')`,

    `source_x86_64=("\${pkgname}_\${pkgver}_x86_64.tar.gz::https://github.com/${releaseRepo}/releases/download/v\${pkgver}\${_subver}/spinosa-linux-x64.tar.gz")`,
    `sha256sums_x86_64=('${x64Sha}')`,
    "",
    "package() {",
    '  install -Dm755 ./spinosa "${pkgdir}/usr/bin/spinosa"',
    "}",
    "",
  ].join("\n")

  for (const [pkg, pkgbuild] of [["spinosa-bin", binaryPkgbuild]]) {
    for (let i = 0; i < 30; i++) {
      try {
        await $`rm -rf ./dist/aur-${pkg}`
        await $`git clone ssh://aur@aur.archlinux.org/${pkg}.git ./dist/aur-${pkg}`
        await $`cd ./dist/aur-${pkg} && git checkout master`
        await Bun.file(`./dist/aur-${pkg}/PKGBUILD`).write(pkgbuild)
        await $`cd ./dist/aur-${pkg} && makepkg --printsrcinfo > .SRCINFO`
        await $`cd ./dist/aur-${pkg} && git add PKGBUILD .SRCINFO`
        if ((await $`cd ./dist/aur-${pkg} && git diff --cached --quiet`.nothrow()).exitCode === 0) break
        await $`cd ./dist/aur-${pkg} && git commit -m "Update to v${Script.version}"`
        await $`cd ./dist/aur-${pkg} && git push`
        break
      } catch {
        continue
      }
    }
  }

  // Homebrew formula
  const homebrewFormula = [
    "# typed: false",
    "# frozen_string_literal: true",
    "",
    "# This file was generated by GoReleaser. DO NOT EDIT.",
    "class Spinosa < Formula",
    `  desc "The AI coding agent built for the terminal."`,
    `  homepage "https://github.com/${releaseRepo}"`,
    `  version "${Script.version.split("-")[0]}"`,
    "",
    `  depends_on "ripgrep"`,
    "",
    "  on_macos do",
    "    if Hardware::CPU.intel?",
    `      url "https://github.com/${releaseRepo}/releases/download/v${Script.version}/spinosa-darwin-x64.zip"`,
    `      sha256 "${macX64Sha}"`,
    "",
    "      def install",
    '        bin.install "spinosa"',
    "      end",
    "    end",
    "    if Hardware::CPU.arm?",
    `      url "https://github.com/${releaseRepo}/releases/download/v${Script.version}/spinosa-darwin-arm64.zip"`,
    `      sha256 "${macArm64Sha}"`,
    "",
    "      def install",
    '        bin.install "spinosa"',
    "      end",
    "    end",
    "  end",
    "",
    "  on_linux do",
    "    if Hardware::CPU.intel? and Hardware::CPU.is_64_bit?",
    `      url "https://github.com/${releaseRepo}/releases/download/v${Script.version}/spinosa-linux-x64.tar.gz"`,
    `      sha256 "${x64Sha}"`,
    "      def install",
    '        bin.install "spinosa"',
    "      end",
    "    end",
    "    if Hardware::CPU.arm? and Hardware::CPU.is_64_bit?",
    `      url "https://github.com/${releaseRepo}/releases/download/v${Script.version}/spinosa-linux-arm64.tar.gz"`,
    `      sha256 "${arm64Sha}"`,
    "      def install",
    '        bin.install "spinosa"',
    "      end",
    "    end",
    "  end",
    "end",
    "",
    "",
  ].join("\n")

  const token = process.env.GITHUB_TOKEN
  if (!token) {
    console.error("GITHUB_TOKEN is required to update homebrew tap")
    process.exit(1)
  }
  const askpassDir = await mkdtemp(path.join(tmpdir(), "spinosa-git-askpass-"))
  const askpass = path.join(askpassDir, "askpass.sh")
  await writeFile(
    askpass,
    `#!/bin/sh
case "$1" in
  *Username*) printf '%s\\n' x-access-token ;;
  *Password*) printf '%s\\n' "$GITHUB_TOKEN" ;;
  *) exit 1 ;;
esac
`,
    { mode: 0o700 },
  )
  const gitEnv = {
    ...process.env,
    GIT_ASKPASS: askpass,
    GIT_TERMINAL_PROMPT: "0",
    GITHUB_TOKEN: token,
  }
  try {
    await $`rm -rf ./dist/homebrew-tap`
    await $`git clone https://github.com/medialab/homebrew-tap.git ./dist/homebrew-tap`.env(gitEnv)
    await Bun.file("./dist/homebrew-tap/spinosa.rb").write(homebrewFormula)
    await $`cd ./dist/homebrew-tap && git add spinosa.rb`
    if ((await $`cd ./dist/homebrew-tap && git diff --cached --quiet`.nothrow()).exitCode !== 0) {
      await $`cd ./dist/homebrew-tap && git commit -m "Update to v${Script.version}"`
      await $`cd ./dist/homebrew-tap && git push`.env(gitEnv)
    }
  } finally {
    await rm(askpassDir, { recursive: true, force: true })
  }
}
