import { describe, expect, test } from "bun:test"
import { truthy, value } from "../src/flag/flag"

describe("legacy environment compatibility", () => {
  test("uses OPENCODE aliases when the SPINOSA variable is absent", () => {
    const env = { OPENCODE_CONFIG: "/legacy/config.json", OPENCODE_PURE: "true" }

    expect(value("SPINOSA_CONFIG", env)).toBe("/legacy/config.json")
    expect(truthy("SPINOSA_PURE", env)).toBe(true)
  })

  test("prefers SPINOSA variables over OPENCODE aliases", () => {
    const env = {
      SPINOSA_CONFIG: "/spinosa/config.json",
      OPENCODE_CONFIG: "/legacy/config.json",
      SPINOSA_PURE: "false",
      OPENCODE_PURE: "true",
    }

    expect(value("SPINOSA_CONFIG", env)).toBe("/spinosa/config.json")
    expect(truthy("SPINOSA_PURE", env)).toBe(false)
  })
})
