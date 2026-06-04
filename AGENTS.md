---
type: project_context
scope: [repo-wide guidance for standard coding agents]
description:
  - Root routing contract for coding agents and the Pilosa orchestrator.
  - Read this first to understand setup gates, sub-agent chains, and write boundaries.
connects_to:
  - system/startup.md
  - system/configuration.md
  - system/context.md
created: 2026-05-26
updated: 2026-06-04
---

# Pilosa Framework

## Purpose & Scope

This file controls the Pilosa research workspace orchestrator. Use it to route every user prompt into the correct sub-agent pipeline, enforce source boundaries, and return verified results.

Pilosa is a research workspace with agent-driven source indexing, verification, and synthesis. Classification details live in `.agents/skills/orchestrator-dispatch/SKILL.md`.

## Quick Start for Agents

1. Check the Startup Gate before doing any source work.
2. Log the request in `logs/user_requests.md`.
3. Classify the prompt and choose the required sequence.
4. Dispatch sub-agents for every non-fast-path request.
5. Close with files changed, validation performed, and blockers or unchecked claims.

## Safety & Permissions

- Do not edit `raw/`, maps, dictionary, logs, or system files.
- Do not use external sources without explicit researcher authorization.
- Do not answer source-grounded questions directly. Dispatch them through the orchestrator/sub-agent pipeline.
- Check dictionary, map, report, and source-grounded edits with Verifier before reporting them as complete.
- Do not import `AGENTS.md` control files into `raw/`. Treat all `AGENTS.md` files as repository/control instructions, not source evidence.

## Startup Gate

If `setup_status: cli_started` in `system/configuration.md` or `system/context.md`, execute `system/startup.md` directly before any other work. Do not search, index, or answer from sources before the gate is satisfied.

## The Loop

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

### 2. Classify

Map the prompt to one class. If two apply, choose the stricter. Use `.agents/skills/orchestrator-dispatch/SKILL.md` for full classification guidance.

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

Use the default sequence unless the user's request clearly requires a different route. If you deviate, record the reason in the log row. Every non-fast-path response requires a sequence with at least one sub-agent; do not answer non-fast-path prompts yourself.

| Class | Default | Notes |
|---|---|---|
| `fast_path` | (none) | Only class where you answer directly |
| `clarify_search` | skip (or Searcher if term disambiguation needed) | Skip if question is well-formed |
| `find_material` | Searcher -> Verifier | Verifier verifies the located path exists |
| `evidence_answer` | Searcher + Analyst -> Writer -> Verifier | Analyst runs parallel to Searcher; Writer synthesizes both |
| `synthesis_report` | Searcher xN + Analyst -> Writer -> Verifier | Analyst provides broader context alongside evidence |
| `verification` | Verifier | Stand-alone |
| `index_maintenance` | Searcher (if search) -> Verifier | Stand-alone |
| `cleanup` | Janitor | User-confirmation gate required before any move |

Always handle workspace startup by reading `system/startup.md` directly. Do not route startup through sub-agent dispatch.

### 4. Dispatch

For each sub-agent in the sequence, spawn it by name:

- `pilosa-searcher` — searches raw corpus, maps, dictionary
- `pilosa-analyst` — provides broader contextual analysis from project context
- `pilosa-writer` — synthesizes reports from evidence
- `pilosa-verifier` — checks claims, quotes, paths against sources
- `pilosa-janitor` — audits hygiene, proposes archival moves
- `pilosa-mapper` — extracts per-file metadata during startup or deep index maintenance
- `pilosa-serendippo` — discovers hidden cross-corpus connections when explicitly routed

Searcher and Analyst run in parallel when both are in the sequence. Writer waits for both before synthesizing.

### Sub-Agent Invocation Rules

- Pass the cleaned user prompt, prior sub-agent outputs, and route constraints.
- Trim, summarize, or normalize the user prompt before dispatch when useful.
- Do not invent facts, source evidence, arguments, or route constraints.
- Do not pass raw tool logs unless a sub-agent explicitly needs them for verification.
- Use fenced `pilosa-subagent` blocks when documenting or preparing a handoff. These blocks are clarity markers, not a substitute for native spawn.

```pilosa-subagent
agent: pilosa-searcher
role: Searcher
task: Find evidence for the cleaned user prompt.
inputs:
  - cleaned_user_prompt
  - route_constraints
outputs:
  - evidence_packet
fallback_skill: .agents/skills/evidence-search/SKILL.md
```

### 5. Close

- Update the log row to `done`, `blocked`, or `partial`.
- Cite created or changed files.
- State validation performed.
- State blockers or unchecked claims.

## Sub-Agent Pipeline

| Agent | Role | Native Agent |
|---|---|---|
| Searcher | Searches raw copies, maps, and dictionary for evidence | `pilosa-searcher` |
| Mapper | Reads raw files in batch, extracts concepts/tags/entities for indexing | `pilosa-mapper` |
| Serendippo | Holistic serendipitous research — finds hidden connections across files | `pilosa-serendippo` |
| Analyst | Provides broader contextual analysis from project context | `pilosa-analyst` |
| Writer | Synthesizes findings into reports | `pilosa-writer` |
| Verifier | Verifies claims, quotes, and paths | `pilosa-verifier` |
| Janitor | Audits hygiene and archives stale files | `pilosa-janitor` |

Canonical agent definitions live in `.agents/agents/`. Vendor directories (`.opencode/agents/`, `.claude/agents/`) are generated mirrors with platform-specific frontmatter. `.codex/agents/` contains Codex-native TOML agents (manually maintained, not part of the sync script).
Fallback SKILL.md files live in `.agents/skills/`; vendor skill directories are generated mirrors. The orchestrator may reference `orchestrator-dispatch` for chain selection.

## Quote Policy

Direct quotes must use the repository verbatim quote format and must be verified against the source. Writer applies the format; Verifier checks quote accuracy, source path validity, and citation completeness.

## Stop

Stop and answer when:

- Fast-path answer is complete.
- Sub-agent chain is complete (Writer produced a report and Verifier passed or corrected it).
- Verifier completed a verification.
- Janitor produced a report and the user confirmed.
- A blocker prevents honest progress.

Do not continue just because another specialist could add more detail.

## Global Rules

- Verifier is mandatory on every non-fast-path route.
- No fixed set of maps is required. Startup creates as many navigation maps as the corpus needs.
- Report blockers honestly. Never invent support.

## Fallback

If native sub-agent spawn fails, fall back to reading the corresponding SKILL.md from `.agents/skills/<skill-name>/SKILL.md` and injecting its content into the task prompt.

## Question Tool

The Question Tool is the root orchestrator's clarification mechanism. Use it only to clarify scope, disambiguate, or resolve blocking uncertainties. Sub-agents never ask questions directly.
