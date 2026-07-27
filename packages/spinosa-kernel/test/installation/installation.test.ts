import { describe, expect, test } from "bun:test"
import { readFile } from "fs/promises"
import { Installation, selfManagedMessage } from "@/installation"

describe("Spinosa installation lifecycle", () => {
  test("is self-managed and never upgrades through an upstream package channel", async () => {
    expect(await Installation.method()).toBe("self-managed")
    expect(await Installation.latest()).toBeDefined()
    await expect(Installation.upgrade("self-managed", "0.0.0")).rejects.toMatchObject({ stderr: selfManagedMessage })
  })

  test("contains no OpenCode distribution endpoint or package name", async () => {
    const source = await readFile(new URL("../../src/installation/index.ts", import.meta.url), "utf8")
    expect(source).not.toMatch(/anomalyco|open(?:code)-ai|github\.com\/repos\//i)
  })
})
