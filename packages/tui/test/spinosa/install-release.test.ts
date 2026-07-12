import { describe, expect, test } from "bun:test"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "../fixture/fixture"
import { installedUpgradeVersion, verifyInstallerChecksum } from "../../src/spinosa-core/commands/upgrade"

const repoRoot = path.resolve(import.meta.dir, "../../../..")

describe("install and release flow", () => {
  test("installer dry-run uses GitHub auto-tarball and workspace-template layout", async () => {
    await using tmp = await tmpdir()
    const result = Bun.spawnSync({
      cmd: [
        "bash",
        path.join(repoRoot, "install.sh"),
        "--dry-run",
        "--version",
        "0.8.0-beta.16",
        "--yes",
        "--no-launch",
        "--no-modify-path",
      ],
      cwd: repoRoot,
      env: {
        ...process.env,
        SPINOSA_HOME: path.join(tmp.path, "home"),
        SPINOSA_BIN_DIR: path.join(tmp.path, "bin"),
        NO_COLOR: "1",
      },
      stdout: "pipe",
      stderr: "pipe",
    })

    const output = `${result.stdout.toString()}\n${result.stderr.toString()}`
    expect(result.exitCode).toBe(0)
    expect(output).toContain("https://github.com/TommasoPrinetti/spinosa/archive/refs/tags/v0.8.0-beta.16.tar.gz")
    expect(output).toContain(`/versions/0.8.0-beta.16/`)
    expect(output).not.toContain("spinosa-framework-")
  })

  test("committed installer version matches package version", async () => {
    const pkg = await Bun.file(path.join(repoRoot, "package.json")).json() as { version: string }
    const installer = await Bun.file(path.join(repoRoot, "install.sh")).text()
    expect(installer).toContain(`PINNED_VERSION="${pkg.version}"`)
  })

  test("local release script publishes versioned and rolling channel assets", async () => {
    const releaseScript = await Bun.file(path.join(repoRoot, "script", "release.sh")).text()
    expect(releaseScript).toContain("CHANNEL_DIST=\"dist/${CHANNEL}\"")
    expect(releaseScript).toContain("\"${CHANNEL_DIST}/install.sh\"")
    expect(releaseScript).toContain("\"${CHANNEL_DIST}/checksums.txt\"")
    expect(releaseScript).toContain("shasum -a 256 install.sh")
  })

  test("installer uses one global lock and stages before replacing a version", async () => {
    const installer = await Bun.file(path.join(repoRoot, "install.sh")).text()
    expect(installer).toContain('versions/.install.lock')
    expect(installer).not.toContain('versions/.lock.${$}-${VERSION}')
    expect(installer.indexOf('install_bun_dependencies "$fw_root"')).toBeLessThan(installer.indexOf('mv "$INSTALL_STAGE_DIR" "$version_dir"'))
    expect(installer).toContain('mv "${INSTALL_BACKUP_DIR}" "${SPINOSA_HOME}/versions/${VERSION}"')
  })

  test("uninstaller rejects a non-Spinosa home", async () => {
    await using tmp = await tmpdir()
    const sentinel = path.join(tmp.path, "keep.txt")
    await Bun.write(sentinel, "keep\n")
    const result = Bun.spawnSync({
      cmd: ["bash", path.join(repoRoot, "workspace-template", ".bin", "spinosa"), "uninstall", "--yes"],
      cwd: repoRoot,
      env: { ...process.env, SPINOSA_HOME: tmp.path, NO_COLOR: "1" },
      stdout: "pipe",
      stderr: "pipe",
    })
    expect(result.exitCode).toBe(1)
    expect(await Bun.file(sentinel).text()).toBe("keep\n")
  })

  test("installed launcher derives a custom installation root from its bin directory", async () => {
    const launcher = await Bun.file(path.join(repoRoot, "workspace-template", ".bin", "spinosa")).text()
    expect(launcher).toContain('"${SCRIPT_DIR}/../versions"')
    expect(launcher).toContain("export SPINOSA_HOME")
    expect(launcher).toContain('spinosa-cli.ts" preflight')
    expect(launcher).toContain('[[ "$preflight_status" -eq 10 ]] && exit 0')
    expect(launcher).toContain('launcher_command="${launcher_args[$command_index]:-}"')
  })

  test("rejects installer checksum mismatch", () => {
    const installer = "#!/bin/bash\necho ok\n"
    expect(verifyInstallerChecksum(installer, `${Bun.CryptoHasher.hash("sha256", installer, "hex")}  install.sh\n`)).toBe(true)
    expect(verifyInstallerChecksum(`${installer}# changed\n`, `${Bun.CryptoHasher.hash("sha256", installer, "hex")}  install.sh\n`)).toBe(false)
  })

  test("verifies an upgrade against the newly installed target", async () => {
    await using tmp = await tmpdir()
    const target = path.join(tmp.path, "versions", "1.2.3", "metadata")
    await mkdir(target, { recursive: true })
    await Bun.write(path.join(target, "version"), "1.2.3\n")

    expect(installedUpgradeVersion("1.2.3", tmp.path)).toBe("1.2.3")
  })
})
