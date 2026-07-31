import { describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { loadMarkdownFile } from "../../../src/routes/session/load-markdown-file"

describe("loadMarkdownFile", () => {
  test("returns ok text for an existing file", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "spinosa-md-ok-"))
    const file = path.join(dir, "note.md")
    try {
      await writeFile(file, "# hello\n")
      expect(await loadMarkdownFile(file)).toEqual({ ok: true, text: "# hello\n" })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("returns a graceful ENOENT error instead of throwing", async () => {
    const missing = path.join(tmpdir(), `spinosa-md-missing-${Date.now()}`, "gone.md")
    const result = await loadMarkdownFile(missing)
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected error result")
    expect(result.message).toContain("File not found")
    expect(result.message).toContain(missing)
  })
})
