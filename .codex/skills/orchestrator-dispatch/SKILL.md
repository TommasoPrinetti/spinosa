---
name: orchestrator-dispatch
description: Classify a user prompt and route it through the sub-agent pipeline
---

## Purpose

Log the request, classify the prompt, choose the right sub-agent sequence, dispatch sub-agents, and close the route.

## Steps

### 1. Log

Add one row to `logs/user_requests.md`:
```
| Date | Request summary | Route | Status | Output |
```

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

Default shapes are guidance. You may deviate at runtime. See `references/sequences.md` for full details.

| Class | Default Sequence | Skill to inject |
|---|---|---|
| `fast_path` | (none — answer directly) | — |
| `clarify_search` | skip (or Searcher if term disambiguation needed) | `source-intake` (if needed) |
| `find_material` | Searcher → Verifier | `source-intake` → `claim-verification` |
| `evidence_answer` | Searcher + Analyst → Writer → Verifier | `source-intake` + `context-analysis` → `report-writing` → `claim-verification` |
| `synthesis_report` | Searcher ×N + Analyst → Writer → Verifier | `source-intake` ×N + `context-analysis` → `report-writing` → `claim-verification` |
| `verification` | Verifier | `claim-verification` |
| `index_maintenance` | Searcher (if search) → Verifier | `source-intake` → `claim-verification` |
| `cleanup` | Janitor | `workspace-cleanup` |

Note: workspace startup is a one-time operation handled by the orchestrator reading `system/startup.md` directly — not through a skill injection.

### 4. Dispatch

For each sub-agent in the sequence:

1. **Native spawn** (preferred): Spawn by name — `pilosa-searcher`, `pilosa-analyst`, `pilosa-writer`, `pilosa-verifier`, `pilosa-janitor`. Pass: cleaned user prompt, prior sub-agent outputs, route constraints.
2. **Fallback** (if native unavailable): Read the skill's `SKILL.md` from `.agents/skills/<skill-name>/SKILL.md`, inject into the task prompt as instructions.

Searcher and Analyst run in parallel when both are in the sequence. Writer waits for both before synthesizing.

Native definitions live in `.opencode/agents/`, `.claude/agents/`, `.codex/agents/`. The orchestrator playbook lives in `AGENTS.md`.

You may pre-process the user prompt before dispatch: trim, summarize, normalize. Do not invent.

### 5. Close

- Update the log row to `done` / `blocked` / `partial`.
- Cite created or changed files.
- State validation performed.
- State blockers or unchecked claims.

## Rules

- Verifier is mandatory on every non-fast path.
- Never answer a non-fast-path question directly — always dispatch.
- Sub-agents never ask questions — you do.
- Never invent support. Report blockers honestly.
- Stop when the chain is complete — do not continue just because another specialist could add more detail.

## Skills Reference

See `references/skills.md` for the full role → skill mapping.

| Role | Native Agent | Skill | What it does |
|---|---|---|---|
| Searcher | `pilosa-searcher` | `source-intake` | Searches raw copies and maps for evidence |
| Analyst | `pilosa-analyst` | `context-analysis` | Provides broader contextual analysis from project context |
| Writer | `pilosa-writer` | `report-writing` | Synthesizes findings into reports |
| Verifier | `pilosa-verifier` | `claim-verification` | Verifies claims, quotes, and paths |
| Janitor | `pilosa-janitor` | `workspace-cleanup` | Audits hygiene and archives stale files |

## See also

- `source-intake` — source file registration
- `context-analysis` — broader contextual analysis
- `report-writing` — report synthesis
- `claim-verification` — claim verification
- `workspace-cleanup` — hygiene audit and archival
- `system/instructions/startup.md` — workspace initialization protocol (orchestrator reads directly)
