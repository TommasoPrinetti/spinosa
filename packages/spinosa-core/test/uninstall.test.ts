import { describe, expect, test } from "bun:test"
import { mkdirSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  uninstallFrameworkRuntime,
  validateSpinosaHome,
} from "../src/commands/uninstall"

describe("uninstallFrameworkRuntime", () => {
  test("rejects homes without Spinosa metadata", () => {
    const home = join(tmpdir(), `spinosa-uninstall-${Date.now()}`)
    mkdirSync(home, { recursive: true })
    expect(validateSpinosaHome(home)).toContain("does not look like a Spinosa installation")
    const result = uninstallFrameworkRuntime(home)
    expect(result.error).toBeTruthy()
  })

  test("removes runtime targets and keeps metadata", () => {
    const home = join(tmpdir(), `spinosa-uninstall-ok-${Date.now()}`)
    mkdirSync(join(home, "metadata"), { recursive: true })
    mkdirSync(join(home, "versions", "1.0.0"), { recursive: true })
    mkdirSync(join(home, "bin"), { recursive: true })
    writeFileSync(join(home, "metadata", "config.yaml"), "spinosa: true\n")
    writeFileSync(join(home, "metadata", "workspaces.json"), '{"workspaces":[]}\n')
    writeFileSync(join(home, "env.sh"), "export PATH=...\n")

    const result = uninstallFrameworkRuntime(home)
    expect(result.error).toBeUndefined()
    expect(existsSync(join(home, "versions"))).toBe(false)
    expect(existsSync(join(home, "bin"))).toBe(false)
    expect(existsSync(join(home, "env.sh"))).toBe(false)
    expect(existsSync(join(home, "metadata", "config.yaml"))).toBe(true)
    expect(existsSync(join(home, "metadata", "workspaces.json"))).toBe(true)
  })
})
