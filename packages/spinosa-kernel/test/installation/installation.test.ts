import { describe, expect, test } from "bun:test"
import { Installation } from "@/installation"
import { InstallationVersion } from "@spinosa/kernel-core/installation/version"

describe("Spinosa installation lifecycle", () => {
  test("detects installation method", async () => {
    const method = await Installation.method()
    expect(["self-managed", "unknown"]).toContain(method)
  })

  test("resolves latest version from channel", async () => {
    const latest = await Installation.latest()
    expect(latest).toBeDefined()
    expect(latest.length).toBeGreaterThan(0)
  })

  test("info returns current version and channel-resolved latest", async () => {
    const info = await Installation.info()
    expect(info.version).toBe(InstallationVersion)
    expect(info.latest).toBeDefined()
    expect(info.latest.length).toBeGreaterThan(0)
  })

  test("info resolves latest via channel helpers (not hard-coded to current)", async () => {
    const source = await Bun.file(new URL("../../src/installation/index.ts", import.meta.url)).text()
    expect(source).toContain("spinosaReleaseChannel")
    expect(source).toContain("resolveReleaseVersionForChannel")
    expect(source).toContain("Event.UpdateAvailable")
    expect(source).not.toMatch(/info:\s*Effect\.succeed\(\{\s*version:\s*InstallationVersion,\s*latest:\s*InstallationVersion/)
  })

  test("contains no OpenCode distribution endpoint or package name", async () => {
    const source = await Bun.file(new URL("../../src/installation/index.ts", import.meta.url)).text()
    expect(source).not.toMatch(/anomalyco|open(?:code)-ai|github\.com\/repos\//i)
  })
})
