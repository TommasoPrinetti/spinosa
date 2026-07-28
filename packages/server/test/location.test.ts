import { describe, expect, test } from "bun:test"
import { ref } from "../src/location"

describe("location headers", () => {
  test("accepts current Spinosa headers and decodes the directory", () => {
    const location = ref({
      url: "http://localhost/api/session",
      headers: {
        "x-spinosa-directory": encodeURIComponent("/tmp/spinosa project"),
        "x-spinosa-workspace": "wrk_spinosa",
      },
    } as never)

    expect(String(location.directory)).toBe("/tmp/spinosa project")
    expect(String(location.workspaceID)).toBe("wrk_spinosa")
  })

  test("accepts legacy OpenCode headers but gives Spinosa headers precedence", () => {
    const legacy = ref({
      url: "http://localhost/api/session",
      headers: {
        "x-opencode-directory": encodeURIComponent("/tmp/legacy"),
        "x-opencode-workspace": "wrk_legacy",
      },
    } as never)
    const current = ref({
      url: "http://localhost/api/session",
      headers: {
        "x-spinosa-directory": encodeURIComponent("/tmp/current"),
        "x-opencode-directory": encodeURIComponent("/tmp/legacy"),
        "x-spinosa-workspace": "wrk_current",
        "x-opencode-workspace": "wrk_legacy",
      },
    } as never)

    expect(String(legacy.directory)).toBe("/tmp/legacy")
    expect(String(legacy.workspaceID)).toBe("wrk_legacy")
    expect(String(current.directory)).toBe("/tmp/current")
    expect(String(current.workspaceID)).toBe("wrk_current")
  })
})
