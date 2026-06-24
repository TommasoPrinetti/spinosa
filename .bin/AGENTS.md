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

## Operations

- **Read-only for agents.** Scripts are version-controlled, tested, and maintained by the human developer.
- If a script needs updating, describe the required change to the user and let them make it.
- Script conventions: Bash shell, zero external dependencies.

## Scripts

| File | Purpose |
|---|---|
| `spinosa` | CLI entry point; creates workspaces, runs upgrade and uninstall |
| `check-startup.sh` | Legacy developer validation helper |
| `sync-agents.sh` | Legacy agent sync script |
| `lib/metrics.sh` | Shared Unicode metric helpers for reports and session ledgers |


