import { describe, expect, test } from "bun:test"
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs"
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

  test("removes binary runtime and keeps metadata + legacy versions", () => {
    const home = join(tmpdir(), `spinosa-uninstall-ok-${Date.now()}`)
    mkdirSync(join(home, "metadata"), { recursive: true })
    mkdirSync(join(home, "versions", "1.0.0"), { recursive: true })
    mkdirSync(join(home, "bin"), { recursive: true })
    mkdirSync(join(home, "templates", "1.0.0-abc"), { recursive: true })
    writeFileSync(join(home, "metadata", "config.yaml"), "spinosa: true\n")
    writeFileSync(join(home, "metadata", "workspaces.json"), '{"workspaces":[]}\n')
    writeFileSync(join(home, "bin", "spinosa"), "#!/bin/sh\n")
    writeFileSync(join(home, "env.sh"), "export PATH=...\n")

    const result = uninstallFrameworkRuntime(home)
    expect(result.error).toBeUndefined()
    expect(existsSync(join(home, "versions", "1.0.0"))).toBe(true)
    expect(existsSync(join(home, "bin", "spinosa"))).toBe(false)
    expect(existsSync(join(home, "templates"))).toBe(false)
    expect(existsSync(join(home, "env.sh"))).toBe(true)
    expect(existsSync(join(home, "metadata", "config.yaml"))).toBe(true)
    expect(existsSync(join(home, "metadata", "workspaces.json"))).toBe(true)
  })

  test("purgeLegacyVersions removes dormant source trees when requested", () => {
    const home = join(tmpdir(), `spinosa-uninstall-purge-${Date.now()}`)
    mkdirSync(join(home, "metadata"), { recursive: true })
    mkdirSync(join(home, "versions", "1.0.0"), { recursive: true })
    writeFileSync(join(home, "metadata", "config.yaml"), "spinosa: true\n")
    const result = uninstallFrameworkRuntime(home, { purgeLegacyVersions: true })
    expect(result.error).toBeUndefined()
    expect(existsSync(join(home, "versions"))).toBe(false)
    expect(readFileSync(join(home, "metadata", "config.yaml"), "utf-8")).toContain("spinosa")
  })
})
