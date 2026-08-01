import { describe, expect, test } from "bun:test"
import {
  partsToV2Prompt,
  resolvePromptDelivery,
  shouldNavigateBeforePrepare,
  shouldSeedSessionBeforeNavigate,
  newSessionSubmitPhases,
} from "../../src/util/session-prompt-v2"

describe("session-prompt-v2", () => {
  test("maps V1 parts into V2 PromptInput", () => {
    expect(
      partsToV2Prompt([
        { type: "text", text: "hello" },
        { type: "text", text: "ignored", ignored: true },
        { type: "file", url: "file:///tmp/a.png", filename: "a.png", mime: "image/png" },
        { type: "agent", name: "explore" },
      ]),
    ).toEqual({
      text: "hello",
      files: [{ uri: "file:///tmp/a.png", name: "a.png", mime: "image/png" }],
      agents: [{ name: "explore" }],
    })
  })

  test("defaults mid-run delivery to queue", () => {
    expect(resolvePromptDelivery({ busy: true })).toBe("queue")
    expect(resolvePromptDelivery({ busy: true, preferSteer: true })).toBe("steer")
    expect(resolvePromptDelivery({ busy: true, preferQueue: true })).toBe("queue")
    expect(resolvePromptDelivery({ busy: false, preferQueue: true })).toBe("steer")
    expect(resolvePromptDelivery({ busy: true, requested: "steer" })).toBe("steer")
  })

  test("navigates to conversation before Spinosa prepare on new sessions only", () => {
    expect(shouldNavigateBeforePrepare(false)).toBe(true)
    expect(shouldNavigateBeforePrepare(true)).toBe(false)
    expect(shouldSeedSessionBeforeNavigate(false)).toBe(true)
    expect(shouldSeedSessionBeforeNavigate(true)).toBe(false)
    expect([...newSessionSubmitPhases()]).toEqual(["create", "seed", "navigate", "prepare", "prompt"])
  })
})
