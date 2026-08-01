import { describe, expect, test } from "bun:test"

/** Mirrors SpinosaPromptChips connected+workspaceReady key gating. */
function homeChipKeys(input: {
  connected: boolean
  workspaceReady: boolean
  needsUpdate: boolean
}): string[] {
  if (!input.connected) return ["p"]
  if (input.workspaceReady) {
    return input.needsUpdate ? ["n", "a", "w", "v", "u"] : ["n", "a", "w", "v"]
  }
  return ["n", "w"]
}

describe("home chip key gating", () => {
  test("without workspace does not bind import/visualizer/update", () => {
    expect(homeChipKeys({ connected: true, workspaceReady: false, needsUpdate: false })).toEqual(["n", "w"])
  })

  test("with workspace binds import/switch/visualizer", () => {
    expect(homeChipKeys({ connected: true, workspaceReady: true, needsUpdate: false })).toEqual([
      "n",
      "a",
      "w",
      "v",
    ])
  })

  test("update key only when pack is stale", () => {
    expect(homeChipKeys({ connected: true, workspaceReady: true, needsUpdate: true })).toContain("u")
    expect(homeChipKeys({ connected: true, workspaceReady: true, needsUpdate: false })).not.toContain("u")
  })

  test("disconnected only binds provider", () => {
    expect(homeChipKeys({ connected: false, workspaceReady: true, needsUpdate: true })).toEqual(["p"])
  })
})
