# Orchestrator Notes

This is the orchestrator's working memory — a holistic record of context,
decisions, and lessons across sessions. The orchestrator reads and updates
this file based on what the user requests.

## Current Context


## Session History

- **2026-06-29 — Harness diagrams + startup prompt cleanup.** Wrote `docs/diagrams.md` with 9 Mermaid diagrams (harness, orchestrator loop, sub-agents, file layers, chain shapes, state machine, file classification, notepad flow, fallback gateway). Updated `system/system_architecture_map.md` to current architecture (orchestrator-notes.md, no events.jsonl). Merged extraction batch (3a)→spawn (3b) into a single step — file lists now passed inline in mapper tasks, no intermediate `extraction_batch_list.md` file. Changed per-file YAML `summary` field from prose (4 lines max) to dense keyword string optimized for future grep. Updated `.agents/agents/spinosa-mapper.md`, `.agents/skills/spinosa-mapper/SKILL.md` to match. Fixed `spinosa/src/workspace/create.ts` — removed legacy TSV header write, added `.spinosa/memory` dir scaffold.

- **2026-06-29 — Swarm audit + startup prompt consolidation.** Three-agent parallel swarm found 23 issues. Fixed: consolidated two contradictory startup prompts into one canonical version at root `startup-prompt.md` (7-phase, includes verifier+evaluator+delegation). Redirected `.bin/startup-prompt.md`. Fixed `framework-files.tsv`: removed `.bin/spinosa` (already retired), fixed `bun.lockb`→`bun.lock`, fixed `.spinosa/memory/` policy from `always_replace` to `never_replace`. Added `startup-prompt.md` (root) to manifest. Added `session_id` format, `fast_path` answer protocol, and steady-state recovery path to AGENTS.md. Fixed docs: `docs/reference/agents.md` (10 agents, added Overseer, fixed batch size 10-15→20-25, added artifact patterns), `docs/reference/corpus.md` (7→10 agents), `docs/reference/reports.md` (session-named artifacts). Fixed stale `.bin/startup-prompt.md` references in `create.ts` and `new-workspace.ts`.

- **2026-06-29 — Branch cleanup + framework apply.** Reset `development` to `main` (shell-based CLI), deleted `bun-migration` branch (local + remote). Applied 44-file framework upgrade: agent memory model (return counts, no TSV), Overseer agent, AGENTS.md §4e recovery + session_id format, startup prompt consolidation, docs fixes, framework manifest cleanup, memory/archive dirs. Removed all Bun/TS artifacts (spinosa/, package.json). Regenerated vendor mirrors via sync-agents.sh. Committed as `5d93d5bc` to `development`. `main` untouched (savepoint).

## Observations

- Branch cleanup went cleanly: `development = main` after reset, no conflicts.
- `.codex/` remains gitignored (build artifact). 7 stale TOML files still tracked on main but will be refreshed by sync-agents.sh in practice.
- Log files auto-renamed to `.spinosa/archive/` by git's rename detection during commit — history preserved.
- Two deploy sub-agents per the plan. Main agent wrote this final report from the serialized plan output.
