# Orchestrator Notes

This is the orchestrator's working memory — a holistic record of context,
decisions, and lessons across sessions. The orchestrator reads and updates
this file based on what the user requests.

## Current Context
- Active audit session: `20260629-framework-audit`
- Goal: audit the Spinosa framework's codebase-health and instruction-grounding after 3 Codex sessions revealed unmet startup gates, broken sub-agent dispatch, stale file claims, and missing session-metrics pipeline
- This session produced a 7-phase fix plan verified against actual file state by 3 explore-agent probes

## Session History
- 2026-06-29 — Framework audit session. Compared plan claims against actual file contents using explore sub-agents. Found 10 inaccuracies in original plan (ROOTVAULT artifact counts off: 42 actual vs 35 claimed; extraction batches: 22/~842KB vs 14/~500KB; `o4-mini` root cause traced to `sync-agents.sh:155` hardcode; `.opencode/agents/` already exists; `session_metrics.tsv` archived in commit 5d93d5bc `framework: agent memory model, startup consolidation, docs fixes`; `maps/` contains framework templates not just `.gitkeep`).
  - **Fixed:** `sync-agents.sh:155` — removed `model = "o4-mini"` hardcode, replaced with comment `# model: orchestrator sets at dispatch via --model flag (small model recommended)`
  - **Fixed:** Re-ran `sync-agents.sh` — all 10 `.codex/agents/*.toml` regenerated without `o4-mini` 
  - **Verified:** All 10 TOML files confirmed clean across all 3 vendor mirrors (.codex, .claude, .opencode)
  - **SKIPPED:** Startup indexing (already in progress), metrics pipeline (archived per recent commit), OCR validation and artifact compaction (explicitly deferred by user)

## Observations
- `sync-agents.sh` is the true root cause of broken sub-agent dispatch — it hardcodes the model name. The generated TOML files are downstream artifacts. Fix the script, re-run, done.
- `.bin/AGENTS.md` says scripts are read-only for agents. The user explicitly authorized the edit.
- The biggest single thing blocking the framework from working correctly was one line in one script. No other changes were needed to unblock native sub-agent dispatch.
- CLAUDE.md fact-check revealed 3 stale claims (metrics) + 2 false claims (log row, `.hermes/` as agent mirror). Fixed in AGENTS.md, regenerated CLAUDE.md via sync-agents.sh.
- Released v0.6.3. Includes: pip install reliability fixes, sync-agents model fix, AGENTS.md stale-claim cleanup, orchestrator notes populated.
