import { describe, expect, test } from "bun:test"
import { fixtureWorkspacePath, runSpinosaMaturityChecks } from "../../src/spinosa/verify"

describe("runSpinosaMaturityChecks", () => {
  test("passes against fixture workspace", async () => {
    const report = await runSpinosaMaturityChecks(fixtureWorkspacePath())
    expect(report.failed).toBe(0)
    expect(report.passed).toBeGreaterThan(8)
  })
})