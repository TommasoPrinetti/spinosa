---
type: directory_guidance
scope: .trash/
description:
  - Rules for retired and archived files.
  - Janitor moves files here after user confirmation; never deleted, only relocated.
connects_to:
  - AGENTS.md
  - agent_reports/AGENTS.md
created: 2026-06-03
updated: 2026-06-05
---
# .trash/ — Retired Files

Files moved here when they are no longer active. They remain in git history — never deleted, only relocated to this directory.

## Sub-agent ownership

- **Janitor** proposes and executes moves to `.trash/`, always with explicit user confirmation.
- **No other agent** moves files to or from `.trash/` unless the user explicitly requests repository purging or archival.

## Operations

- **Read-only** for all non-Janitor agents unless the user explicitly requests repository purging or archival.
- Janitor moves require **explicit user confirmation** before any file is moved. This is a hard gate — never assume consent.
- `.gitkeep` must always remain. The directory must exist even when empty.
- Existing contents (`03_concept_indexes/`, `OBSIDIAN_CONSTRAINTS.md`, `STARTUP_REPORT_TEMPLATE.md`) are retired framework artifacts. Janitor may propose their removal with user approval.

## Staleness evaluation

- By file age only: compare `updated:` date in YAML frontmatter against current date.
- No structured research needs or tendency detection.

## See also

- [[AGENTS]] — orchestrator playbook (Janitor dispatch, user-confirmation gate)
- [[agent_reports/AGENTS]] — reports that may be archived here
