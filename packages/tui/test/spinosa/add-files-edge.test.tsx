/** @jsxImportSource @opentui/solid */
import { describe, expect, mock, test } from "bun:test"
import { ScrollBoxRenderable, type Renderable } from "@opentui/core"
import { testRender } from "@opentui/solid"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import path from "node:path"
import { createSignal } from "solid-js"
import { fileExt } from "../../src/spinosa-core/constants"
import { discoverRegisteredWorkspaces, registerWorkspace } from "../../src/spinosa-core/workspace/registry"
import { classifySourceFile } from "../../src/spinosa-core/extension/classifier"
import { buildStartupChatPrompt, formatStartupProgressMessage } from "../../src/spinosa-core/commands/startup"
import { resolveExistingUserPaths } from "../../src/spinosa-core/utils/path"
import { DEFAULT_THEMES, resolveTheme } from "../../src/theme"
import { ImportOptionsSelector } from "../../src/routes/spinosa/wizard-ui"

const EDGE_FILENAMES = [
  "normal.pdf",
  "file with spaces.pdf",
  "中文文件.pdf",
  "emoji📄.pdf",
  "multiple.dots.archive.tar.gz",
  ".hidden",
  "noextension",
  "file[2024](v1).pdf",
  `${"a".repeat(300)}.pdf`,
  ".hidden.pdf",
  "MACOSX/._hidden.pdf",
]

function findScrollBox(root: Renderable): ScrollBoxRenderable | undefined {
  if (root instanceof ScrollBoxRenderable) return root
  return root.getChildren().map(findScrollBox).find(Boolean)
}

describe("spinosa add-files edge cases", () => {
  test("fileExt handles unusual filenames consistently", () => {
    expect(EDGE_FILENAMES.map((value) => fileExt(value))).toEqual([
      "pdf",
      "pdf",
      "pdf",
      "pdf",
      "gz",
      "",
      "",
      "pdf",
      "pdf",
      "pdf",
      "pdf",
    ])
  })

  test("classifySourceFile never throws on unusual filenames", async () => {
    const results = await Promise.all(EDGE_FILENAMES.map((value) => classifySourceFile(value)))
    expect(results).toHaveLength(EDGE_FILENAMES.length)
    for (const result of results) {
      expect([
        "markdown",
        "markitdown",
        "native",
        "ocr_convertible",
        "video",
        "audio",
        "binary_copyable",
        "ignored",
        "unknown",
      ]).toContain(result)
    }
  })

  test("buildImportScanPreview keeps scanning when one file classification fails", async () => {
    const source = mkdtempSync(path.join(tmpdir(), "spinosa-edge-preview-"))
    try {
      writeFileSync(path.join(source, "ok.md"), "# ok\n")
      writeFileSync(path.join(source, "broken.md"), "# broken\n")

      mock.module("../../src/spinosa-core/extension/classifier", () => ({
        shouldSkipSourceFile: () => false,
        classifySourceFile: async (filePath: string) => {
          if (filePath.endsWith("broken.md")) throw new Error("boom")
          return "markdown"
        },
      }))

      const { buildImportScanPreview } = await import("../../src/spinosa/onboarding-preview")
      const preview = await buildImportScanPreview(source)

      expect(preview.importOptions).toEqual([{ ext: "md", count: 1, bytes: expect.any(Number), selected: true }])
      expect(preview.scanRows.some((row) => row.label === "Unknown files")).toBe(true)
    } finally {
      mock.restore()
      rmSync(source, { recursive: true, force: true })
    }
  })

  test("resolveExistingUserPaths handles empty, missing, trailing slash, and tilde inputs", () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), "spinosa-edge-paths-"))
    const homeRoot = mkdtempSync(path.join(homedir(), "spinosa-edge-home-"))
    const nested = path.join(tempRoot, "nested")
    const homeNested = path.join(homeRoot, "docs")
    mkdirSync(nested, { recursive: true })
    mkdirSync(homeNested, { recursive: true })

    try {
      const homeInput = `~/${path.relative(homedir(), homeNested)}`
      expect(resolveExistingUserPaths([])).toEqual([])
      expect(resolveExistingUserPaths(["", "/definitely/missing"])).toEqual([])
      expect(resolveExistingUserPaths([`${nested}/`, homeInput])).toEqual([`${nested}/`, homeNested])
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
      rmSync(homeRoot, { recursive: true, force: true })
    }
  })

  test("global registry discovery includes an early registered workspace path before setup files exist", async () => {
    const originalHome = process.env.SPINOSA_HOME
    const spinosaHome = mkdtempSync(path.join(tmpdir(), "spinosa-edge-home-registry-"))
    const pendingWorkspace = path.join(tmpdir(), `spinosa-edge-pending-${Date.now()}`)
    process.env.SPINOSA_HOME = spinosaHome

    try {
      await registerWorkspace(pendingWorkspace, "pending-workspace")
      await expect(discoverRegisteredWorkspaces()).resolves.toContain(pendingWorkspace)
    } finally {
      if (originalHome === undefined) delete process.env.SPINOSA_HOME
      else process.env.SPINOSA_HOME = originalHome
      rmSync(spinosaHome, { recursive: true, force: true })
    }
  })

  test("filetype selector scrollbox stays within 60 percent of terminal height and scrolls selection into view", async () => {
    const theme = resolveTheme(DEFAULT_THEMES.opencode, "dark")
    const [selectedIndex, setSelectedIndex] = createSignal(1)
    const app = await testRender(
      () => (
        <ImportOptionsSelector
          theme={theme}
          options={Array.from({ length: 60 }, (_, index) => ({
            ext: `ext${index + 1}`,
            count: index + 1,
            bytes: 1_000 + index,
            selected: true,
          }))}
          selectedIndex={selectedIndex()}
          viewportHeight={20}
          onSelectIndex={() => {}}
          onToggleAll={() => {}}
          onToggleItem={() => {}}
        />
      ),
      { width: 80, height: 20 },
    )

    try {
      await app.renderOnce()
      setSelectedIndex(50)
      await app.flush()
      const scroll = findScrollBox(app.renderer.root)
      expect(scroll).toBeDefined()
      expect(scroll!.height).toBeLessThanOrEqual(12)
      expect(scroll!.scrollTop).toBeGreaterThan(0)
    } finally {
      app.renderer.destroy()
    }
  })

  test("startup progress message adds elapsed time after two seconds", () => {
    expect(formatStartupProgressMessage(0)).toBe("Running workspace startup...")
    expect(formatStartupProgressMessage(1_999)).toBe("Running workspace startup...")
    expect(formatStartupProgressMessage(2_100)).toBe("Running workspace startup... (2.1s)")
  })

  test("startup chat prompt is prefilled but never auto-submitted", () => {
    expect(buildStartupChatPrompt("startup prompt")).toEqual({
      input: "startup prompt",
      parts: [],
      autoSubmit: false,
    })
  })
})
