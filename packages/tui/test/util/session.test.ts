import { describe, expect, test } from "bun:test"
import { anySessionBusy, isDefaultTitle, resolveSessionRuntimeStatus, sessionIsBusy } from "../../src/util/session"

describe("util.session", () => {
  test("recognizes generated parent and child titles", () => {
    expect(isDefaultTitle("New session - 2026-06-06T12:34:56.789Z")).toBeTrue()
    expect(isDefaultTitle("Child session - 2026-06-06T12:34:56.789Z")).toBeTrue()
    expect(isDefaultTitle("New session - custom")).toBeFalse()
  })

  test("trusts explicit server idle over transcript-derived working", () => {
    expect(resolveSessionRuntimeStatus({ type: "idle" }, "working")).toEqual({ type: "idle" })
    expect(sessionIsBusy({ type: "idle" }, "working")).toBeFalse()
    expect(sessionIsBusy({ type: "busy" }, "idle")).toBeTrue()
    expect(sessionIsBusy({ type: "idle" }, "idle")).toBeFalse()
  })

  test("falls back to transcript-derived busy when session_status is missing", () => {
    expect(resolveSessionRuntimeStatus(undefined, "working")).toEqual({ type: "busy" })
    expect(resolveSessionRuntimeStatus(undefined, "compacting")).toEqual({ type: "busy" })
    expect(sessionIsBusy(undefined, "working")).toBeTrue()
  })

  test("blocks organisation switch when any session is busy", () => {
    expect(
      anySessionBusy({
        sessionStatus: { a: { type: "idle" } },
        sessions: [{ id: "a" }, { id: "b" }],
        derivedStatus: (id) => (id === "b" ? "working" : "idle"),
      }),
    ).toBeTrue()
    expect(
      anySessionBusy({
        sessionStatus: { a: { type: "idle" } },
        sessions: [{ id: "a" }],
        derivedStatus: () => "idle",
      }),
    ).toBeFalse()
  })
})
