import { describe, expect, test } from "bun:test"
import { normalizeRoute } from "../../src/context/route"

describe("normalizeRoute", () => {
  test("maps add-files route directly", () => {
    expect(normalizeRoute({ type: "add-files" })).toEqual({ type: "add-files" })
  })

  test("maps legacy onboarding add mode to add-files", () => {
    expect(normalizeRoute({ type: "onboarding", mode: "add" })).toEqual({ type: "add-files" })
  })

  test("maps legacy onboarding new mode to onboarding", () => {
    expect(normalizeRoute({ type: "onboarding", mode: "new" })).toEqual({ type: "onboarding" })
  })

  test("drops workspace-only fields when switching to add-files", () => {
    const next = normalizeRoute({ type: "add-files" })
    expect(next).toEqual({ type: "add-files" })
    expect("sessionID" in next).toBe(false)
    expect("prompt" in next).toBe(false)
  })
})