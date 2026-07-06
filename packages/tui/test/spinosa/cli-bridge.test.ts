import { afterEach, describe, expect, test } from "bun:test"
import { chmodSync, mkdtempSync, mkdirSync, realpathSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { runUpdate } from "../../src/spinosa/cli-bridge"

const originalSpinosaBin = process.env.SPINOSA_BIN

afterEach(() => {
  if (originalSpinosaBin === undefined) delete process.env.SPINOSA_BIN
  else process.env.SPINOSA_BIN = originalSpinosaBin
})

describe("runUpdate", () => {
  test("uses non-interactive spinosa update --yes for the target workspace", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "spinosa-cli-bridge-"))
    const workspacePath = path.join(tempDir, "workspace")
    const binPath = path.join(tempDir, "spinosa")

    mkdirSync(workspacePath, { recursive: true })
    await Bun.write(
      binPath,
      [
        "#!/bin/sh",
        "printf 'cwd=%s\\n' \"$PWD\"",
        "for arg in \"$@\"; do",
        "  printf 'arg=%s\\n' \"$arg\"",
        "done",
      ].join("\n"),
    )
    chmodSync(binPath, 0o755)
    process.env.SPINOSA_BIN = binPath

    try {
      const expectedCwd = realpathSync(workspacePath)
      const result = await runUpdate(workspacePath)
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain(`cwd=${expectedCwd}`)
      expect(result.stdout).toContain("arg=update")
      expect(result.stdout).toContain("arg=--yes")
      expect(result.stdout).toContain(`arg=${workspacePath}`)
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })
})
