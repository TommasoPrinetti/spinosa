import { describe, expect, test } from "bun:test"
import { assertSafeWorkspaceName } from "../src/commands/create"

describe("assertSafeWorkspaceName", () => {
  test("accepts ordinary workspace names", () => {
    expect(() => assertSafeWorkspaceName("My Field Research")).not.toThrow()
    expect(() => assertSafeWorkspaceName("étude-2019")).not.toThrow()
    expect(() => assertSafeWorkspaceName("  padded  ")).not.toThrow()
  })

  test("rejects empty or whitespace-only names", () => {
    expect(() => assertSafeWorkspaceName("")).toThrow(/empty/i)
    expect(() => assertSafeWorkspaceName("   ")).toThrow(/empty/i)
  })

  test("rejects dot and dot-dot names", () => {
    expect(() => assertSafeWorkspaceName(".")).toThrow(/invalid/i)
    expect(() => assertSafeWorkspaceName("..")).toThrow(/invalid/i)
  })

  test("rejects path separators and traversal", () => {
    expect(() => assertSafeWorkspaceName("../evil")).toThrow(/separators/i)
    expect(() => assertSafeWorkspaceName("evil/../../home")).toThrow(/separators/i)
    expect(() => assertSafeWorkspaceName("..\\evil")).toThrow(/separators/i)
    expect(() => assertSafeWorkspaceName("a\0b")).toThrow(/separators/i)
  })

  test("rejects overlong names", () => {
    expect(() => assertSafeWorkspaceName("x".repeat(121))).toThrow(/at most 120/i)
    expect(() => assertSafeWorkspaceName("x".repeat(120))).not.toThrow()
  })
})