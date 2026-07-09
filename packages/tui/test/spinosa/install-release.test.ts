import { describe, expect, test } from "bun:test"
import path from "node:path"
import { tmpdir } from "../fixture/fixture"

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

  test("release workflow publishes channel asset as install.sh", async () => {
    const workflow = await Bun.file(path.join(repoRoot, ".github", "workflows", "release.yml")).text()

    expect(workflow).toContain("workspace-template/.spinosa/workspace-files.tsv")
    expect(workflow).toContain("CHANNEL_DIST=\"${DIST}/${CHANNEL}\"")
    expect(workflow).toContain("\"${CHANNEL_DIST}/install.sh\"")
    expect(workflow).not.toContain("framework/bin")
    expect(workflow).not.toContain("spinosa-framework-")
    expect(workflow).not.toContain("package-release.sh")
  })
})
