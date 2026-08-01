import { describe, expect, test } from "bun:test"
import path from "node:path"
import { symlinkSync } from "node:fs"
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
      { ext: "docx", count: 1, bytes: expect.any(Number), selected: true },
      { ext: "md", count: 1, bytes: expect.any(Number), selected: true },
      { ext: "mp3", count: 1, bytes: expect.any(Number), selected: false },
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
      { ext: "docx", count: 1, bytes: expect.any(Number), selected: true },
      { ext: "md", count: 1, bytes: expect.any(Number), selected: true },
    ])
  })

  test("pptx is unsupported — not in import toggles, counted as unknown", async () => {
    await using tmp = await tmpdir()
    const corpus = path.join(tmp.path, "decks")
    await mkdir(corpus, { recursive: true })
    await Bun.write(path.join(corpus, "notes.md"), "# Notes")
    await Bun.write(path.join(corpus, "slides.pptx"), "fake-pptx")

    const preview = await buildImportScanPreview(corpus)

    expect(preview.importOptions.map((o) => o.ext)).toEqual(["md"])
    expect(preview.importOptions.some((o) => o.ext === "pptx")).toBe(false)
    expect(preview.scanRows.some((row) =>
      row.label === "Unknown files" && row.status.includes("unsupported"),
    )).toBe(true)
  })

  test("ignores symlink loops while scanning previews", async () => {
    await using tmp = await tmpdir()
    const corpus = path.join(tmp.path, "looped")
    const nested = path.join(corpus, "nested")
    await mkdir(nested, { recursive: true })
    await Bun.write(path.join(nested, "notes.md"), "# Notes")
    symlinkSync(corpus, path.join(nested, "loop"))

    const preview = await buildImportScanPreview(corpus)

    expect(preview.importOptions).toEqual([
      { ext: "md", count: 1, bytes: expect.any(Number), selected: true },
    ])
  })
})
