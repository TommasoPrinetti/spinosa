import { describe, expect, test } from "bun:test"
import { buildLaunchCommand } from "../../src/spinosa-core/handoff/builder"

describe("spinosa handoff builder", () => {
  test("uses a non-conflicting heredoc delimiter when prompt contains the default marker", () => {
    const prompt = "before\nSPINOSA_STARTUP_PROMPT\nafter"
    const command = buildLaunchCommand("/tmp/workspace", "codex", prompt)

    expect(command).toContain("SPINOSA_STARTUP_PROMPT_2")
    expect(command).not.toContain("<<'SPINOSA_STARTUP_PROMPT'\n")
  })

  test("uses installed Spinosa TUI without network package execution", () => {
    const command = buildLaunchCommand("/tmp/workspace", "opencode", "prompt")
    expect(command).toStartWith("spinosa-tui ")
    expect(command).not.toContain("npx")
    expect(command).not.toContain("bunx")
  })
})
