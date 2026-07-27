import { describe, expect, test } from "bun:test"
import path from "node:path"
import { mkdir } from "node:fs/promises"
import { tmpdir } from "../fixture/fixture"
import { addFiles } from "@spinosa/core/commands/add"
import { convertedOutputExists } from "@spinosa/core/import/frontmatter"

describe("Spinosa import integrity", () => {
  test("does not treat an empty or partial page directory as completed conversion", async () => {
    await using tmp = await tmpdir()
    const output = path.join(tmp.path, "document.md")
    const pageDir = output.slice(0, -3)
    await mkdir(pageDir)
    expect(convertedOutputExists(output)).toBe(false)
    await Bun.write(path.join(pageDir, "page-001.md"), "partial\n")
    expect(convertedOutputExists(output)).toBe(false)
    await Bun.write(output, "complete\n")
    expect(convertedOutputExists(output)).toBe(true)
  })

  test("reports a corrupt MarkItDown source as failed", async () => {
    await using tmp = await tmpdir()
    const workspace = path.join(tmp.path, "workspace")
    const source = path.join(tmp.path, "broken.docx")
    await mkdir(path.join(workspace, "raw"), { recursive: true })
    await Bun.write(source, "not-a-docx")

    const result = await addFiles({ workspacePath: workspace, sourcePath: source })

    expect(result.success).toBe(false)
    expect(result.mdConverted).toBe(0)
    expect(result.mdFailed).toBe(1)
    expect(result.totalTargeted).toBe(1)
  })
})
