import { describe, expect, test } from "bun:test"
import {
  buildOptimisticSession,
  createPendingSessionID,
  partsToV2Prompt,
  resolvePromptDelivery,
  shouldNavigateBeforeCreate,
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
    expect(shouldNavigateBeforeCreate(false)).toBe(true)
    expect(shouldNavigateBeforeCreate(true)).toBe(false)
    expect([...newSessionSubmitPhases()]).toEqual(["seed", "navigate", "create", "prepare", "prompt"])
  })

  test("buildOptimisticSession seeds a conversation-ready session", () => {
    const id = createPendingSessionID()
    expect(id.startsWith("ses_")).toBe(true)
    const session = buildOptimisticSession({
      id,
      directory: "/tmp/workspace",
      projectID: "proj_test",
      title: "  Hello  ",
    })
    expect(session.id).toBe(id)
    expect(session.directory).toBe("/tmp/workspace")
    expect(session.projectID).toBe("proj_test")
    expect(session.title).toBe("Hello")
    expect(session.version).toBeTruthy()
    expect(session.time.created).toBeGreaterThan(0)
  })
})
