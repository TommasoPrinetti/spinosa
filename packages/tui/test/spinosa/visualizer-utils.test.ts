import { describe, expect, test } from "bun:test"
import { inputSummary } from "../../src/routes/spinosa/visualizer-utils"

describe("inputSummary", () => {
  test("shows only the filename for file tools", () => {
    expect(inputSummary("read", { filePath: "/Users/tommaso/Downloads/ultimate-spinosa-test.md" })).toBe(
      "ultimate-spinosa-test.md",
    )
    expect(inputSummary("edit", { file_path: String.raw`C:\Users\tommaso\notes.md` })).toBe("notes.md")
    expect(inputSummary("write", {})).toBe("")
  })
})
