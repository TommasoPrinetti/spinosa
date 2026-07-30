import { describe, expect, test } from "bun:test"
import { readFile } from "fs/promises"
import { fileURLToPath } from "url"

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
    const [build, postinstall, launcher, dockerfile] = await Promise.all([
      source("../../script/build.ts"),
      source("../../script/postinstall.mjs"),
      source("../../bin/spinosa"),
      source("../../Dockerfile"),
    ])

    expect(build).toContain('outfile: `dist/${directory}/bin/spinosa`')
    expect(build).toContain('name: packageName')
    expect(postinstall).toContain('const base = `@spinosa/kernel-${platform}-${arch}`')
    expect(postinstall).toContain('platform === "windows" ? "spinosa.exe" : "spinosa"')
    expect(launcher).toContain('const base = "@spinosa/kernel-" + platform + "-" + arch')
    expect(launcher).toContain('platform === "windows" ? "spinosa.exe" : "spinosa"')
    expect(launcher).toContain('fileURLToPath(import.meta.url)')
    expect(dockerfile).toContain("dist/kernel-linux-x64-baseline-musl/bin/spinosa")
    expect(dockerfile).toContain('ENTRYPOINT ["spinosa"]')
  })

  test("source package launcher runs in the package's ESM context", async () => {
    const launcher = fileURLToPath(new URL("../../bin/spinosa", import.meta.url))
    const executable = process.execPath
    const child = Bun.spawn([executable, launcher, "--version"], {
      env: { ...Bun.env, SPINOSA_BIN_PATH: executable },
      stdout: "pipe",
      stderr: "pipe",
    })

    expect(await child.exited).toBe(0)
    expect((await new Response(child.stdout).text()).trim()).toMatch(/^\d+\.\d+\.\d+/)
  })

  test("PR command launches the Spinosa executable with the computed arguments", async () => {
    const command = await source("../../src/cli/cmd/pr.ts")

    expect(command).toContain('const spinosaArgs = sessionId ? ["-s", sessionId] : []')
    expect(command).toContain('Process.spawn(["spinosa", ...spinosaArgs]')
    expect(command).not.toContain("...opencodeArgs")
  })

  test("release metadata uses the scoped kernel package and tolerates an absent team file", async () => {
    const script = await source("../../../script/src/index.ts")

    expect(script).toContain("https://registry.npmjs.org/@spinosa%2Fkernel/latest")
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
