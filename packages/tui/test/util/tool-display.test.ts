import { describe, expect, test } from "bun:test"
import {
  ellipsisToolLine,
  normalizeToolInputForDisplay,
  normalizeToolMetadataForDisplay,
  toolDisplayMetadata,
  toolFilePath,
  webSearchProviderLabel,
} from "../../src/util/tool-display"

describe("webSearchProviderLabel", () => {
  test("labels known providers", () => {
    expect(webSearchProviderLabel("parallel")).toBe("Parallel Web Search")
    expect(webSearchProviderLabel("exa")).toBe("Exa Web Search")
  })

  for (const [name, provider] of [
    ["undefined", undefined],
    ["null", null],
    ["an object", {}],
    ["an array", []],
    ["a number", 1],
    ["an unexpected string", "other"],
  ] as const) {
    test(`uses the generic label for ${name}`, () => {
      expect(webSearchProviderLabel(provider)).toBe("Web Search")
    })
  }
})

describe("toolDisplayMetadata", () => {
  test("returns structured metadata for non-pending states", () => {
    const structured = { provider: "parallel", numResults: 3 }

    expect(toolDisplayMetadata({ status: "running", structured })).toBe(structured)
    expect(toolDisplayMetadata({ status: "completed", structured })).toBe(structured)
    expect(toolDisplayMetadata({ status: "error", structured })).toBe(structured)
  })

  test("does not expose pending or malformed metadata", () => {
    expect(toolDisplayMetadata({ status: "pending", structured: { provider: "exa" } })).toEqual({})
    expect(toolDisplayMetadata({ status: "completed" })).toEqual({})
    expect(toolDisplayMetadata({ status: "completed", structured: null })).toEqual({})
    expect(toolDisplayMetadata({ status: "completed", structured: [] })).toEqual({})
    expect(toolDisplayMetadata(undefined)).toEqual({})
  })
})

describe("toolFilePath", () => {
  test("prefers explicit input filePath", () => {
    expect(toolFilePath({ filePath: "raw/a.md" }, { status: "pending", raw: '{"filePath":"other.md"}' })).toBe(
      "raw/a.md",
    )
  })

  test("accepts V2 path alias", () => {
    expect(toolFilePath({ path: "notes/write.ts" })).toBe("notes/write.ts")
  })

  test("parses filePath from pending raw JSON", () => {
    expect(
      toolFilePath({}, { status: "pending", raw: '{"filePath":"raw/Markdowns/COHORT3/page.md","offset":1}' }),
    ).toBe("raw/Markdowns/COHORT3/page.md")
  })

  test("parses V2 path from pending raw JSON", () => {
    expect(toolFilePath({}, { status: "pending", raw: '{"path":"src/util/tool-display.ts","content":"x"}' })).toBe(
      "src/util/tool-display.ts",
    )
  })

  test("ignores non-pending states without input", () => {
    expect(toolFilePath({}, { status: "running", input: {} })).toBeUndefined()
  })
})

describe("normalizeToolInputForDisplay", () => {
  test("aliases V2 path onto filePath for legacy TUI surfaces", () => {
    expect(normalizeToolInputForDisplay({ path: "a.ts", content: "hi" })).toEqual({
      path: "a.ts",
      content: "hi",
      filePath: "a.ts",
    })
  })

  test("keeps existing filePath", () => {
    expect(normalizeToolInputForDisplay({ filePath: "a.ts", path: "b.ts" })).toEqual({
      filePath: "a.ts",
      path: "b.ts",
    })
  })
})

describe("normalizeToolMetadataForDisplay", () => {
  test("maps V2 edit files[].patch onto legacy diff", () => {
    const meta = normalizeToolMetadataForDisplay(
      "edit",
      {
        files: [{ file: "a.ts", patch: "--- a\n+++ b\n", status: "modified", additions: 1, deletions: 0 }],
        replacements: 1,
      },
      { path: "a.ts" },
    )
    expect(meta.diff).toBe("--- a\n+++ b\n")
    expect(meta.diagnostics).toEqual({ "a.ts": [] })
  })

  test("stamps empty diagnostics for V2 write so content can render", () => {
    const meta = normalizeToolMetadataForDisplay(
      "write",
      { operation: "write", target: "a.ts", resource: "a.ts", existed: false },
      { path: "a.ts", content: "x" },
    )
    expect(meta.diagnostics).toEqual({ "a.ts": [] })
  })
})

describe("ellipsisToolLine", () => {
  test("keeps short lines intact", () => {
    expect(ellipsisToolLine("Read notes.md", 72)).toBe("Read notes.md")
  })

  test("ellipses long lines to one visible segment", () => {
    const long = "raw/Markdowns/COHORT3/" + "X".repeat(80) + "_PAGE38.md"
    const out = ellipsisToolLine(long, 40)
    expect(out.length).toBeLessThanOrEqual(40)
    expect(out.includes("…")).toBe(true)
    expect(out.startsWith("raw/")).toBe(true)
    expect(out.endsWith(".md")).toBe(true)
  })
})
