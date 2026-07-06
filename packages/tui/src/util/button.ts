import type { RGBA } from "@opentui/core"
import { selectedForeground, type Theme } from "../context/theme"

export function buttonBackground(theme: Theme, active: boolean) {
  return active ? theme.text : theme.backgroundPanel
}

export function buttonBorder(theme: Theme, active: boolean, inactive: RGBA = theme.border) {
  return active ? theme.text : inactive
}

export function buttonText(theme: Theme, active: boolean, inactive: RGBA = theme.textMuted) {
  return active ? selectedForeground(theme, theme.text) : inactive
}
