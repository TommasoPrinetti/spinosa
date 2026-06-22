---
name: spinosa-orchestrator-dispatch
type: skill
scope: prompt_routing
description: Condense a user prompt into a frozen goal artifact, route it through a sub-agent pipeline (sequential by default; parallel mapper dispatch during startup Phase 2.2), and run the post-route audit loop
created: 2026-05-26
updated: 2026-06-21
---

## Purpose

Log the request, split it into `fast_path` or `non-fast-path`, write a frozen goal artifact for non-fast-path work, dispatch the sub-agent chain (sequential by default; parallel mapper dispatch during startup Phase 2.2), run the mandatory post-route audit loop, and close the route.

## Safety & Permissions

- Do not edit `raw/`, maps, dictionary data, or source corpus files. The orchestrator writes `logs/user_requests.md`; sub-agents append only compact count/path rows to `logs/session_metrics.tsv`.
- Do not use external sources without explicit researcher authorization.
- Do not answer source-grounded questions directly. Dispatch them through the orchestrator/sub-agent pipeline.
- Check dictionary, report, and source-grounded edits with Verifier before reporting them as complete. Map content is self-correcting through agent use; Verifier checks map paths only when a route explicitly asks for path verification.
- Do not import `AGENTS.md` control files into `raw/`. Treat all `AGENTS.md` files as repository/control instructions, not source evidence.
- Framework evolution may edit only `AGENTS.md`, `.agents/agents/`, `.agents/skills/`, and behavior-defining docs under `system/`.

## Steps

### 1. Log

Add one row to `logs/user_requests.md`:

```
| Date | Request summary | Route | Status | Output |
```

Example:

```markdown
| 2026-06-04 | Find reports about professional judgment | non-fast-path | done | goal + report returned with verifier pass |
```

Keep log rows short. Do not write secrets, credentials, large blobs, raw source dumps, or raw tool logs into `logs/user_requests.md`.

Assign a `session_id` in the form `YYYYMMDD-HHMMSS-route` for every non-fast-path route. Pass it to sub-agents and ask them to append compact operation metrics to `logs/session_metrics.tsv` after they write their normal output. Phase B agents append `evaluate`, `evolve`, and `validate_evolution` operations when they run.

### 2. Route Split

Map the prompt to one route. See `references/classification.md` for definitions.

| Route | When |
|---|---|
| `fast_path` | Operational answer, no source search or orchestrated artifact chain |
| `non-fast-path` | Any source-grounded, verification, maintenance, cleanup, indexing, or synthesis request that needs orchestrated artifacts |

### 3. Form Goal And Freeze Phase A

Every `non-fast-path` response requires a Phase A goal artifact before any sub-agent runs. Do not answer non-fast-path prompts yourself. See `references/sequences.md` for the full contract.

The goal artifact must record:
- cleaned prompt
- goal statement
- primarily qualitative success metric
- fixed serialized agent chain
- expected artifact from each step
- one rationale line per step
- explicit statement that the chain is frozen once written

Chain rules:
- `fast_path` answers directly and skips the goal artifact.
- `non-fast-path` starts with an orchestrator-written goal artifact in `agent_reports/`.
- Choose the smallest chain that can honestly finish the work.
- Every chosen Phase A agent must write a durable artifact to `agent_reports/`.
- The chain is sequential once frozen: no parallel steps, no appended steps, no skipped steps, no mid-route replanning. Exception: during startup Phase 2.2, all `spinosa-mapper` sub-agents are spawned in parallel in a single message (one per batch). See `system/startup.md` Phase 2.2.
- Repeated agents are allowed only when declared in the goal artifact with separate rationale lines.
- If the route produces a user-facing answer report, Writer must produce it before Verifier.
- Verifier is required whenever the route yields claims, citations, or quotes that need truth-checking.

Always handle workspace startup by reading `system/startup.md` directly. Do not route startup through a skill injection.

For every non-fast-path route, append:

`Evaluator → (Evolver when decision = edit_recommended) → targeted validation`

### 4. Dispatch

For each sub-agent in the frozen sequence:

1. **Native spawn** (preferred): Spawn by canonical name — `spinosa-searcher`, `spinosa-analyst`, `spinosa-writer`, `spinosa-verifier`, `spinosa-evaluator`, `spinosa-evolver`, `spinosa-janitor`, `spinosa-mapper`, or `spinosa-serendippo`. Pass: goal artifact path, prior sub-agent outputs, route constraints.
2. **Fallback** (if native unavailable): Read the skill's `SKILL.md` from `.agents/skills/<skill-name>/SKILL.md`, inject into the task prompt as instructions.

Phase A is sequential and file-based by default. The orchestrator writes the goal artifact first, then passes prior artifact paths into each later step. **Exception:** during startup Phase 2.2, all `spinosa-mapper` sub-agents are dispatched in a single message (one per batch) — see `system/startup.md` Sections 2.2 Steps 1-3. Evaluator runs after the Phase A terminal artifact reaches the intended checking state. Evolver runs only when the evaluator emits `edit_recommended`.

Canonical definitions live in `.agents/agents/`. Vendor agent directories are generated mirrors, including `.codex/agents/` as generated TOML wrappers. The orchestrator playbook lives in `AGENTS.md`.

After each sub-agent returns, verify that `logs/session_metrics.tsv` contains a row for the current `session_id` and the expected operation (`search`, `analysis`, `synthesis`, `verify`, `evaluate`, `evolve`, `map_extract`, `map_write`, or the route-specific operation). If the row is missing, record a process warning in the next durable artifact or final route notes. Missing metrics do not block the substantive route when the expected output artifact exists and passes its own checks.

### File-Based Handoff

Sub-agents write results to files and return paths. The orchestrator passes **paths, not content** between agents.

**How it works:**

1. **Orchestrator** writes a goal artifact in `agent_reports/` that freezes the chain.
2. **Phase A agents** each read the prior artifact paths and write their own next artifact to `agent_reports/`.
3. **Writer** creates the user-facing answer report only when the goal artifact includes an answer-producing step.
4. **Verifier** truth-checks substantive outputs when the route presents claims, citations, or quotes.
5. **Phase B audit**: Evaluator writes a separate audit report to `agent_reports/`. If needed, Evolver writes a separate evolution report there too.
6. **Metrics check**: After each returned artifact, verify that `logs/session_metrics.tsv` contains a row for the current `session_id` and the expected operation. If the row is missing, record a process warning in the next durable artifact or final route notes. Missing metrics do not block the substantive route when the expected output artifact exists and passes its own checks.
7. **Cleanup**: After the terminal artifact is checked and the Phase B loop is complete, process files are moved to `.trash/`. Final reports and audit/evolution reports remain in `agent_reports/`.

**Size thresholds:**
- If a sub-agent returns a file path instead of inline content, always pass the path — never cat the file into the next agent's prompt.
- If evidence exceeds ~300 lines or ~50 sources, expect the Searcher to split into main packet + appendix.

### Sub-Agent Invocation Rules

- Pass the goal artifact path, prior sub-agent output paths, and route constraints.
- Pass `session_id`, `route`, and a short `query_label` so sub-agents can write session metrics.
- Trim, summarize, or normalize the user prompt before dispatch when useful.
- Do not invent facts, source evidence, arguments, or route constraints.
- Do not pass raw tool logs unless a sub-agent explicitly needs them for verification.
- Each sub-agent may invoke only the scripts listed in its `granted_tools` YAML frontmatter. If a sub-agent needs a tool not declared there, either update the agent definition before dispatch or note the gap as a route constraint.
- Use fenced `spinosa-subagent` blocks when documenting or preparing a handoff. These blocks are clarity markers, not a substitute for native spawn.
- When invoking Evaluator, pass: original prompt, goal artifact path, frozen chain, produced artifact paths, verifier outcome when present, and `session_id`.
- When invoking Evolver, pass only the evaluator audit path and the allowed mutation scope.
- Targeted validation after Evolver should check touched files structurally and sanity-check the affected route logic. It does not rerun the whole user question.

```spinosa-subagent
agent: spinosa-searcher
role: Searcher
task: Find evidence for the cleaned user prompt.
inputs:
  - goal_artifact_path
  - route_constraints
outputs:
  - evidence_packet_path (file path to agent_reports/evidence_packet.md)
fallback_skill: .agents/skills/evidence-search/SKILL.md
```

### 5. Close

- Update the log row to `done`, `blocked`, or `partial`.
- Cite created or changed files: answer report, audit report, evolution report if any, and touched framework files.
- Move process files to `.trash/` (evidence packets, extraction batches, appendix files) after Phase B completes.
- State validation performed, including targeted evolution validation when Evolver ran.
- State blockers or unchecked claims.

## Rules

- **All output must be reports.** Every answer to a user question is a report written to `agent_reports/`. Phase B outputs are reports too. No inline chat responses. No exceptions.
- Verifier is mandatory whenever a non-fast-path artifact presents claims, citations, or quotes that require truth-checking.
- Evaluator is mandatory on every non-fast path after the Phase A terminal artifact reaches its intended checking state.
- Never answer a non-fast-path question directly — always dispatch.
- The Question Tool is the root orchestrator's clarification mechanism. Use it only to clarify scope, disambiguate, or resolve blocking uncertainties.
- Sub-agents never ask questions directly.
- Never invent support. Report blockers honestly.
- Self-edits apply only to future requests. Never re-run or reinterpret the completed answer report under the new instructions.
- Evolution edits must be tightly scoped, justified by the evaluator report, and limited to control files plus behavior-defining system docs.
- Stop when the chain is complete — for non-fast-path routes, that means Phase A plus Phase B are both complete.
- **Final answer reports plus audit/evolution reports stay in `agent_reports/`. Process files are moved to `.trash/` after delivery.**

## Skills Reference

See `references/skills.md` for the full role → skill mapping.

| Role | Native Agent | Skill | What it does |
|---|---|---|---|
| Searcher | `spinosa-searcher` | `spinosa-evidence-search` | Searches existing raw copies and maps for evidence |
| Analyst | `spinosa-analyst` | `spinosa-context-analysis` | Reads prior artifacts and project context, then writes a contextual analysis packet |
| Writer | `spinosa-writer` | `spinosa-report-writing` | Produces the user-facing answer report when the frozen chain requires one |
| Verifier | `spinosa-verifier` | `spinosa-claim-verification` | Truth-checks claims, quotes, and paths in substantive artifacts |
| Evaluator | `spinosa-evaluator` | `spinosa-evaluator` | Audits completed non-fast-path routes and decides whether evolution is justified |
| Evolver | `spinosa-evolver` | `spinosa-evolver` | Applies tightly scoped framework updates for future requests |
| Janitor | `spinosa-janitor` | `spinosa-workspace-cleanup` | Writes a cleanup audit artifact and proposes archival moves |
| Mapper | `spinosa-mapper` | `spinosa-mapper-fallback` | Reads raw files in batches; extracts content-grounded fragments, key passages, and concept signals; writes maps |
| Serendippo | `spinosa-serendippo` | `spinosa-serendippo-fallback` | Finds hidden cross-corpus connections and proposes map enrichment |

## See also

- `spinosa-evidence-search` — file-based evidence retrieval fallback for Searcher
- `spinosa-source-intake` — source file registration; not a Searcher fallback
- `spinosa-context-analysis` — broader contextual analysis
- `spinosa-report-writing` — report synthesis
- `spinosa-claim-verification` — claim verification
- `spinosa-evaluator` — post-route audit and edit decision
- `spinosa-evolver` — constrained framework self-editing
- `spinosa-workspace-cleanup` — hygiene audit and archival
- `spinosa-mapper` — startup and deep index-maintenance extraction agent
- `spinosa-serendippo` — hidden-connection discovery agent
- `system/startup.md` — workspace initialization protocol (orchestrator reads directly)

## References

| File | Content |
|---|---|
| `references/classification.md` | Fast-path vs non-fast-path routing split |
| `references/sequences.md` | Goal artifact requirements and frozen sequential chain rules |
| `references/skills.md` | Complete role → skill mapping table |
