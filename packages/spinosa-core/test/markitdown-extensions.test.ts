import { describe, expect, test } from "bun:test"
import { MARKITDOWN_EXTENSIONS } from "../src/constants"
import { scanClassifySourceFile } from "../src/extension/classifier"

describe("markitdown supported extensions", () => {
  test("pptx is not claimed as markitdown-supported", async () => {
    expect(MARKITDOWN_EXTENSIONS).not.toContain("pptx")
    expect(await scanClassifySourceFile("/tmp/deck.pptx")).toBe("unknown")
  })

  test("docx remains markitdown-routed", async () => {
    expect(MARKITDOWN_EXTENSIONS).toContain("docx")
    expect(await scanClassifySourceFile("/tmp/report.docx")).toBe("markitdown")
  })
})
