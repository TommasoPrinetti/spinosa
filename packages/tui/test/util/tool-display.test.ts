import { describe, expect, test } from "bun:test"
import {
  ellipsisToolLine,
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

  test("parses filePath from pending raw JSON", () => {
    expect(
      toolFilePath({}, { status: "pending", raw: '{"filePath":"raw/Markdowns/COHORT3/page.md","offset":1}' }),
    ).toBe("raw/Markdowns/COHORT3/page.md")
  })

  test("ignores non-pending states without input", () => {
    expect(toolFilePath({}, { status: "running", input: {} })).toBeUndefined()
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
