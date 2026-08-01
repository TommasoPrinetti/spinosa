import { describe, expect, test } from "bun:test"
import { isConversationShellReady } from "../../src/routes/session/conversation-shell-ready"

describe("isConversationShellReady", () => {
  test("waits for session sync", () => {
    expect(
      isConversationShellReady({ hasSession: false, promptVisible: true, promptMounted: false }),
    ).toBe(false)
  })

  test("dismisses boot overlay when permissions block the prompt", () => {
    expect(
      isConversationShellReady({ hasSession: true, promptVisible: false, promptMounted: false }),
    ).toBe(true)
  })

  test("waits for prompt mount when the prompt is visible", () => {
    expect(
      isConversationShellReady({ hasSession: true, promptVisible: true, promptMounted: false }),
    ).toBe(false)
    expect(
      isConversationShellReady({ hasSession: true, promptVisible: true, promptMounted: true }),
    ).toBe(true)
  })
})
