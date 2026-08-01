import { describe, expect, test } from "bun:test"
import {
  freezeTurn,
  isBusyPhase,
  isToolTerminate,
  rejectIfBusy,
  resolveDelivery,
  statusForPhase,
} from "@spinosa/kernel-core/session/loop-control"

describe("SessionLoopControl", () => {
  test("maps phases onto idle|busy|retry without inventing new wire statuses", () => {
    expect(statusForPhase("idle")).toBe("idle")
    expect(statusForPhase("retry")).toBe("retry")
    expect(statusForPhase("turn")).toBe("busy")
    expect(statusForPhase("tool")).toBe("busy")
    expect(statusForPhase("compaction")).toBe("busy")
    expect(statusForPhase("promoting")).toBe("busy")
  })

  test("rejects structural ops while busy", () => {
    expect(rejectIfBusy("idle", "switchModel")).toBeUndefined()
    const rejection = rejectIfBusy("turn", "switchModel")
    expect(rejection?._tag).toBe("SessionLoopControl.BusyRejection")
    expect(rejection?.message).toContain("switchModel")
    expect(isBusyPhase("turn")).toBe(true)
    expect(isBusyPhase("idle")).toBe(false)
  })

  test("freezes turn snapshot so mid-run mutations cannot rewrite barriers", () => {
    const system = ["a"]
    const tools = ["read"]
    const snapshot = freezeTurn({
      sessionID: "ses_1",
      step: 2,
      promotion: "steer",
      system,
      toolNames: tools,
      model: { id: "m", provider: "p" },
      createdAt: 1,
    })
    system.push("b")
    tools.push("write")
    expect(snapshot.system).toEqual(["a"])
    expect(snapshot.toolNames).toEqual(["read"])
    expect(snapshot.promotion).toBe("steer")
  })

  test("resolveDelivery defaults to steer mid-run (Pi), queue only when requested", () => {
    expect(resolveDelivery({ busy: false })).toBe("steer")
    expect(resolveDelivery({ busy: true })).toBe("steer")
    expect(resolveDelivery({ busy: true, preferQueue: true })).toBe("queue")
    expect(resolveDelivery({ busy: true, requested: "queue" })).toBe("queue")
    expect(resolveDelivery({ busy: false, requested: "queue" })).toBe("queue")
  })

  test("detects optional tool terminate signals", () => {
    expect(isToolTerminate({ terminate: true })).toBe(true)
    expect(isToolTerminate({ terminate: true, reason: "done" })).toBe(true)
    expect(isToolTerminate({ ok: true })).toBe(false)
    expect(isToolTerminate(null)).toBe(false)
  })
})
