import { describe, expect, test } from "bun:test"
import {
  RECENT_WORKSPACE_COUNT,
  RECENT_WORKSPACE_COUNT_COMPACT,
  buildOpenWorkspaceSoftFail,
  formatCompactMaintenanceCue,
  formatMaintenanceStalePaths,
  formatOpenWorkspaceFailureMessage,
  formatRecentLoadError,
  formatRecentWorkspacesLabel,
  formatRepairVersionUnknownMessage,
  humanizeWorkspacePresence,
  isRecoverableOpenFailure,
  recentDisplayCap,
  recentOverflowCount,
} from "../../src/spinosa/home-visibility"

describe("home visibility helpers", () => {
  test("recent caps and overflow label", () => {
    expect(recentDisplayCap(false)).toBe(RECENT_WORKSPACE_COUNT)
    expect(recentDisplayCap(true)).toBe(RECENT_WORKSPACE_COUNT_COMPACT)
    expect(recentOverflowCount(6, 4)).toBe(2)
    expect(recentOverflowCount(1, 4)).toBe(0)
    expect(formatRecentWorkspacesLabel(6, 4)).toBe("Recent workspaces (6)")
    expect(formatRecentWorkspacesLabel(2, 4)).toBe("Recent workspaces")
  })

  test("recent load error is never silent", () => {
    expect(formatRecentLoadError(new Error("registry locked"))).toContain("registry locked")
    expect(formatRecentLoadError("boom")).toContain("boom")
    expect(formatRecentLoadError("   ")).toBe("Couldn’t load recent workspaces.")
  })

  test("maintenance confirm lists truncated paths", () => {
    const listed = formatMaintenanceStalePaths(
      ["/Users/me/.spinosa/versions/.0.9.0.staging.1"],
      ["/tmp/spinosa-launch-abc", "/tmp/spinosa-upgrade-def", "/tmp/a", "/tmp/b", "/tmp/c", "/tmp/d", "/tmp/e", "/tmp/f"],
      3,
    )
    expect(listed.count).toBe(9)
    expect(listed.message).toContain("9 leftover install/temp paths")
    expect(listed.message).toContain("· ")
    expect(listed.message).toContain("…and 6 more")
  })

  test("compact maintenance cue stays one line", () => {
    expect(formatCompactMaintenanceCue({ staleCount: 0, repairRequired: false })).toBeUndefined()
    expect(formatCompactMaintenanceCue({ staleCount: 2, repairRequired: false })).toBe(
      "Maintenance: 2 leftover install paths",
    )
    expect(formatCompactMaintenanceCue({ staleCount: 1, repairRequired: true })).toBe(
      "Maintenance: 1 leftover install path · runtime needs repair",
    )
  })

  test("repair version unknown message", () => {
    expect(formatRepairVersionUnknownMessage()).toContain("version unknown")
  })

  test("openWorkspace soft-fail message includes path and presence", () => {
    expect(humanizeWorkspacePresence("non_existent")).toBe("not found")
    const message = formatOpenWorkspaceFailureMessage({
      path: "/Users/me/Documents/research/very-long-workspace-path-name",
      presence: "non_existent",
      reason: "Workspace not found",
    })
    expect(message).toContain("Workspace not found")
    expect(message).toContain("not found")
    expect(isRecoverableOpenFailure("non_existent")).toBe(true)
    expect(isRecoverableOpenFailure("identity_mismatch")).toBe(false)
    expect(buildOpenWorkspaceSoftFail({
      path: "/tmp/ws",
      name: "ws",
      presence: "invalid",
      reason: "Workspace invalid",
    }).recoverable).toBe(true)
  })
})
