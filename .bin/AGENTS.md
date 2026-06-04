---
type: directory_guidance
scope: .bin/
description:
  - Rules for setup and validation shell scripts.
  - Read this before inspecting or changing script behavior.
connects_to:
  - AGENTS.md
  - system/startup.md
created: 2026-06-03
updated: 2026-06-04
---

# .bin — Shell Scripts

Mechanical scripts for setup and validation. Human-maintained — agents should not modify them.

## Sub-agent ownership

- **None.** No sub-agent operates here.
- The orchestrator reads `onboard.sh` output during startup but never edits scripts.

## Operations

- **Read-only for agents.** Scripts are version-controlled, tested, and maintained by the human developer.
- If a script needs updating, describe the required change to the user and let them make it.
- Script conventions: POSIX-compatible shell, zero external dependencies.

## Scripts

| File | Purpose |
|---|---|
| `onboard.sh` | Collects project name, source location, scans corpus, copies accepted text/native/PDF files to `raw/`, generates setup draft |
| `check-startup.sh` | Developer validation helper: checks raw copy headers, map coverage, dictionary completeness after startup |

## See also

- [[startup]] — protocol that reads onboard.sh output
- [[AGENTS]] — orchestrator playbook
