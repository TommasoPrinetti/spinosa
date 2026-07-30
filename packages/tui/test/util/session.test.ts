import { describe, expect, test } from "bun:test"
import { isDefaultTitle, resolveSessionRuntimeStatus, sessionIsBusy } from "../../src/util/session"

describe("util.session", () => {
  test("recognizes generated parent and child titles", () => {
    expect(isDefaultTitle("New session - 2026-06-06T12:34:56.789Z")).toBeTrue()
    expect(isDefaultTitle("Child session - 2026-06-06T12:34:56.789Z")).toBeTrue()
    expect(isDefaultTitle("New session - custom")).toBeFalse()
  })

  test("falls back to transcript-derived busy when session_status is idle/missing", () => {
    expect(resolveSessionRuntimeStatus({ type: "idle" }, "working")).toEqual({ type: "busy" })
    expect(resolveSessionRuntimeStatus(undefined, "compacting")).toEqual({ type: "busy" })
    expect(sessionIsBusy({ type: "idle" }, "working")).toBeTrue()
    expect(sessionIsBusy({ type: "busy" }, "idle")).toBeTrue()
    expect(sessionIsBusy({ type: "idle" }, "idle")).toBeFalse()
  })
})