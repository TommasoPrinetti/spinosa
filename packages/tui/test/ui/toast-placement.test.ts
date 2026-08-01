import { describe, expect, test } from "bun:test"
import { toastOverlayStyle } from "../../src/ui/toast"

describe("toastOverlayStyle", () => {
  test("anchors top-right with terminal-relative maxWidth", () => {
    const style = toastOverlayStyle({ width: 120, height: 40 })
    expect(style.position).toBe("absolute")
    expect(style.top).toBe(2)
    expect(style.right).toBe(2)
    expect(style.maxWidth).toBe(60)
    expect(style.zIndex).toBe(4000)
  })

  test("shrinks maxWidth on narrow terminals without using content-column width", () => {
    const style = toastOverlayStyle({ width: 40, height: 24 })
    expect(style.top).toBe(2)
    expect(style.right).toBe(2)
    // margin*2 = 4 → max usable ≈ 36, floored by Math.max(20, …)
    expect(style.maxWidth).toBe(36)
  })

  test("keeps a usable minimum width on very narrow terminals", () => {
    const style = toastOverlayStyle({ width: 10, height: 10 })
    expect(style.maxWidth).toBe(20)
  })
})
