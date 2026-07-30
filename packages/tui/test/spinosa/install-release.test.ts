import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { chmod, mkdir } from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "../fixture/fixture"
import { installedUpgradeVersion, verifyInstallerChecksum } from "@spinosa/core/commands/upgrade"

const repoRoot = path.resolve(import.meta.dir, "../../../..")

describe("install and release flow", () => {
  test("installer dry-run uses immutable release archive and workspace-template layout", async () => {
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
    expect(output).toContain("https://github.com/medialab/spinosa/releases/download/v0.8.0-beta.16/spinosa-v0.8.0-beta.16.tar.gz")
    expect(output).toContain(`/versions/0.8.0-beta.16/`)
    expect(output).not.toContain("spinosa-framework-")
    expect(existsSync(path.join(tmp.path, "home"))).toBe(false)
    expect(output).not.toContain("\u001b[")
  })

  test("installer rejects unsafe and foreign install roots without mutating them", async () => {
    await using tmp = await tmpdir()
    const foreignHome = path.join(tmp.path, "foreign")
    const sentinel = path.join(foreignHome, "keep.txt")
    await mkdir(foreignHome, { recursive: true })
    await Bun.write(sentinel, "keep\n")

    const foreign = Bun.spawnSync({
      cmd: ["bash", path.join(repoRoot, "install.sh"), "--dry-run", "--prefix", foreignHome, "--version", "1.0.0"],
      env: { ...process.env, NO_COLOR: "1" },
      stdout: "pipe",
      stderr: "pipe",
    })
    const root = Bun.spawnSync({
      cmd: ["bash", path.join(repoRoot, "install.sh"), "--dry-run", "--prefix", "/", "--version", "1.0.0"],
      env: { ...process.env, NO_COLOR: "1" },
      stdout: "pipe",
      stderr: "pipe",
    })

    expect(foreign.exitCode).toBe(1)
    expect(root.exitCode).toBe(1)
    expect(await Bun.file(sentinel).text()).toBe("keep\n")
  })

  test("installer recognizes legacy Spinosa shims without an ownership marker", async () => {
    await using tmp = await tmpdir()
    const home = path.join(tmp.path, "home")
    const bin = path.join(tmp.path, "bin")
    const shim = path.join(bin, "spinosa")
    await mkdir(bin, { recursive: true })
    await Bun.write(
      shim,
      ["#!/bin/sh", `home=\"${home}\"`, 'target="${home}/bin/spinosa"', 'exec bash "$target" "$@"', ""].join("\n"),
    )

    const result = Bun.spawnSync({
      cmd: ["bash", "-c", 'installer="$1"; shim="$2"; set --; source "$installer"; is_owned_spinosa_shim "$shim"', "spinosa-test", path.join(repoRoot, "install.sh"), shim],
      env: { ...process.env, SPINOSA_INSTALLER_LIB_ONLY: "1", SPINOSA_HOME: home, SPINOSA_BIN_DIR: bin, NO_COLOR: "1" },
      stdout: "pipe",
      stderr: "pipe",
    })

    expect(result.exitCode).toBe(0)
  })

  test("installer uses the TUI wave for indeterminate work", () => {
    const result = Bun.spawnSync({
      cmd: ["bash", "-c", 'installer="$1"; set --; source "$installer"; wave_string 0', "spinosa-test", path.join(repoRoot, "install.sh")],
      env: { ...process.env, SPINOSA_INSTALLER_LIB_ONLY: "1", NO_COLOR: "1" },
      stdout: "pipe",
      stderr: "pipe",
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout.toString()).toBe("▁▂▃▄▅▆")
  })

  test("non-TTY steps report lifecycle, enforce timeout, and emit no control bytes", () => {
    const installer = path.join(repoRoot, "install.sh")
    const result = Bun.spawnSync({
      cmd: ["bash", "-c", 'installer="$1"; set --; source "$installer"; run_timed_step "Hung step" 1 bash -c "sleep 5"', "test", installer],
      env: { ...process.env, SPINOSA_INSTALLER_LIB_ONLY: "1", NO_COLOR: "1" },
      stdout: "pipe",
      stderr: "pipe",
    })
    const output = `${result.stdout.toString()}${result.stderr.toString()}`
    expect(result.exitCode).toBe(124)
    expect(output).toContain("START Hung step (timeout 1s)")
    expect(output).toContain("timed out after 1s")
    expect(output).not.toContain("\u001b[")
  })

  test("installer never evicts a lock owned by a live process", async () => {
    await using tmp = await tmpdir()
    const home = path.join(tmp.path, "home")
    await mkdir(path.join(home, "metadata"), { recursive: true })
    await mkdir(path.join(home, "versions", ".install.lock"), { recursive: true })
    await Bun.write(path.join(home, "metadata", "config.yaml"), "spinosa: true\n")
    await Bun.write(path.join(home, "versions", ".install.lock", "pid"), `${process.pid}\n`)

    const result = Bun.spawnSync({
      cmd: ["bash", path.join(repoRoot, "install.sh"), "--yes", "--version", "1.0.0"],
      env: {
        ...process.env,
        SPINOSA_HOME: home,
        SPINOSA_BIN_DIR: path.join(tmp.path, "bin"),
        NO_COLOR: "1",
      },
      stdout: "pipe",
      stderr: "pipe",
    })

    expect(result.exitCode).toBe(1)
    expect(result.stderr.toString()).toContain("Another Spinosa installer is running")
    expect(existsSync(path.join(home, "versions", ".install.lock"))).toBe(true)
  })

  test("installer compares SemVer without GNU sort", () => {
    const installer = path.join(repoRoot, "install.sh")
    const result = Bun.spawnSync({
      cmd: [
        "bash",
        "-c",
        'installer="$1"; set --; source "$installer"; compare_versions 1.10.0 1.9.0 || a=$?; compare_versions 1.0.0-beta.2 1.0.0-beta.10 || b=$?; compare_versions 1.0.0 1.0.0-rc.1 || c=$?; printf "%s %s %s\\n" "$a" "$b" "$c"',
        "test",
        installer,
      ],
      env: { ...process.env, SPINOSA_INSTALLER_LIB_ONLY: "1", NO_COLOR: "1" },
      stdout: "pipe",
      stderr: "pipe",
    })
    expect(result.exitCode).toBe(0)
    expect(result.stdout.toString().trim()).toBe("1 2 1")
  })

  test("committed installer version matches package version", async () => {
    const pkg = await Bun.file(path.join(repoRoot, "package.json")).json() as { version: string }
    const installer = await Bun.file(path.join(repoRoot, "install.sh")).text()
    expect(installer).toContain(`PINNED_VERSION="${pkg.version}"`)
  })

  test("does not run native Tree-sitter install hooks for the WASM shell parser", async () => {
    const pkg = await Bun.file(path.join(repoRoot, "package.json")).json() as {
      trustedDependencies?: string[]
    }
    const lockfile = await Bun.file(path.join(repoRoot, "bun.lock")).text()
    const installer = await Bun.file(path.join(repoRoot, "install.sh")).text()

    expect(pkg.trustedDependencies ?? []).not.toContain("tree-sitter")
    expect(pkg.trustedDependencies ?? []).not.toContain("tree-sitter-bash")
    expect(pkg.trustedDependencies ?? []).not.toContain("tree-sitter-powershell")
    expect(pkg.trustedDependencies ?? []).not.toContain("web-tree-sitter")
    const lockTrustedDependencies = lockfile.match(/\n  "trustedDependencies": \[([\s\S]*?)\n  \],/)?.[1] ?? ""
    expect(lockTrustedDependencies).not.toContain("tree-sitter")
    expect(installer).toContain('2>&1 | tee -a "$bun_out"')
    expect(installer).toContain("workspace-template/.bin/run-with-timeout.ts")
  })

  test("dependency watchdog terminates a hung process group", () => {
    const runner = path.join(repoRoot, "workspace-template", ".bin", "run-with-timeout.ts")
    const result = Bun.spawnSync({
      cmd: [process.execPath, "run", runner, "1", "/bin/sh", "-c", "sleep 2"],
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
    })

    expect(result.exitCode).toBe(124)
    expect(result.stderr.toString()).toContain("command timed out after 1s")
  })

  test("local release script publishes versioned and rolling channel assets", async () => {
    const buildScript = await Bun.file(path.join(repoRoot, "script", "release", "build.ts")).text()
    expect(buildScript).toContain("dist/${channel}")
    expect(buildScript).toContain("channelInstallerPath")
    expect(buildScript).toContain("git archive --format=tar.gz")
    expect(buildScript).toContain("checksums.txt")
    expect(buildScript).toContain("shasum -a 256 install.sh")
  })

  test("installer uses one global lock and stages before replacing a version", async () => {
    const installer = await Bun.file(path.join(repoRoot, "install.sh")).text()
    expect(installer).toContain('versions/.install.lock')
    expect(installer).not.toContain('versions/.lock.${$}-${VERSION}')
    expect(installer.indexOf('install_bun_dependencies "$fw_root"')).toBeLessThan(installer.indexOf('mv "$INSTALL_STAGE_DIR" "$version_dir"'))
    expect(installer).toContain('mv "${INSTALL_BACKUP_DIR}" "${SPINOSA_HOME}/versions/${VERSION}"')
    expect(installer).toContain('install_args+=(--force)')
    expect(installer).toContain('src/index.ts" version')
  })

  test("installer repair preserves metadata and removes only broken runtime state", async () => {
    await using tmp = await tmpdir()
    const home = path.join(tmp.path, "home")
    const metadata = path.join(home, "metadata")
    await mkdir(metadata, { recursive: true })
    await mkdir(path.join(home, "versions", "broken", "node_modules"), { recursive: true })
    await mkdir(path.join(home, "versions", ".install.lock"), { recursive: true })
    await mkdir(path.join(home, "bin"), { recursive: true })
    await mkdir(path.join(home, "lib"), { recursive: true })
    await Bun.write(path.join(metadata, "workspaces.json"), '{"schemaVersion":1,"workspaces":[]}\n')
    await Bun.write(path.join(home, "env.sh"), "keep=no\n")

    const result = Bun.spawnSync({
      cmd: ["bash", "-c", 'installer="$1"; set --; source "$installer"; repair_spinosa_home', "spinosa-test", path.join(repoRoot, "install.sh")],
      cwd: repoRoot,
      env: {
        ...process.env,
        SPINOSA_INSTALLER_LIB_ONLY: "1",
        SPINOSA_HOME: home,
        SPINOSA_BIN_DIR: path.join(tmp.path, "bin"),
        NO_COLOR: "1",
      },
      stdout: "pipe",
      stderr: "pipe",
    })

    expect(result.exitCode).toBe(0)
    expect(await Bun.file(path.join(metadata, "workspaces.json")).text()).toBe('{"schemaVersion":1,"workspaces":[]}\n')
    expect(existsSync(path.join(home, "versions", "broken"))).toBe(false)
    expect(existsSync(path.join(home, "versions", ".install.lock"))).toBe(true)
    expect(existsSync(path.join(home, "env.sh"))).toBe(false)
  })

  test("installed launcher repairs a corrupt runtime and restarts the original command", async () => {
    await using tmp = await tmpdir()
    const home = path.join(tmp.path, "home")
    const root = path.join(home, "versions", "1.2.3")
    const launcher = await Bun.file(path.join(repoRoot, "workspace-template", ".bin", "spinosa")).text()
    await mkdir(path.join(home, "metadata"), { recursive: true })
    await mkdir(path.join(home, "bin"), { recursive: true })
    await mkdir(path.join(root, "workspace-template", ".spinosa"), { recursive: true })
    await mkdir(path.join(root, "metadata"), { recursive: true })
    await Bun.write(path.join(home, "metadata", "workspaces.json"), '{"schemaVersion":1,"workspaces":[]}\n')
    await Bun.write(path.join(root, "workspace-template", ".spinosa", "workspace-files.tsv"), "fixture\n")
    await Bun.write(path.join(root, "metadata", "version"), "1.2.3\n")
    await Bun.write(path.join(home, "bin", "spinosa"), launcher)
    await Bun.write(path.join(home, "bin", "bun"), [
      "#!/bin/sh",
      'if [ -f "$SPINOSA_HOME/repaired" ]; then echo "repaired runtime"; exit 0; fi',
      "exit 1",
      "",
    ].join("\n"))
    await mkdir(path.join(root, "packages", "spinosa-kernel", "src"), { recursive: true })
    await Bun.write(path.join(root, "packages", "spinosa-kernel", "src", "index.ts"), "process.exit(0)\n")
    await Bun.write(path.join(root, "install.sh"), [
      "#!/bin/sh",
      'touch "$SPINOSA_HOME/repaired"',
      "exit 0",
      "",
    ].join("\n"))
    await chmod(path.join(root, "install.sh"), 0o755)
    await chmod(path.join(home, "bin", "spinosa"), 0o755)
    await chmod(path.join(home, "bin", "bun"), 0o755)

    const result = Bun.spawnSync({
      cmd: ["bash", "-c", `printf '\\n' | ${JSON.stringify(path.join(home, "bin", "spinosa"))} version`],
      cwd: tmp.path,
      env: { ...process.env, SPINOSA_HOME: home, NO_COLOR: "1" },
      stdout: "pipe",
      stderr: "pipe",
    })

    expect(result.exitCode).toBe(0)
    expect(result.stderr.toString()).toContain("runtime issue detected")
    expect(result.stdout.toString()).toContain("repaired runtime")
    expect(await Bun.file(path.join(home, "metadata", "workspaces.json")).text()).toBe('{"schemaVersion":1,"workspaces":[]}\n')
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
    expect(launcher).toContain('src/index.ts" "$@"')
    expect(launcher).toContain('"$BUN" run "${RESOLVED_ROOT}/packages/spinosa-kernel/src/index.ts" version')
    expect(launcher).toContain('launcher_command="${launcher_args[$command_index]:-}"')
    expect(launcher).toContain("SPINOSA_PREFLIGHT_DONE=1")
    expect(launcher).toContain("tui_launch=true")
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
