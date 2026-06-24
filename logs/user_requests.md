---
type: request_log
role: request_routing_log
scope: framework_and_research_requests
purpose: record user prompts and the file or route outcome
description:
  - Append-only routing log for user prompts and traceability summaries.
  - Agents update this with route, status, and output after each orchestrated request
connects_to:
  - AGENTS.md
  - agent_reports/
created: 2026-05-26
updated: 2026-06-10
---
# User Requests

Short routing log for user prompts. Log the request before deciding whether to answer directly or route through sub-agents.

| Date | Request summary | Route | Status | Output |
|-----|----------------|-------|--------|--------|
| 2026-06-22 | Make MarkItDown progress bar advance to the active file during conversion | fast_path | done | .bin/spinosa active converter index display updated; bash -n passed |
| 2026-06-22 | Truncate long onboarding corpus/workspace/source paths in CLI display | fast_path | done | .bin/spinosa path display helper applied; bash -n passed |
| 2026-06-22 | Replace OCR per-file newline progress with in-place converter progress bar | fast_path | done | .bin/spinosa progress rendering updated; bash -n passed |
| 2026-06-22 | Run read-only full code audit of every .sh file (root, .bin, dist mirrors) | non-fast-path | done | agent_reports/shell-scripts-audit-2026-06-22.md (findings by severity, static checks, sub-agents used); plan captured in session |
| 2026-06-13 | Run read-only Ralph loop bug audit across tests and repo | synthesis_report | done | agent_reports/00_ralph-loop-bug-audit.md |
| 2026-06-13 | Fix Ralph audit bugs and add operativity regressions | fast_path | done | local fixes and tests updated |
| 2026-06-13 | Run architect-level whole-code audit for crash/bug risks | fast_path | done | agent_reports/01_architect-code-audit.md |
| 2026-06-13 | Fix architect audit findings and run full toolkit including Linux validation | fast_path | partial | agent_reports/02_architect-fixes-validation.md; Linux VM blocked by Lima stale PID |
| 2026-06-15 | Run ponytail whole-system over-engineering audit | cleanup | done | agent_reports/03_ponytail-audit.md |
| 2026-06-15 | Fix spinosa new dead-end copying repo internals | fast_path | done | CLI manifest parsing hardened |
| 2026-06-15 | Remove local generated release and build bloat | fast_path | done | old dist releases and generated caches removed |
| 2026-06-15 | Remove unused Gum prompt and packaging integration | fast_path | done | Gum runtime and release bundling removed |
| 2026-06-15 | Make CLI selection launch directly after startup prompt | fast_path | done | launch-method prompt removed from default onboarding |
| 2026-06-15 | Restore arrow-key selector for interactive menus | fast_path | done | dashboard and prompt selectors use arrows on TTY |
| 2026-06-15 | Restore arrow-key multi-select with Space toggles | fast_path | done | file-type batch selector uses arrows on TTY |
| 2026-06-15 | Fix multi-select crash when deselecting last item | fast_path | done | empty selection arrays handled safely |
| 2026-06-15 | Verify Codex launch behavior for startup prompt flow | fast_path | done | codex CLI and app launch paths confirmed from .bin/spinosa and local codex help |
| 2026-06-15 | Verify OpenCode launch behavior for startup prompt flow | fast_path | done | opencode CLI and desktop/TUI launch paths confirmed from .bin/spinosa and local opencode help |
| 2026-06-15 | Verify Claude Code launch behavior for startup prompt flow | fast_path | done | claude CLI and desktop launch paths confirmed from .bin/spinosa and local claude help |
| 2026-06-15 | Confirm Claude Code launch behavior with web docs | fast_path | done | official Claude Code docs confirm terminal, desktop app, and browser surfaces |
| 2026-06-15 | Confirm Kilo Gemini Qwen launch behavior with web docs | fast_path | done | Gemini CLI and Qwen Code confirmed as terminal CLIs; Kilo not confirmed from official web results |
| 2026-06-15 | Add Gemini and Qwen launch support to startup prompt flow | fast_path | done | launcher, docs, and smoke tests updated for gemini and qwen |
| 2026-06-17 | Research CLI command tree — diagram type, placement, and entry-point role | evidence_answer | done | agent_reports/04_cli-command-tree-research.md |
| 2026-06-17 | Design 6 architecture diagrams for external storytelling (system, agents, routing, topology, evidence, startup) | synthesis_report | done | docs/diagrams.md |
| 2026-06-21 | Unify welcome, tour, and README into one canonical README | fast_path | done | README expanded; docs/WELCOME.md and docs/TOUR.md redirected |
| 2026-06-21 | Remove welcome and tour redirect pages | fast_path | done | docs/WELCOME.md and docs/TOUR.md deleted |
| 2026-06-21 | Add mandatory Phase B route audit and framework evolution loop | fast_path | done | orchestrator, agents, and fallback skills updated |
| 2026-06-21 | Audit goal-driven orchestrator rewrite for crossroads and validation risks | non-fast-path | done | agent_reports/05_orchestrator-rewrite-audit-goal.md; agent_reports/06_orchestrator-rewrite-audit.md |
| 2026-06-22 | Framework contract: concept-graph parser, startup validation checks, YAML schema, map template, orchestrator metrics contract | non-fast-path | done | concept-graph.py, check-startup.sh, startup.md, yaml_header_template.md, map_template.md, orchestrator-dispatch/SKILL.md updated |
| 2026-06-22 | Add granted_tools to all 9 agent definitions, fix evaluator/evolver fallback skills, add orchestrator tool contract, add validation | non-fast-path | done | 9 agent defs, 2 fallback skills, orchestrator SKILL, check-startup.sh updated |
| 2026-06-24 | Rewrite AGENTS.md: replace frozen chain with adaptive routing, add verifiable gates, archive accumulation, metrics-informed decisions | non-fast-path | done | AGENTS.md rewritten; agent_reports/archive/ created |
| 2026-06-24 | Installer PATH fallback text and macOS TCC-safe file discovery | fast_path | done | install.sh and .bin/spinosa updated |
| 2026-06-24 | Check MarkItDown file-type routing, including CSV | fast_path | done | confirmed current extension routing |
| 2026-06-24 | Fix CSV-only folder import MarkItDown early exit | fast_path | done | copy_source guard corrected |
| 2026-06-24 | Implement production reliability plan for imports and installer fallback | fast_path | done | structured fallback, preflight, vendor smoke checks, docs, tests |
| 2026-06-24 | Add MarkItDown-first intake, persistent global metadata, and finish spinosa add integration; run global bug checks | fast_path | done | MarkItDown/plugin routing, metadata-preserving uninstall, add dashboard/docs, validation passed |
| 2026-06-24 | Fix dev-mode spinosa new repair flow launching installer dashboard and still reporting converters unavailable | fast_path | done | upgrade no-launch, bash shim, legacy vendor checks, dev new CSV smoke passed |
| 2026-06-24 | Replace onboarding converter repair installer relaunch with direct vendor/package repair and no prompt | fast_path | done | direct vendor/package repair added; no repair prompt or installer relaunch; checks passed |
| 2026-06-24 | Run function-level edge-case audit across CLI and converter repair paths | fast_path | done | 247 shell + 43 Python functions indexed; noninteractive repair bug fixed; edge smokes passed |
| 2026-06-24 | Split multi-page converted PDFs/page-marked Markdown into per-page raw files with provenance headers | fast_path | done | RapidOCR/MarkItDown page split, page YAML provenance, docs/tests updated |
| 2026-06-24 | Audit vendor agent/skill protocols and fix queued ENTER prompt consumption | non-fast-path | done | vendor protocol audit written; queued ENTER prompt drain fixed; checks passed |
| 2026-06-24 | Plan Bun binary migration (Python shelled-out) | non-fast-path | done | agent_reports/g_20260624-bun-migration-plan.md |
| 2026-06-24 | Make vendor sub-agent and skill setup operational from canonical Spinosa agents | non-fast-path | done | generated skills and vendor mirrors operational; Codex fake agents removed; checks passed |
| 2026-06-24 | Fix terminal freeze/stacking, add pypdf page splitting, prepare 0.5.15 release | non-fast-path | done | flush_pending_input rewritten, cursor save/restore removed, pagination added, pypdf installed in vendor, page splitting working, red missing-tool warnings |
