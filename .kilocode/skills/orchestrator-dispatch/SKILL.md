---
name: orchestrator-dispatch
description: Classify a user prompt and route it through the sub-agent pipeline
---

## Purpose

Log the request, classify the prompt, choose the right sub-agent sequence, dispatch sub-agents, and close the route.

## Steps

### 1. Log

Add one row to `03_logs/user_requests.md`:
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
| `index_maintenance` | Fix, deepen, clean, or update the Zone index |
| `cleanup` | Tidy or audit the Zone |

### 3. Choose Sequence

Default shapes are guidance. You may deviate at runtime. See `references/sequences.md` for full details.

| Class | Default Sequence | Skill to inject |
|---|---|---|
| `fast_path` | (none — answer directly) | — |
| `clarify_search` | skip (or Navigator if term disambiguation needed) | `source-intake` (if needed) |
| `find_material` | Navigator → Checker | `source-intake` → `claim-verification` |
| `evidence_answer` | Navigator → Packer → Checker | `source-intake` → `report-writing` → `claim-verification` |
| `synthesis_report` | Navigator ×N → Packer → Checker | `source-intake` ×N → `report-writing` → `claim-verification` |
| `verification` | Checker | `claim-verification` |
| `index_maintenance` | Navigator (if search) → Checker | `source-intake` → `claim-verification` |
| `cleanup` | Cleaner | `zone-cleanup` |

Note: Zone startup is a one-time operation handled by the orchestrator reading `00_system/instructions/STARTUP.md` directly — not through a skill injection.

### 4. Dispatch

For each sub-agent in the sequence:
1. Read the skill's `SKILL.md` from `.agents/skills/<skill-name>/SKILL.md`.
2. Inject the full SKILL.md content into the task prompt as instructions.
3. Pass: cleaned user prompt, prior sub-agent outputs, route constraints.
4. The sub-agent executes in a fresh general-agent context.

The skill IS the contract. No separate AGENTS.md file exists. The sub-agent follows the injected SKILL.md instructions.

### 5. Close

- Update the log row to `done` / `blocked` / `partial`.
- Cite created or changed files.
- State validation performed.
- State blockers or unchecked claims.

## Rules

- Checker is mandatory on every non-fast path.
- Never answer a non-fast-path question directly — always dispatch.
- Sub-agents never ask questions — you do.
- Never invent support. Report blockers honestly.
- Stop when the chain is complete — do not continue just because another specialist could add more detail.

## Skills Reference

See `references/skills.md` for the full role → skill mapping.

| Role | Skill | What it does |
|---|---|---|
| Navigator | `source-intake` | Searches raw copies and maps for evidence |
| Packer | `report-writing` | Synthesizes findings into reports |
| Checker | `claim-verification` | Verifies claims, quotes, and paths |
| Cleaner | `zone-cleanup` | Audits hygiene and archives stale files |

## See also

- `source-intake` — source file registration
- `report-writing` — report synthesis
- `claim-verification` — claim verification
- `zone-cleanup` — hygiene audit and archival
- `00_system/instructions/STARTUP.md` — Zone initialization protocol (orchestrator reads directly)
