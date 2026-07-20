/** @jsxImportSource @opentui/solid */
import { afterEach, expect, mock, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { DEFAULT_THEMES, resolveTheme } from "../../src/theme"

afterEach(() => mock.restore())

test("tool detail copy button confirms the command was copied", async () => {
  const theme = resolveTheme(DEFAULT_THEMES.opencode, "dark")
  let copiedText = ""

  mock.module("../../src/context/theme", () => ({
    useTheme: () => ({ theme }),
    selectedForeground: () => theme.background,
  }))
  mock.module("../../src/ui/dialog", () => ({
    useDialog: () => ({ setSize() {}, clear() {} }),
  }))
  mock.module("../../src/keymap", () => ({ useBindings() {} }))
  mock.module("../../src/context/clipboard", () => ({
    useClipboard: () => ({
      async write(text: string) {
        copiedText = text
      },
    }),
  }))

  const { DialogToolDetail } = await import("../../src/routes/spinosa/dialog-tool-detail")
  const app = await testRender(
    () => (
      <DialogToolDetail
        workdir="/tmp/workspace"
        part={{
          tool: "read",
          state: {
            status: "completed",
            input: { filePath: "/tmp/workspace/notes.md" },
            time: { start: 1, end: 2 },
          },
        }}
      />
    ),
    { width: 80, height: 24 },
  )

  try {
    await app.renderOnce()
    const lines = app.captureCharFrame().split("\n")
    const detail = app.renderer.root.getChildren()[0]!
    const headerY = lines.findIndex((line) => line.includes("Tool detail"))
    const footerY = lines.findIndex((line) => line.includes("esc close"))
    expect(headerY).toBe(detail.y + 1)
    expect(footerY).toBe(detail.y + detail.height - 2)
    expect(lines[headerY]!.indexOf("Tool detail")).toBe(detail.x + 2)
    expect(lines[headerY]!.indexOf("esc") + "esc".length).toBe(detail.x + detail.width - 2)
    const buttonY = lines.findIndex((line) => line.includes("Copy command"))
    const buttonX = lines[buttonY]!.indexOf("Copy command") + 1

    await app.mockMouse.click(buttonX, buttonY)
    await Promise.resolve()
    await app.renderOnce()

    expect(copiedText).toBe('cd /tmp/workspace\ncat /tmp/workspace/notes.md')
    expect(app.captureCharFrame()).toContain("✓ Copied")
  } finally {
    app.renderer.destroy()
  }
})
