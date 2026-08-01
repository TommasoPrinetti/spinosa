import { expect, test } from "bun:test"
import {
  cycleManageStaleAction,
  formatUnregisterFailures,
  isStaleWorkspacePresence,
  manageStaleActionGlyph,
  manageStaleNameBudget,
  manageStaleTableWidth,
  MANAGE_STALE_ACTION_BTN,
  MANAGE_STALE_COL,
  MANAGE_STALE_SCROLL_HEIGHT,
  moveManageStaleRow,
  resolveManageStaleEscape,
  stalePresenceDisplay,
} from "../../src/spinosa/manage-stale"

test("isStaleWorkspacePresence treats missing and mismatched as stale", () => {
  expect(isStaleWorkspacePresence(undefined)).toBe(false)
  expect(isStaleWorkspacePresence("present")).toBe(false)
  expect(isStaleWorkspacePresence("legacy")).toBe(false)
  expect(isStaleWorkspacePresence("non_existent")).toBe(true)
  expect(isStaleWorkspacePresence("moved")).toBe(true)
  expect(isStaleWorkspacePresence("invalid")).toBe(true)
  expect(isStaleWorkspacePresence("identity_mismatch")).toBe(true)
  expect(isStaleWorkspacePresence("unknown")).toBe(true)
})

test("stalePresenceDisplay matches picker wording", () => {
  expect(stalePresenceDisplay("non_existent")).toBe("NOT FOUND")
  expect(stalePresenceDisplay("identity_mismatch")).toBe("ID MISMATCH")
  expect(stalePresenceDisplay(undefined)).toBe("MISSING")
})

test("cycleManageStaleAction wraps Del/Scan/Path", () => {
  expect(cycleManageStaleAction("del", 1)).toBe("scan")
  expect(cycleManageStaleAction("scan", 1)).toBe("path")
  expect(cycleManageStaleAction("path", 1)).toBe("del")
  expect(cycleManageStaleAction("del", -1)).toBe("path")
  expect(cycleManageStaleAction("path", -1)).toBe("scan")
})

test("moveManageStaleRow clamps selection", () => {
  expect(moveManageStaleRow(0, -1, 3)).toBe(0)
  expect(moveManageStaleRow(1, 1, 3)).toBe(2)
  expect(moveManageStaleRow(2, 1, 3)).toBe(2)
  expect(moveManageStaleRow(0, 1, 0)).toBe(0)
})

test("resolveManageStaleEscape nests Esc targets", () => {
  expect(resolveManageStaleEscape("table")).toBe("back-to-picker")
  expect(resolveManageStaleEscape("recover-actions")).toBe("back-to-table")
  expect(resolveManageStaleEscape("recover-scan-confirm")).toBe("leave-subphase")
  expect(resolveManageStaleEscape("recover-matches")).toBe("leave-subphase")
  expect(resolveManageStaleEscape("recover-scanning")).toBe("cancel-scan")
})

test("formatUnregisterFailures names failing paths", () => {
  expect(formatUnregisterFailures([])).toBe("")
  expect(formatUnregisterFailures([
    { path: "/tmp/a", error: "busy" },
    { path: "/tmp/b", error: "denied" },
  ])).toBe("/tmp/a (busy); /tmp/b (denied)")
  expect(formatUnregisterFailures(
    Array.from({ length: 6 }, (_, i) => ({ path: `/p${i}`, error: "x" })),
    2,
  )).toBe("/p0 (x); /p1 (x); …and 4 more")
})

test("manage-stale layout helpers keep columns and glyphs stable", () => {
  const actionRow =
    MANAGE_STALE_ACTION_BTN * 3 + 2 /* gaps between three buttons */
  expect(MANAGE_STALE_COL.actions).toBeGreaterThanOrEqual(actionRow)
  expect(manageStaleTableWidth()).toBeLessThanOrEqual(110)
  expect(MANAGE_STALE_SCROLL_HEIGHT).toBe(10)
  expect(manageStaleNameBudget()).toBe(MANAGE_STALE_COL.name - 4)
  expect(manageStaleActionGlyph("del")).toBe("×")
  expect(manageStaleActionGlyph("scan")).toBe("⌕")
  expect(manageStaleActionGlyph("path")).toBe("→")
})
