import { describe, expect, test } from "bun:test"
import { isRetiredManagedName } from "../src/framework/checksums"

describe("isRetiredManagedName", () => {
  test("matches Pilosa agent paths", () => {
    expect(isRetiredManagedName(".agents/pilosa-searcher.md")).toBe(true)
    expect(isRetiredManagedName(".codex/agents/pilosa_writer.toml")).toBe(true)
    expect(isRetiredManagedName("Pilosa.md")).toBe(true)
  })

  test("does not match Spinosa or unrelated names", () => {
    expect(isRetiredManagedName(".agents/spinosa-searcher.md")).toBe(false)
    expect(isRetiredManagedName("raw/notes.jsonl")).toBe(false)
    expect(isRetiredManagedName("user-pilosa-notes.md")).toBe(false)
  })
})
