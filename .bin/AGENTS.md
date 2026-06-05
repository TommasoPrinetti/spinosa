---
type: directory_guidance
scope: .bin/
description:
  - Rules for release and validation shell scripts.
  - Read this before inspecting or changing script behavior.
connects_to:
  - AGENTS.md
  - system/startup.md
created: 2026-06-03
updated: 2026-06-04
---

# .bin — CLI And Shell Scripts

Mechanical scripts for CLI setup, release packaging, and validation. Human-maintained — agents should not modify them.

## Sub-agent ownership

- **None.** No sub-agent operates here.
- The orchestrator reads setup output from `pilosa new` during startup but never edits scripts.

## Operations

- **Read-only for agents.** Scripts are version-controlled, tested, and maintained by the human developer.
- If a script needs updating, describe the required change to the user and let them make it.
- Script conventions: Bash shell, zero external dependencies.

## Scripts

| File | Purpose |
|---|---|
| `pilosa` | CLI entry point; creates workspaces, runs integrated onboarding, validates workspaces, syncs agents |
| `check-startup.sh` | Legacy developer validation helper (superseded by `pilosa check`) |
| `sync-agents.sh` | Legacy agent sync script (superseded by `pilosa sync`) |
| `lib/metrics.sh` | Shared Unicode metric helpers for reports and session ledgers |

## See also

- [[startup]] — protocol that reads `pilosa new` setup output
- [[AGENTS]] — orchestrator playbook
