import { expect, test } from "bun:test"
import { DEFAULT_THEMES, resolveTheme } from "../../src/theme"
import { buttonBackground, buttonText } from "../../src/util/button"

test("buttonText stays distinct from buttonBackground when active", () => {
  for (const mode of ["dark", "light"] as const) {
    const theme = resolveTheme(DEFAULT_THEMES.opencode, mode)
    const bg = buttonBackground(theme, true)
    const fg = buttonText(theme, true)
    expect(fg).not.toEqual(bg)
    expect(buttonText(theme, false, theme.text)).toEqual(theme.text)
  }
})

test("button helpers flip to selectedForeground on active text bg", () => {
  const theme = resolveTheme(DEFAULT_THEMES.opencode, "dark")
  expect(buttonBackground(theme, true)).toEqual(theme.text)
  expect(buttonText(theme, true)).toEqual(theme.selectedListItemText)
})
