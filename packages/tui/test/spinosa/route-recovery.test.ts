import { describe, expect, test } from "bun:test"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parseGoalArtifact } from "../../src/spinosa/parse-goal"
import { analyzeRouteRecovery } from "../../src/spinosa/route-recovery"

const fixture = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "fixtures/workspace-started")

describe("analyzeRouteRecovery", () => {
  test("detects missing report artifact", async () => {
    const text = await Bun.file(path.join(fixture, "agent_reports/g_20260701-fixture.md")).text()
    const goal = parseGoalArtifact(text, "agent_reports/g_20260701-fixture.md")
    const recovery = await analyzeRouteRecovery(fixture, goal)
    expect(recovery.sessionId).toBe("20260701-fixture")
    expect(recovery.missing.some((gap) => gap.path.includes("01_fixture-report"))).toBe(false)
    expect(recovery.missing.some((gap) => gap.path.includes("analysis_"))).toBe(true)
  })
})