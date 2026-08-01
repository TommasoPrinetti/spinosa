/** @jsxImportSource @opentui/solid */
import { afterEach, expect, mock, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { DEFAULT_THEMES, resolveTheme } from "../../src/theme"
import { buttonBackground, buttonText } from "../../src/util/button"

afterEach(() => mock.restore())

test("confirm buttons use button helpers for active contrast", async () => {
  const theme = resolveTheme(DEFAULT_THEMES.opencode, "dark")
  const themeModule = await import("../../src/context/theme")
  mock.module("../../src/context/theme", () => ({ ...themeModule, useTheme: () => ({ theme }) }))
  mock.module("../../src/ui/dialog", () => ({ useDialog: () => ({ clear() {} }) }))
  mock.module("../../src/keymap", () => ({ useBindings() {} }))

  const { DialogConfirm } = await import("../../src/ui/dialog-confirm")
  const app = await testRender(
    () => <DialogConfirm title="Delete?" message="This cannot be undone." defaultChoice="cancel" />,
    { width: 60, height: 12 },
  )

  try {
    await app.renderOnce()
    const frame = app.captureCharFrame()
    expect(frame).toContain("Delete?")
    expect(frame).toContain("Cancel")
    expect(frame).toContain("Confirm")
    expect(buttonText(theme, true)).not.toEqual(buttonBackground(theme, true))
  } finally {
    app.renderer.destroy()
  }
})

test("DialogConfirm.show Esc path settles false and dismisses", async () => {
  let onEscape: (() => void) | undefined
  const dialog = {
    replace(_input: unknown, _onClose?: () => void, escape?: () => void) {
      onEscape = escape
    },
    dismiss() {},
  }

  const { DialogConfirm } = await import("../../src/ui/dialog-confirm")
  const result = DialogConfirm.show(dialog as any, "Title", "Message")
  expect(onEscape).toBeDefined()
  onEscape!()
  expect(await result).toBe(false)
})
