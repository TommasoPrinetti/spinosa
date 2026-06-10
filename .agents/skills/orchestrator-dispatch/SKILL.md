---
name: spinosa-orchestrator-dispatch
type: skill
scope: prompt_routing
description: Classify a user prompt and route it through the sub-agent pipeline
created: 2026-05-26
updated: 2026-06-04
---

## Purpose

Log the request, classify the prompt, choose the right sub-agent sequence, dispatch sub-agents, and close the route.

## Safety & Permissions

- Do not edit `raw/`, maps, dictionary, or system files. The orchestrator writes `logs/user_requests.md`; sub-agents append only compact count/path rows to `logs/session_metrics.tsv`.
- Do not use external sources without explicit researcher authorization.
- Do not answer source-grounded questions directly. Dispatch them through the orchestrator/sub-agent pipeline.
- Check dictionary, report, and source-grounded edits with Verifier before reporting them as complete. Map content is self-correcting through agent use; Verifier checks map paths only when a route explicitly asks for path verification.
- Do not import `AGENTS.md` control files into `raw/`. Treat all `AGENTS.md` files as repository/control instructions, not source evidence.

## Steps

### 1. Log

Add one row to `logs/user_requests.md`:

```
| Date | Request summary | Route | Status | Output |
```

Example:

```markdown
| 2026-06-04 | Find reports about professional judgment | evidence_answer | done | report returned with verifier pass |
```

Keep log rows short. Do not write secrets, credentials, large blobs, raw source dumps, or raw tool logs into `logs/user_requests.md`.

Assign a `session_id` in the form `YYYYMMDD-HHMMSS-route` for every non-fast-path route. Pass it to sub-agents and ask them to append compact operation metrics to `logs/session_metrics.tsv` after they write their normal output.

### 2. Classify

Map the prompt to one class. If two apply, choose the stricter. See `references/classification.md` for full definitions.

| Class | When |
|---|---|
| `fast_path` | Operational answer, no source search |
| `clarify_search` | Translate terms before searching |
| `find_material` | User asks what exists or where to look |
| `evidence_answer` | Answer grounded in sources |
| `synthesis_report` | Structured report / comparison / narrative |
| `verification` | Check a quote, claim, citation, path, or report |
| `index_maintenance` | Fix, deepen, clean, or update the workspace index |
| `cleanup` | Tidy or audit the workspace |

### 3. Choose Sequence

Use the default sequence unless the user's request clearly requires a different route. If you deviate, record the reason in the log row. Every non-fast-path response requires a sequence with at least one sub-agent; do not answer non-fast-path prompts yourself. See `references/sequences.md` for full details.

| Class | Default Sequence | Skill to inject |
|---|---|---|
| `fast_path` | (none — answer directly) | — |
| `clarify_search` | skip (or Searcher if term disambiguation needed) | `spinosa-evidence-search` (if needed) |
| `find_material` | Searcher → Verifier | `spinosa-evidence-search` → `spinosa-claim-verification` |
| `evidence_answer` | Searcher + Analyst → Serendippo → Writer → Verifier | `spinosa-evidence-search` + `spinosa-context-analysis` → serendipity → `spinosa-report-writing` → `spinosa-claim-verification` |
| `synthesis_report` | Searcher ×N + Analyst → Serendippo → Writer → Verifier | `spinosa-evidence-search` ×N + `spinosa-context-analysis` → serendipity → `spinosa-report-writing` → `spinosa-claim-verification` |
| `verification` | Verifier | `spinosa-claim-verification` |
| `index_maintenance` | Searcher, Mapper, or Source Intake → Verifier | `spinosa-evidence-search` or `spinosa-source-intake` → `spinosa-claim-verification` |
| `cleanup` | Janitor | `spinosa-workspace-cleanup` |

Always handle workspace startup by reading `system/startup.md` directly. Do not route startup through a skill injection.

### 4. Dispatch

For each sub-agent in the sequence:

1. **Native spawn** (preferred): Spawn by canonical name — `spinosa-searcher`, `spinosa-analyst`, `spinosa-writer`, `spinosa-verifier`, `spinosa-janitor`, `spinosa-mapper`, or `spinosa-serendippo`. Pass: cleaned user prompt, prior sub-agent outputs, route constraints.
2. **Fallback** (if native unavailable): Read the skill's `SKILL.md` from `.agents/skills/<skill-name>/SKILL.md`, inject into the task prompt as instructions.

Searcher and Analyst run in parallel when both are in the sequence. Writer waits for both before synthesizing.

Canonical definitions live in `.agents/agents/`. Vendor agent directories are generated mirrors, including `.codex/agents/` as generated TOML wrappers. The orchestrator playbook lives in `AGENTS.md`.

### File-Based Handoff

Sub-agents write results to files and return paths. The orchestrator passes **paths, not content** between agents.

**How it works:**

1. **Searcher** writes evidence to `agent_reports/evidence_packet.md` (and optionally `agent_reports/evidence_appendix.md` for large sets). Returns path + summary.
2. **Mapper** writes extraction packets to `agent_reports/extraction_batch.md`. Returns path + count.
3. **Orchestrator** passes the file paths to the next agent (e.g., Writer reads from the files).
4. **Writer** reads evidence from the files, creates the final report in `agent_reports/`.
5. **Cleanup**: After the final report is verified, process files (`evidence_packet.md`, `evidence_appendix.md`, `extraction_batch.md`) are moved to `.trash/`. Only the final report remains in `agent_reports/`.

**Size thresholds:**
- If a sub-agent returns a file path instead of inline content, always pass the path — never cat the file into the next agent's prompt.
- If evidence exceeds ~300 lines or ~50 sources, expect the Searcher to split into main packet + appendix.

### Sub-Agent Invocation Rules

- Pass the cleaned user prompt, prior sub-agent outputs (file paths or inline), and route constraints.
- Pass `session_id`, `route`, and a short `query_label` so sub-agents can write session metrics.
- Trim, summarize, or normalize the user prompt before dispatch when useful.
- Do not invent facts, source evidence, arguments, or route constraints.
- Do not pass raw tool logs unless a sub-agent explicitly needs them for verification.
- Use fenced `spinosa-subagent` blocks when documenting or preparing a handoff. These blocks are clarity markers, not a substitute for native spawn.

```spinosa-subagent
agent: spinosa-searcher
role: Searcher
task: Find evidence for the cleaned user prompt.
inputs:
  - cleaned_user_prompt
  - route_constraints
outputs:
  - evidence_packet_path (file path to agent_reports/evidence_packet.md)
fallback_skill: .agents/skills/evidence-search/SKILL.md
```

### 5. Close

- Update the log row to `done`, `blocked`, or `partial`.
- Cite created or changed files (final report only).
- Move process files to `.trash/` (evidence packets, extraction batches, appendix files).
- State validation performed.
- State blockers or unchecked claims.

## Rules

- **All output must be reports.** Every answer to a user question is a report written to `agent_reports/`. No inline chat responses. No exceptions.
- Verifier is mandatory on every non-fast path.
- Never answer a non-fast-path question directly — always dispatch.
- The Question Tool is the root orchestrator's clarification mechanism. Use it only to clarify scope, disambiguate, or resolve blocking uncertainties.
- Sub-agents never ask questions directly.
- Never invent support. Report blockers honestly.
- Stop when the chain is complete — do not continue just because another specialist could add more detail.
- **Only the final verified report stays in `agent_reports/`. Process files are moved to `.trash/` after delivery.**

## Skills Reference

See `references/skills.md` for the full role → skill mapping.

| Role | Native Agent | Skill | What it does |
|---|---|---|---|
| Searcher | `spinosa-searcher` | `spinosa-evidence-search` | Searches existing raw copies and maps for evidence |
| Analyst | `spinosa-analyst` | `spinosa-context-analysis` | Provides broader contextual analysis from project context |
| Writer | `spinosa-writer` | `spinosa-report-writing` | Synthesizes findings into reports |
| Verifier | `spinosa-verifier` | `spinosa-claim-verification` | Verifies claims, quotes, and paths |
| Janitor | `spinosa-janitor` | `spinosa-workspace-cleanup` | Audits hygiene and archives stale files |
| Mapper | `spinosa-mapper` | `spinosa-mapper-fallback` | Reads raw files in batches; extracts content-grounded fragments, key passages, and concept signals; writes maps |
| Serendippo | `spinosa-serendippo` | `spinosa-serendippo-fallback` | Finds hidden cross-corpus connections and proposes map enrichment |

## See also

- `spinosa-evidence-search` — file-based evidence retrieval fallback for Searcher
- `spinosa-source-intake` — source file registration; not a Searcher fallback
- `spinosa-context-analysis` — broader contextual analysis
- `spinosa-report-writing` — report synthesis
- `spinosa-claim-verification` — claim verification
- `spinosa-workspace-cleanup` — hygiene audit and archival
- `spinosa-mapper` — startup and deep index-maintenance extraction agent
- `spinosa-serendippo` — hidden-connection discovery agent
- `system/startup.md` — workspace initialization protocol (orchestrator reads directly)

## References

| File | Content |
|---|---|
| `references/classification.md` | Full prompt classification definitions |
| `references/sequences.md` | Default sub-agent sequences per route class |
| `references/skills.md` | Complete role → skill mapping table
