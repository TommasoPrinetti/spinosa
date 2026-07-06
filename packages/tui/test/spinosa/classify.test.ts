import { describe, expect, test } from "bun:test"
import { classifyPrompt } from "../../src/spinosa/classify"

describe("classifyPrompt", () => {
  test("detects evidence lookup", () => {
    expect(classifyPrompt("Find source-grounded evidence for topic A")).toBe("Q1")
  })

  test("detects coverage audit", () => {
    expect(classifyPrompt("Run a coverage audit of maps and raw gaps")).toBe("Q5")
  })

  test("detects fast path ops", () => {
    expect(classifyPrompt("How do I change the theme?")).toBe("fast_path")
  })
})