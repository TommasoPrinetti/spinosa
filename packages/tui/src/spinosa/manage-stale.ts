import type { SpinosaWorkspacePresence } from "@spinosa/core/types"
import { workspacePresenceLabel } from "@spinosa/core/workspace/presence"

export const MANAGE_STALE_ACTIONS = ["del", "scan", "path"] as const
export type ManageStaleAction = (typeof MANAGE_STALE_ACTIONS)[number]

/** Fixed column widths for the manage-stale table (xlarge dialog ≈ 116 cols). */
export const MANAGE_STALE_COL = {
  name: 24,
  path: 46,
  status: 12,
  /** Three fixed glyph cells + gaps; wide enough that the left row border cannot wrap them. */
  actions: 14,
} as const

/** Per-action hit target width (must stay on one line). */
export const MANAGE_STALE_ACTION_BTN = 4

/**
 * Horizontal chrome outside the four column widths:
 * 3 column gaps + 2 row padding + 1 left selection border.
 */
export const MANAGE_STALE_TABLE_CHROME = 6

/** Fixed scroll viewport so the dialog does not resize with row count. */
export const MANAGE_STALE_SCROLL_HEIGHT = 10

/** Single-width action glyphs (keyboard still 1–3 / Tab). */
export const MANAGE_STALE_ACTION_GLYPH: Record<ManageStaleAction, string> = {
  del: "×",
  scan: "⌕",
  path: "→",
}

/** Total table width including padding/gaps/border — keep ≤ xlarge dialog (116). */
export function manageStaleTableWidth(
  cols: typeof MANAGE_STALE_COL = MANAGE_STALE_COL,
  chrome = MANAGE_STALE_TABLE_CHROME,
): number {
  return cols.name + cols.path + cols.status + cols.actions + chrome
}

export function manageStaleActionGlyph(action: ManageStaleAction): string {
  return MANAGE_STALE_ACTION_GLYPH[action]
}

/** Visible name budget after the `› ✕ ` / `  ✕ ` row prefix. */
export function manageStaleNameBudget(colWidth = MANAGE_STALE_COL.name): number {
  return Math.max(4, colWidth - 4)
}

export type ManageStaleEscapePhase =
  | "table"
  | "recover-actions"
  | "recover-scan-confirm"
  | "recover-scanning"
  | "recover-matches"

export type ManageStaleEscapeResult =
  | "back-to-picker"
  | "back-to-table"
  | "leave-subphase"
  | "cancel-scan"
  | "ignore"

export function isStaleWorkspacePresence(presence?: SpinosaWorkspacePresence): boolean {
  return !!presence && presence !== "present" && presence !== "legacy"
}

export function stalePresenceDisplay(presence?: SpinosaWorkspacePresence): string {
  const label = workspacePresenceLabel(presence)
  if (label === "NON EXISTENT") return "NOT FOUND"
  return label ?? "MISSING"
}

export function cycleManageStaleAction(current: ManageStaleAction, offset: number): ManageStaleAction {
  const index = MANAGE_STALE_ACTIONS.indexOf(current)
  const start = index < 0 ? 0 : index
  const next = (start + offset + MANAGE_STALE_ACTIONS.length) % MANAGE_STALE_ACTIONS.length
  return MANAGE_STALE_ACTIONS[next]!
}

export function moveManageStaleRow(selected: number, offset: number, count: number): number {
  if (count <= 0) return 0
  return Math.max(0, Math.min(count - 1, selected + offset))
}

export function resolveManageStaleEscape(phase: ManageStaleEscapePhase): ManageStaleEscapeResult {
  switch (phase) {
    case "table":
      return "back-to-picker"
    case "recover-actions":
      return "back-to-table"
    case "recover-scan-confirm":
    case "recover-matches":
      return "leave-subphase"
    case "recover-scanning":
      return "cancel-scan"
    default:
      return "ignore"
  }
}

export function formatUnregisterFailures(
  failures: Array<{ path: string; error: string }>,
  limit = 5,
): string {
  if (failures.length === 0) return ""
  const shown = failures.slice(0, limit).map((failure) => `${failure.path} (${failure.error})`)
  const remaining = failures.length - shown.length
  if (remaining > 0) shown.push(`…and ${remaining} more`)
  return shown.join("; ")
}
