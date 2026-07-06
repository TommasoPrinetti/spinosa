import { describe, expect, test } from "bun:test"
import { inferPhasesFromGoal, parseGoalArtifact } from "../../src/spinosa/parse-goal"

const sampleGoal = `---
type: goal
session_id: 20260701-abc123
status: in_progress
---

# Goal Artifact

## Cleaned Prompt

Find evidence about cohort A.

## Goal Statement

Deliver a verified report.

## Planned Chain

searcher → writer → verifier → evaluator

## First Agent

\`spinosa-searcher\`

## Artifact Paths (session-scoped)

| Role | Path |
|------|------|
| Goal | \`agent_reports/g_20260701-abc123.md\` |
| Evidence | \`agent_reports/evidence_packet_20260701-abc123.md\` |
| Report | \`agent_reports/01_topic.md\` |

## Route Decisions

- 2026-07-01 10:00 — Searcher gate PASS → writer
- 2026-07-01 10:05 — Writer gate PASS → verifier

\`\`\`spinosa-subagent
agent: spinosa-searcher
role: Searcher
task: Find evidence
\`\`\`
`

describe("parseGoalArtifact", () => {
  test("parses goal sections and phases", () => {
    const parsed = parseGoalArtifact(sampleGoal, "agent_reports/g_20260701-abc123.md")
    expect(parsed.sessionId).toBe("20260701-abc123")
    expect(parsed.cleanedPrompt).toContain("cohort A")
    expect(parsed.artifactPaths.length).toBeGreaterThanOrEqual(3)
    expect(parsed.subagents[0]?.agent).toBe("spinosa-searcher")
    expect(parsed.phases.some((phase) => phase.agent === "spinosa-searcher")).toBe(true)
  })
})

describe("parseOrchestratorCounter", () => {
  test("reads routes_since_overseer", async () => {
    const { parseOrchestratorCounter } = await import("../../src/spinosa/parse-goal")
    const notes = "routes_since_overseer: 4"
    expect(parseOrchestratorCounter(notes)).toBe(4)
  })
})

describe("inferPhasesFromGoal", () => {
  test("marks passed agents as ok", () => {
    const phases = inferPhasesFromGoal(
      [{ agent: "spinosa-searcher", role: "Searcher" }],
      ["Searcher gate PASS → writer"],
    )
    expect(phases[0]?.status).toBe("ok")
  })
})