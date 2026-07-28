import path from "node:path"
import { chainForRoute, classifyPrompt, isNonFastPath, type RouteClass } from "@spinosa/runtime"
import { generateSessionId } from "../session-id"
import { writeTextAtomic } from "../utils/fs"

export function buildGoalArtifactBody(input: {
  sessionId: string
  cleanedPrompt: string
  route: RouteClass
  now?: Date
}): string {
  const created = (input.now ?? new Date()).toISOString()
  const chain = chainForRoute(input.route)
  const firstAgent =
    input.route === "Q4"
      ? "spinosa-janitor"
      : input.route === "Q5"
        ? "spinosa-overseer"
        : "spinosa-searcher"

  return `---
type: goal
route: ${input.route === "fast_path" ? "fast_path" : "non-fast-path"}
session_id: ${input.sessionId}
created_at: ${created}
status: in_progress
---

# Goal Artifact

## Cleaned Prompt

${input.cleanedPrompt.trim()}

## Goal Statement

Deliver a verified Spinosa report for this request when the route completes.

## Success Criteria

- Evidence and claims trace to approved source paths
- Terminal report exists under agent_reports/NN_*.md
- Verifier and evaluator gates recorded under Route Decisions

## Planned Chain

${chain}

## First Agent

\`${firstAgent}\`

## First Output Gate

Searcher returns an evidence packet with source paths and quotes, or a documented blocker.

## Artifact Paths (session-scoped)

| Role | Path |
|------|------|
| Goal | \`agent_reports/g_${input.sessionId}.md\` |
| Evidence | \`agent_reports/evidence_packet_${input.sessionId}.md\` |
| Analysis | \`agent_reports/analysis_${input.sessionId}.md\` |
| Serendipity | \`agent_reports/serendipity_${input.sessionId}.md\` |
| Report | \`agent_reports/NN_descriptive-name.md\` |
| Evaluator | \`agent_reports/e_${input.sessionId}.md\` |

## Route Decisions

- ${created.slice(0, 16).replace("T", " ")} — Goal framed in TUI → ${firstAgent}

## Sub-Agent Handoffs

\`\`\`spinosa-subagent
agent: ${firstAgent}
role: ${firstAgent.replace("spinosa-", "")}
task: Execute first pipeline phase for the cleaned prompt.
inputs:
  - goal_artifact_path
  - session_id
outputs:
  - agent_reports/evidence_packet_${input.sessionId}.md
\`\`\`
`
}

export async function writeGoalArtifact(
  workspacePath: string,
  cleanedPrompt: string,
  options?: { sessionId?: string; route?: RouteClass },
): Promise<{ sessionId: string; route: RouteClass; goalPath: string }> {
  const sessionId = options?.sessionId ?? generateSessionId()
  const route = options?.route ?? classifyPrompt(cleanedPrompt)
  const body = buildGoalArtifactBody({ sessionId, cleanedPrompt, route })
  const relative = path.join("agent_reports", `g_${sessionId}.md`)
  const absolute = path.join(workspacePath, relative)
  writeTextAtomic(absolute, body)
  return { sessionId, route, goalPath: relative }
}

export function orchestratorPreamble(input: {
  workspacePath: string
  route: RouteClass
  sessionId?: string
  goalPath?: string
}): string {
  const lines = [
    "Spinosa runtime is scheduling this request.",
    "Execute only the assigned phase. Do not call the Task tool or dispatch subagents; the runtime owns the chain.",
    `Workspace: ${input.workspacePath}`,
    `Route class: ${input.route}`,
  ]
  if (input.sessionId) lines.push(`session_id: ${input.sessionId}`)
  if (input.goalPath) lines.push(`Goal artifact: ${input.goalPath}`)
  if (isNonFastPath(input.route)) {
    lines.push("Do not paste long reports into chat — write agent_reports/NN_*.md and point to the verified file.")
  }
  return lines.join("\n")
}
