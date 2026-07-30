import { describe, expect, test } from "bun:test"
import { normalizeRoute } from "../../src/context/route"

describe("normalizeRoute", () => {
  test("maps add-files route directly", () => {
    expect(normalizeRoute({ type: "add-files" })).toEqual({ type: "add-files" })
  })

  test("drops workspace-only fields when switching to add-files", () => {
    const next = normalizeRoute({ type: "add-files" })
    expect(next).toEqual({ type: "add-files" })
    expect("sessionID" in next).toBe(false)
    expect("prompt" in next).toBe(false)
  })

  test("preserves plugin routes for feature plugins", () => {
    expect(normalizeRoute({ type: "plugin", id: "diff-viewer", data: { path: "a" } })).toEqual({
      type: "plugin",
      id: "diff-viewer",
      data: { path: "a" },
    })
  })

  test("normalizes unknown runtime routes to the global", () => {
    expect(normalizeRoute({ type: "future-route" } as never)).toEqual({ type: "global" })
  })
})
