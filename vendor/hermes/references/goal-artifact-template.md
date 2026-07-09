# Goal Artifact Template

The orchestrator writes this file **before** dispatching any sub-agent.
Path: `agent_reports/g_{session_id}.md`

```markdown
---
type: goal
route: non-fast-path
session_id: YYYYMMDD-{short_hash}
created_at: YYYY-MM-DDTHH:MM:SS+TZ
status: in_progress
---

# Goal Artifact

## Cleaned Prompt

[One paragraph: user's request, stripped of noise]

## Goal Statement

[What must be true when the route completes]

## Success Criteria

- [Measurable gate 1]
- [Measurable gate 2]

## Planned Chain

[Initial agent sequence — adapts after each inspect step.
 Example: searcher → analyst → serendippo → writer → verifier → evaluator]

## First Agent

`spinosa-searcher` (or other)

## First Output Gate

[What the first agent's artifact must contain to pass inspect]

## Artifact Paths (session-scoped)

| Role | Path |
|------|------|
| Goal | `agent_reports/g_{session_id}.md` |
| Evidence | `agent_reports/evidence_packet_{session_id}.md` (parallel: `evidence_packet_{session_id}_{slug}.md`) |
| Analysis | `agent_reports/analysis_{session_id}.md` (if analyst runs) |
| Serendipity | `agent_reports/serendipity_{session_id}.md` (if serendippo runs) |
| Report | `agent_reports/NN_{topic-slug}.md` — slug = plain-language topic (see `artifact-naming.md`) |
| Verifier | In-place edit on terminal `NN_*.md` (`status` + corrections); optional audit log only if goal lists one |
| Evaluator | `agent_reports/e_{session_id}.md` |

## Route Decisions

Append one line after each inspect step. Example:

- YYYY-MM-DD HH:MM — Searcher gate PASS → analyst
- YYYY-MM-DD HH:MM — Analyst gate PASS → writer (serendippo skipped: analyst taxonomy sufficient)
- YYYY-MM-DD HH:MM — Writer gate PASS → verifier
- YYYY-MM-DD HH:MM — Verifier pass_with_corrections → evaluator
- YYYY-MM-DD HH:MM — Evaluator no_edit → deliver

## Sub-Agent Handoffs

Before each dispatch, append a fenced block (markers only — not a spawn substitute):

```spinosa-subagent
agent: spinosa-searcher
role: Searcher
task: [task for this step]
inputs:
  - goal_artifact_path
  - session_id
outputs:
  - agent_reports/evidence_packet_{session_id}.md
```
```

## Rules

- Record every inspect decision under `## Route Decisions` — do not rely on chat memory.
- List planned artifact paths up front so later agents and recovery know where to look.
- Do not paste evidence or raw excerpts into the goal file.