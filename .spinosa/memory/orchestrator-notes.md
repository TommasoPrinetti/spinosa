# Orchestrator Notes

This is the orchestrator's working memory — a holistic record of context,
decisions, and lessons across sessions. The orchestrator reads and updates
this file based on what the user requests.

## Overseer State

- routes_since_overseer: 0
- last_overseer_session: (none)
- last_coverage_report: (none)

## Current Context
- Published `v0.8.0-beta.2` on branch `fix/runtime-p1-20260630` — prerelease-aware version comparison, animated cloud copy progress, responsive Ctrl-C during timed I/O
- Live beta endpoint verified: `PINNED_VERSION="0.8.0-beta.2"` at [[releases/download/beta/install.sh]]
- Last audit: `20260630-ac11dc72` on branch `audit/framework-contract-20260630` — report [[agent_reports/11_spinosa-framework-audit.md]]; P0 contract fixes applied (docs/agents); runtime deferred
- Goal: audit the Spinosa framework's codebase-health and instruction-grounding after 3 Codex sessions revealed unmet startup gates, broken sub-agent dispatch, stale file claims, and missing session-metrics pipeline
- This session produced a 7-phase fix plan verified against actual file state by 3 explore-agent probes

## Session History
- 2026-07-02 — Stable/beta endpoint production hardening implemented directly in code. Fixed installer channel persistence, exact-version download tags, channel-aware installer `--latest`, publish-time `PINNED_TAG` validation, exact vs rolling installer staging, and release-channel regression coverage. Validation included shell syntax checks, no-network release-channel tests, vendor-reuse regression, `git diff --check`, and installer dry-run URL probes for rolling beta plus exact beta/stable.
- 2026-07-02 — Stable/beta endpoint check (`20260702-100936`) initially blocked under orchestration: two `spinosa-searcher` dispatches timed out without producing `agent_reports/evidence_packet_20260702-100936.md`; evaluator [[agent_reports/e_20260702-100936.md]] returned `no_edit`. After user challenge, completed a direct local code audit in [[agent_reports/13_stable-beta-endpoint-check.md]] (`status: direct_audit`). Findings: rolling channel model is sound, but implementation has concrete risks: beta installs default config to `release_channel: stable`; explicit beta version URLs use rolling `beta` instead of `vX.Y.Z-beta.N`; publish script validates `PINNED_VERSION` but not `PINNED_TAG`; installer `--latest` is channel-incoherent. Live GitHub endpoint assets were not fetched.
- 2026-07-02 — Phase 0 quick wins implemented and verified (`20260702-091415`). Report: [[agent_reports/12_phase-0-quick-wins.md]]; evaluator: [[agent_reports/e_20260702-091415.md]] (`pass_with_notes`, `no_edit`); verifier: `pass_with_corrections`. Completed: pypdf pinned to `pypdf==5.1.0`, vendor `requirements.txt` hash-lock install support, platform-targeted vendor lock generation in `.bin/build-spinosa-vendor.sh`, installer disk-space preflight (~500MB on measurable temp/install volumes), expanded global/per-command CLI help, community docs and GitHub templates. Validation: shell syntax, `git diff --check`, issue-form YAML parsing, `spinosa --help`, `spinosa upgrade --help`, `.bin/test-install-vendor-reuse.sh`, and stubbed low-disk helper path. Full vendor build/end-to-end install not run due network downloads. Pre-existing dirty hunks in touched files were preserved.
- 2026-07-01 — Published v0.8.0-beta.2. Fixed: `compare_versions` prerelease awareness, animated update progress on cloud I/O, Ctrl-C cancels timed child. Phase A passed. Rolling beta channel synced.
- 2026-06-29 — Framework audit session. Compared plan claims against actual file contents using explore sub-agents. Found 10 inaccuracies in original plan (ROOTVAULT artifact counts off: 42 actual vs 35 claimed; extraction batches: 22/~842KB vs 14/~500KB; `o4-mini` root cause traced to `sync-agents.sh:155` hardcode; [[.opencode/agents/]] already exists; `session_metrics.tsv` archived in commit 5d93d5bc `framework: agent memory model, startup consolidation, docs fixes`; [[maps/]] contains framework templates not just `.gitkeep`).
  - **Fixed:** `sync-agents.sh:155` — removed `model = "o4-mini"` hardcode, replaced with comment `# model: orchestrator sets at dispatch via --model flag (small model recommended)`
  - **Fixed:** Re-ran `sync-agents.sh` — all 10 `.codex/agents/*.toml` regenerated without `o4-mini` 
  - **Verified:** All 10 TOML files confirmed clean across all 3 vendor mirrors (.codex, .claude, .opencode)
  - **SKIPPED:** Startup indexing (already in progress), metrics pipeline (archived per recent commit), OCR validation and artifact compaction (explicitly deferred by user)

## Observations
- `sync-agents.sh` is the true root cause of broken sub-agent dispatch — it hardcodes the model name. The generated TOML files are downstream artifacts. Fix the script, re-run, done.
- [[.bin/AGENTS.md]] says scripts are read-only for agents. The user explicitly authorized the edit.
- The biggest single thing blocking the framework from working correctly was one line in one script. No other changes were needed to unblock native sub-agent dispatch.
- CLAUDE.md fact-check revealed 3 stale claims (metrics) + 2 false claims (log row, [[.hermes/]] as agent mirror). Fixed in AGENTS.md, regenerated CLAUDE.md via sync-agents.sh.
- Released v0.6.3. Includes: pip install reliability fixes, sync-agents model fix, AGENTS.md stale-claim cleanup, orchestrator notes populated.
