import { describe, expect, test } from "bun:test"
import {
  beforeToolCall,
  freezeTurn,
  isBusyPhase,
  isToolTerminate,
  phaseForActive,
  prepareNextTurn,
  refreshSavePoint,
  rejectIfBusy,
  resolveDelivery,
  resolveTurnHooks,
  shouldStopAfterTurn,
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
    expect(phaseForActive(true)).toBe("turn")
    expect(phaseForActive(false)).toBe("idle")
    expect(rejectIfBusy(phaseForActive(true), "compact")?.operation).toBe("compact")
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

  test("refreshSavePoint commits barriers for the next turn / post-compaction rebuild", () => {
    const first = freezeTurn({
      sessionID: "ses_1",
      step: 1,
      system: ["sys-v1"],
      toolNames: ["read"],
      model: { id: "m1", provider: "p" },
      createdAt: 1,
    })
    const save1 = refreshSavePoint({ snapshot: first, refreshedAt: 10 })
    expect(save1.snapshot.system).toEqual(["sys-v1"])
    expect(save1.refreshedAt).toBe(10)

    const second = freezeTurn({
      sessionID: "ses_1",
      step: 2,
      system: ["sys-v2"],
      toolNames: ["read", "write"],
      model: { id: "m2", provider: "p" },
      createdAt: 2,
    })
    const save2 = refreshSavePoint({ snapshot: second, previous: save1, refreshedAt: 20 })
    expect(save2.snapshot.system).toEqual(["sys-v2"])
    expect(save2.snapshot.toolNames).toEqual(["read", "write"])
    expect(save2.refreshedAt).toBe(20)
    expect(save1.snapshot.system).toEqual(["sys-v1"])
  })

  test("prepareNextTurn routes compaction before the provider call", () => {
    const snapshot = freezeTurn({
      sessionID: "ses_1",
      step: 1,
      system: [],
      toolNames: [],
      model: { id: "m", provider: "p" },
    })
    expect(prepareNextTurn({ snapshot, wouldCompact: true })).toEqual({ action: "compact" })
    expect(prepareNextTurn({ snapshot, wouldCompact: false })).toEqual({ action: "continue" })
  })

  test("shouldStopAfterTurn stops on terminate or max-steps", () => {
    expect(shouldStopAfterTurn({ terminated: true, maxStepsReached: false, needsContinuation: true })).toBe(true)
    expect(shouldStopAfterTurn({ terminated: false, maxStepsReached: true, needsContinuation: true })).toBe(true)
    expect(shouldStopAfterTurn({ terminated: false, maxStepsReached: false, needsContinuation: true })).toBe(false)
    expect(shouldStopAfterTurn({ terminated: false, maxStepsReached: false, needsContinuation: false })).toBe(true)
  })

  test("beforeToolCall can skip without entering permission flow", () => {
    expect(beforeToolCall({ toolName: "bash", callID: "1" })).toEqual({ action: "allow" })
    expect(
      beforeToolCall({ toolName: "bash", callID: "1" }, () => ({ action: "skip", reason: "denied by gate" })),
    ).toEqual({ action: "skip", reason: "denied by gate" })

    const hooks = resolveTurnHooks({
      beforeToolCall: (input) =>
        input.toolName === "bash" ? { action: "skip", reason: "no bash" } : { action: "allow" },
    })
    expect(hooks.beforeToolCall({ toolName: "bash", callID: "x" })).toEqual({
      action: "skip",
      reason: "no bash",
    })
    expect(hooks.beforeToolCall({ toolName: "read", callID: "y" })).toEqual({ action: "allow" })
    expect(hooks.prepareNextTurn({ snapshot: freezeTurn({
      sessionID: "s",
      step: 1,
      system: [],
      toolNames: [],
      model: { id: "m", provider: "p" },
    }), wouldCompact: true }).action).toBe("compact")
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
