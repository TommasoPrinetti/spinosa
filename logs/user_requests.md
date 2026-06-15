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
