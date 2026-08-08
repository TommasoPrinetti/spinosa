import { describe, expect, test } from "bun:test"
import { safeRelPath, safeRelPaths } from "../src/extension/classifier"

describe("safeRelPath", () => {
  test("keeps short paths untouched", () => {
    expect(safeRelPath("docs/report.md")).toBe("docs/report.md")
    expect(safeRelPaths(["docs/report.md"])).toEqual(["docs/report.md"])
  })

  test("case-insensitive collisions in one directory never overwrite each other", () => {
    // On default macOS/Windows volumes `Report.txt` and `report.txt` map to the
    // same output name; the second one must get a suffix instead of clobbering.
    const out = safeRelPaths(["Report.txt", "report.txt", "REPORT.txt"])
    expect(out[0]).toBe("Report.txt")
    expect(out[1]).toBe("report_1.txt")
    expect(out[2]).toBe("REPORT_2.txt")
    expect(new Set(out.map((p) => p.toLowerCase()))).toHaveLength(out.length)
  })

  test("exact duplicates in one directory get the same treatment", () => {
    const out = safeRelPaths(["a.md", "a.md"])
    expect(out).toEqual(["a.md", "a_1.md"])
  })

  test("same names in different directories stay untouched", () => {
    const out = safeRelPaths(["x/notes.txt", "y/notes.txt"])
    expect(out).toEqual(["x/notes.txt", "y/notes.txt"])
  })

  test("truncation twins are disambiguated", () => {
    const long = "z".repeat(300)
    const out = safeRelPaths([`dir/${long}.txt`, `dir/${long}.txt`])
    expect(out[0]).toBe(out[0])
    expect(out[1]).not.toBe(out[0])
    expect(out[0]!.length).toBeLessThanOrEqual(254)
  })

  test("every distinct input yields a distinct safe path", () => {
    const input = ["MIXED.txt", "mixed.txt", "Mixed.Txt", "mixed.TXT"]
    const out = safeRelPaths(input)
    expect(new Set(out).size).toBe(input.length)
  })
})