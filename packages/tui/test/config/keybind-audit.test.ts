import { describe, expect, test } from "bun:test"
import { Definitions } from "../../src/config/keybind"

describe("tui keybind audit fixes", () => {
  test("app.exit no longer collides with session.queued_prompts on <leader>q", () => {
    expect(Definitions.app_exit.default).not.toContain("<leader>q")
    expect(Definitions.session_queued_prompts.default).toBe("<leader>q")
  })

  test("tips.toggle no longer collides with session.toggle.conceal on <leader>h", () => {
    expect(Definitions.tips_toggle.default).not.toBe("<leader>h")
    expect(Definitions.messages_toggle_conceal.default).toBe("<leader>h")
  })

  test("prompt.submit_queue description names Steer behavior", () => {
    expect(Definitions.prompt_submit_queue.description.toLowerCase()).toContain("steer")
  })
})
