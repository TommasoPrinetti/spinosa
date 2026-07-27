import { expect, test } from "bun:test"
import path from "node:path"
import { mkdir } from "node:fs/promises"
import { tmpdir } from "../fixture/fixture"
import { analyzeRouteRecovery } from "../../src/spinosa/route-recovery"
import type { GoalArtifactSummary } from "@spinosa/core/types"

test("route recovery requires the goal artifact and tolerates corrupt artifact arrays", async () => {
  await using tmp = await tmpdir()
  await mkdir(path.join(tmp.path, "agent_reports"), { recursive: true })
  const goal = {
    sessionId: "session",
    goalPath: "agent_reports/g_session.md",
    filename: "g_session.md",
    routeDecisions: [],
    subagents: [],
    artifactPaths: null,
    phases: null,
  } as unknown as GoalArtifactSummary

  const result = await analyzeRouteRecovery(tmp.path, goal)

  expect(result.complete).toBe(false)
  expect(result.missing).toEqual([{ role: "Goal", path: goal.goalPath, exists: false }])
})
