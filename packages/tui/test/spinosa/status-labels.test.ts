import { describe, expect, test } from "bun:test"
import { setupStatusLabel, setupStatusThemeKey } from "../../src/spinosa/status-labels"

describe("setupStatusLabel", () => {
  test("maps known statuses", () => {
    expect(setupStatusLabel("not_started")).toBe("Setup needed")
    expect(setupStatusLabel("cli_started")).toBe("Ready to index")
    expect(setupStatusLabel("workspace_started")).toBe("Ready")
    expect(setupStatusLabel("unknown")).toBe("Unknown")
  })
})

describe("setupStatusThemeKey", () => {
  test("maps semantic keys", () => {
    expect(setupStatusThemeKey("workspace_started")).toBe("success")
    expect(setupStatusThemeKey("cli_started")).toBe("info")
    expect(setupStatusThemeKey("not_started")).toBe("warning")
  })
})