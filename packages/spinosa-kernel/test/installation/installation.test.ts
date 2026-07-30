import { describe, expect, test } from "bun:test"
import { Installation } from "@/installation"

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

  test("contains no OpenCode distribution endpoint or package name", async () => {
    const source = await Bun.file(new URL("../../src/installation/index.ts", import.meta.url)).text()
    expect(source).not.toMatch(/anomalyco|open(?:code)-ai|github\.com\/repos\//i)
  })
})
