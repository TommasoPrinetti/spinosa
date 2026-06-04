---
name: workspace-cleanup
type: skill
scope: workspace_hygiene
description: Evaluate staleness and propose archival of old workspace files
created: 2026-05-26
updated: 2026-06-04
---

## Purpose

Audit the workspace for stale, broken, or orphaned files. Propose moves to `.trash/`. Never execute moves without user confirmation.

## Prerequisites

- workspace is initialized (`setup_status: workspace_started`)
- `system/configuration.md` has `stale_after_days` threshold (default: 30 days; reports may use a longer threshold if configured)

## Steps

1. Read `system/configuration.md` for staleness thresholds.
2. Check raw copy validity:
   - For each file in `raw/`, read `source:` from YAML header.
   - If source location no longer exists, flag as `stale_source`.
   - If raw copy is empty or unreadable, flag as `corrupt_copy`.
3. Check wikilinks:
   - Grep all files for `[[` wikilinks.
   - For each link, check if target file exists.
   - Flag as `broken_link` if missing.
4. Check maps:
   - Each map should reference at least one existing raw copy.
   - Flag orphans with no backing files.
5. Check dictionary entries:
   - Each entry should reference at least one existing raw copy.
   - Flag stale entries if all referenced files are gone.
6. Check for orphaned files with no incoming wikilinks.
7. Evaluate staleness by age:
   - Compare `updated:` date in YAML frontmatter against current date.
   - Mark files older than `stale_after_days`.
8. Write Janitor Report in `agent_reports/` with:
   - Files checked, issues found, proposed moves with reasons.
9. Return a proposed log summary to the orchestrator when traceability is needed.
10. **Wait for user confirmation** before any actual moves.

## Rules

- User confirmation is mandatory before any file move — this is a hard gate.
- Never delete files — only move to `.trash/`.
- Never modify file content — only move or flag.
- Never reorganize or rename files outside of archival moves.
- `.gitkeep` must always remain in `.trash/`.
- Evaluate by file age only — no structured research needs or tendency detection.
- Do not edit `logs/user_requests.md`; the orchestrator writes logs.

## See also

- `source-intake` — for adding new files to the workspace
- `orchestrator-dispatch` — Janitor dispatch requires user-confirmation gate
