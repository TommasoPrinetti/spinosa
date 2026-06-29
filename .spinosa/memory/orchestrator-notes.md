# Orchestrator Notes

This is the orchestrator's working memory — a holistic record of context,
decisions, and lessons across sessions. The orchestrator reads and updates
this file based on what the user requests.

## Current Context


## Session History

- **2026-06-29 — Harness diagrams + startup prompt cleanup.** Wrote `docs/diagrams.md` with 9 Mermaid diagrams (harness, orchestrator loop, sub-agents, file layers, chain shapes, state machine, file classification, notepad flow, fallback gateway). Updated `system/system_architecture_map.md` to current architecture (orchestrator-notes.md, no events.jsonl). Merged extraction batch (3a)→spawn (3b) into a single step — file lists now passed inline in mapper tasks, no intermediate `extraction_batch_list.md` file. Changed per-file YAML `summary` field from prose (4 lines max) to dense keyword string optimized for future grep. Updated `.agents/agents/spinosa-mapper.md`, `.agents/skills/spinosa-mapper/SKILL.md` to match. Fixed `spinosa/src/workspace/create.ts` — removed legacy TSV header write, added `.spinosa/memory` dir scaffold.

- **2026-06-29 — Swarm audit + startup prompt consolidation.** Three-agent parallel swarm found 23 issues. Fixed: consolidated two contradictory startup prompts into one canonical version at root `startup-prompt.md` (7-phase, includes verifier+evaluator+delegation). Redirected `.bin/startup-prompt.md`. Fixed `framework-files.tsv`: removed `.bin/spinosa` (already retired), fixed `bun.lockb`→`bun.lock`, fixed `.spinosa/memory/` policy from `always_replace` to `never_replace`. Added `startup-prompt.md` (root) to manifest. Added `session_id` format, `fast_path` answer protocol, and steady-state recovery path to AGENTS.md. Fixed docs: `docs/reference/agents.md` (10 agents, added Overseer, fixed batch size 10-15→20-25, added artifact patterns), `docs/reference/corpus.md` (7→10 agents), `docs/reference/reports.md` (session-named artifacts). Fixed stale `.bin/startup-prompt.md` references in `create.ts` and `new-workspace.ts`.

- **2026-06-29 — Branch cleanup + framework apply.** Reset `development` to `main` (shell-based CLI), deleted `bun-migration` branch (local + remote). Applied 44-file framework upgrade: agent memory model (return counts, no TSV), Overseer agent, AGENTS.md §4e recovery + session_id format, startup prompt consolidation, docs fixes, framework manifest cleanup, memory/archive dirs. Removed all Bun/TS artifacts (spinosa/, package.json). Regenerated vendor mirrors via sync-agents.sh. Committed as `5d93d5bc` to `development`. `main` untouched (savepoint).

- **2026-06-29 — Stale file cleanup + overseer upgrade.** Removed stale references (spinosa/src/ in docs, logs/AGENTS.md scope), cleaned 10 old dist/ releases, deleted .bin/pilosa, removed 7 stale .codex/ TOML files from git tracking, fixed both framework manifests (add missing shell CLI entries, un-retire 14 false Bun entries). Extended spinosa-overseer to load agent-interception skill and analyze raw Codex/OpenCode session logs for file-access coverage detection. Added agent-interception skill (scripts + references) to project .agents/skills/. Committed as `3a5bf02a`.

## Observations

- Branch cleanup went cleanly: `development = main` after reset, no conflicts.
- `.codex/` remains gitignored (build artifact). Stale TOML files removed from index; sync-agents.sh generates fresh ones.
- Log files auto-renamed to `.spinosa/archive/` by git's rename detection during commit — history preserved.
- spinosa-overseer now has Phase 0 for raw session log analysis via agent-interception skill (scripts: extract-codex.sh, extract-opencode.sh, analyze-events.sh).
- Agent-interception skill added to project .agents/skills/ for version control + vendor mirror sync.
- Old dist/ releases (v0.5.6 through v0.5.15) deleted; v0.5.16 and v0.5.17 retained.
- dist/ releases and vendor/ tarballs left as gitignored disk artifacts (not tracked).

- **2026-06-29 — overseer discretion.** AGENTS.md §6 updated: orchestrator can now trigger spinosa-overseer based on discretionary triggers (corpus expansion, topic shift, agent imbalance, unusual session, intuition) in addition to the 5-route minimum counter and user request. §4 step 3 now checks unread overseer advisories before selecting the next sub-agent. Advisory consumption moved to standing rules, deduplicated. Committed as `d44af109`.

- **2026-06-29 — OpenCode sub-agent description fix.** Added `description: >` field to `.opencode` agent template in `sync-agents.sh`. Previously, the `.opencode` template emitted only `mode: subagent` + `permission`, missing `description`. OpenCode fell back to "should only be called manually by the user" for all spinosa sub-agent types. Fixed by emitting the canonical agent description into the `.opencode` YAML frontmatter. Ran sync-agents.sh — regenerates `.opencode/agents/*.md` with proper descriptions. Committed as `bf7f50ce`.
