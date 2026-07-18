/** @jsxImportSource @opentui/solid */
import { afterEach, expect, mock, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { DEFAULT_THEMES, resolveTheme } from "../../src/theme"

afterEach(() => mock.restore())

test("keeps export labels vertically readable in a narrow dialog", async () => {
  const theme = resolveTheme(DEFAULT_THEMES.opencode, "dark")
  const themeModule = await import("../../src/context/theme")
  mock.module("../../src/context/theme", () => ({ ...themeModule, useTheme: () => ({ theme }) }))
  mock.module("../../src/ui/dialog", () => ({ useDialog: () => ({ clear() {}, setSize() {} }) }))
  mock.module("../../src/keymap", () => ({ useBindings() {} }))

  const { DialogExportOptions } = await import("../../src/ui/dialog-export-options")
  const app = await testRender(
    () => (
      <DialogExportOptions
        defaultFilename="session.md"
        defaultThinking={false}
        defaultToolDetails={false}
        defaultAssistantMetadata={false}
        defaultOpenWithoutSaving={false}
      />
    ),
    { width: 60, height: 20 },
  )

  try {
    await app.renderOnce()
    const lines = app.captureCharFrame().split("\n")
    const filename = lines.findIndex((line) => line.includes("Filename:"))
    const thinking = lines.findIndex((line) => line.includes("Include thinking"))
    const toolDetails = lines.findIndex((line) => line.includes("Include tool details"))

    expect(filename).toBeGreaterThanOrEqual(0)
    expect(thinking).toBeGreaterThan(filename)
    expect(toolDetails).toBeGreaterThan(thinking)
  } finally {
    app.renderer.destroy()
  }
})
