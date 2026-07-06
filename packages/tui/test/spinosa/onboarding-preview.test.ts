import { describe, expect, test } from "bun:test"
import path from "node:path"
import { mkdir } from "node:fs/promises"
import { tmpdir } from "../fixture/fixture"
import { buildImportScanPreview, buildNewWorkspacePreview, suggestWorkspacePath } from "../../src/spinosa/onboarding-preview"

describe("onboarding preview", () => {
  test("suggests workspace path with collision suffixes", async () => {
    await using tmp = await tmpdir()
    const corpus = path.join(tmp.path, "corpus")
    const existing = path.join(tmp.path, "corpus-spinosa")
    await mkdir(corpus, { recursive: true })
    await mkdir(existing, { recursive: true })

    expect(suggestWorkspacePath(corpus)).toBe(path.join(tmp.path, "corpus-spinosa-2"))
  })

  test("builds preview rows and default extension selections", async () => {
    await using tmp = await tmpdir()
    const corpus = path.join(tmp.path, "vault")
    await mkdir(path.join(corpus, "docs"), { recursive: true })
    await Bun.write(path.join(corpus, "notes.md"), "# Notes")
    await Bun.write(path.join(corpus, "docs", "report.docx"), "fake-docx")
    await Bun.write(path.join(corpus, "clip.mp3"), "audio")
    await Bun.write(path.join(corpus, ".DS_Store"), "")

    const preview = await buildNewWorkspacePreview(corpus)

    expect(preview.projectName).toBe("vault")
    expect(preview.workspacePath).toContain("vault-spinosa")
    expect(preview.preflightRows.some((row) => row.label === "Workspace")).toBe(true)
    expect(preview.scanRows.some((row) => row.label === "Source scan")).toBe(true)
    expect(preview.importOptions).toEqual([
      { ext: "docx", count: 1, selected: true },
      { ext: "md", count: 1, selected: true },
      { ext: "mp3", count: 1, selected: false },
    ])
  })

  test("builds lightweight import preview for add-files flow", async () => {
    await using tmp = await tmpdir()
    const corpus = path.join(tmp.path, "imports")
    await mkdir(corpus, { recursive: true })
    await Bun.write(path.join(corpus, "notes.md"), "# Notes")
    await Bun.write(path.join(corpus, "report.docx"), "fake-docx")

    const preview = await buildImportScanPreview(corpus)

    expect(preview.projectName).toBe("imports")
    expect(preview.scanRows.some((row) => row.label === "Source scan")).toBe(true)
    expect(preview.importOptions).toEqual([
      { ext: "docx", count: 1, selected: true },
      { ext: "md", count: 1, selected: true },
    ])
  })
})
