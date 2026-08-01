import { describe, expect, test } from "bun:test"
import { partsToV2Prompt, resolvePromptDelivery } from "../../src/util/session-prompt-v2"

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

  test("defaults mid-run delivery to steer", () => {
    expect(resolvePromptDelivery({ busy: true })).toBe("steer")
    expect(resolvePromptDelivery({ busy: true, preferQueue: true })).toBe("queue")
  })
})
