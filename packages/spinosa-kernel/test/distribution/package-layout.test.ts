import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { APPROVED_PUBLISH_PACKAGES } from "../../../../script/npm-release-config"

async function source(relative: string) {
  return readFile(new URL(relative, import.meta.url), "utf8")
}

describe("Spinosa distribution layout", () => {
  test("installer validates the transitioned kernel package", async () => {
    const installer = await source("../../../../install.sh")

    expect(installer).toContain('${fw_dir}/packages/spinosa-kernel')
    expect(installer).toContain('${fw_root}/packages/spinosa-kernel')
    expect(installer).not.toContain('${fw_dir}/packages/opencode')
    expect(installer).not.toContain('${fw_root}/packages/opencode')
  })

  test("platform packages and launchers agree on scoped names and the binary", async () => {
    const [build, launcher, publish, dockerfile] = await Promise.all([
      source("../../script/build.ts"),
      source("../../bin/spinosa"),
      source("../../script/publish.ts"),
      source("../../Dockerfile"),
    ])

    expect(build).toContain('outfile: `dist/${directory}/bin/spinosa`')
    expect(build).toContain("createPlatformPackageManifest")
    expect(build).toContain("platformPackageName")
    expect(build).toContain("if (!buildResult.success)")
    expect(build).toContain("fs.statSync(binaryPath).isFile()")
    expect(launcher).toStartWith("#!/usr/bin/env bun\n")
    expect(launcher).toContain("packageNameForPlatform")
    expect(launcher).not.toContain("SPINOSA_BIN_PATH")
    expect(launcher).not.toContain("npm install")
    expect(launcher).not.toContain("postinstall")
    expect(publish).toContain("createKernelPackageManifest")
    expect(publish).toContain("publishManifestErrors")
    expect(publish).toContain("cp -R ./bin/.")
    expect(publish).not.toContain('pkg.name + "-ai"')
    expect(publish).not.toContain("anomalyco/opencode")
    expect(publish).toContain("GIT_ASKPASS: askpass")
    expect(publish).toContain("https://github.com/medialab/homebrew-tap.git")
    expect(publish).not.toContain("x-access-token:${token}")
    expect(dockerfile).toContain("dist/kernel-linux-x64-baseline-musl/bin/spinosa")
    expect(dockerfile).toContain('ENTRYPOINT ["spinosa"]')
  })

  test("source package launcher runs in the package's ESM context", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "spinosa-kernel-layout-"))
    try {
      const kernelBin = path.join(root, "node_modules", "@spinosa", "kernel", "bin")
      const launcher = path.join(kernelBin, "spinosa")
      await mkdir(kernelBin, { recursive: true })
      await writeFile(launcher, await source("../../bin/spinosa"), { mode: 0o755 })
      await writeFile(path.join(kernelBin, "platform.ts"), await source("../../bin/platform.ts"))

      for (const packageName of APPROVED_PUBLISH_PACKAGES.slice(1)) {
        const platformBin = path.join(root, "node_modules", ...packageName.split("/"), "bin")
        await mkdir(platformBin, { recursive: true })
        await writeFile(
          path.join(platformBin, "spinosa"),
          `#!/usr/bin/env bun\nconsole.log(${JSON.stringify(packageName)})\n`,
          { mode: 0o755 },
        )
      }

      const child = Bun.spawn([launcher], {
        stdout: "pipe",
        stderr: "pipe",
      })
      expect(await child.exited).toBe(0)
      const selectedPackage = (await new Response(child.stdout).text()).trim()
      expect(APPROVED_PUBLISH_PACKAGES.slice(1)).toContain(selectedPackage)
      expect((await stat(new URL("../../bin/spinosa", import.meta.url))).mode & 0o111).not.toBe(0)

      await rm(path.join(root, "node_modules", ...selectedPackage.split("/")), { recursive: true })
      const missing = Bun.spawn([launcher], {
        stdout: "pipe",
        stderr: "pipe",
      })
      expect(await missing.exited).toBe(1)
      const error = await new Response(missing.stderr).text()
      expect(error).toContain(`Spinosa platform package ${selectedPackage} is missing`)
      expect(error).toContain("does not download packages at runtime")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("PR command launches the Spinosa executable with the computed arguments", async () => {
    const command = await source("../../src/cli/cmd/pr.ts")

    expect(command).toContain('const spinosaArgs = sessionId ? ["-s", sessionId] : []')
    expect(command).toContain('Process.spawn(["spinosa", ...spinosaArgs]')
    expect(command).not.toContain("...opencodeArgs")
  })

  test("release metadata uses the scoped kernel package and tolerates an absent team file", async () => {
    const script = await source("../../../script/src/index.ts")

    expect(script).toContain('path.resolve(import.meta.dir, "../../../package.json")')
    expect(script).toContain("npmTagForVersion(VERSION)")
    expect(script).toContain("await Bun.file(teamPath).exists()")
  })

  test("generated migration state and local tooling cannot be committed", async () => {
    const [ignore, transition, cutover] = await Promise.all([
      source("../../../../.gitignore"),
      source("../../../../docs/review/workpackages_spinosa_kernel_transition_27072026/overview.md"),
      source("../../../../docs/review/workpackages_spinosa_total_cutover_27072026/overview.md"),
    ])

    expect(ignore).toContain("/packages/spinosa-kernel/.spinosa-migration-report.json")
    expect(ignore).toContain("/.serena/")
    expect(transition).not.toMatch(/\/(?:Users|home)\/[^/]+/)
    expect(cutover).not.toMatch(/\/(?:Users|home)\/[^/]+/)
  })
})
