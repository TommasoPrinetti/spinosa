import { afterEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { deleteYamlKey, readYamlScalar, writeYamlConfig } from "../src/utils/yaml-config"

let testDir = ""

function resetDir() {
  if (testDir) rmSync(testDir, { recursive: true, force: true })
  testDir = mkdtempSync(path.join(tmpdir(), "spinosa-yaml-"))
  mkdirSync(testDir, { recursive: true })
}

afterEach(() => {
  if (testDir) rmSync(testDir, { recursive: true, force: true })
  testDir = ""
})

describe("yaml-config", () => {
  test("reads scalar values from yaml documents", async () => {
    resetDir()
    const file = path.join(testDir, "config.yaml")
    await Bun.write(file, "beta: true\nauto_upgrade: false\n")
    expect(await readYamlScalar(file, "beta")).toBe("true")
    expect(await readYamlScalar(file, "auto_upgrade")).toBe("false")
  })

  test("preserves comments when updating keys", async () => {
    resetDir()
    const file = path.join(testDir, "config.yaml")
    await Bun.write(file, "# Spinosa installation marker\nbeta: false\n")
    await writeYamlConfig(file, (document) => {
      document.set("beta", true)
      document.delete("release_channel")
    })
    const updated = await Bun.file(file).text()
    expect(updated).toContain("# Spinosa installation marker")
    expect(updated).toContain("beta: true")
    expect(updated).not.toContain("release_channel:")
  })

  test("deletes keys without rewriting unrelated content", async () => {
    resetDir()
    const file = path.join(testDir, "config.yaml")
    await Bun.write(file, "beta: false\nrelease_channel: beta\n")
    await deleteYamlKey(file, "release_channel")
    const updated = await Bun.file(file).text()
    expect(updated).toContain("beta: false")
    expect(updated).not.toContain("release_channel:")
  })
})
