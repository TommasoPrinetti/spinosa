---
name: zone-cleanup
description: Evaluate staleness and propose archival of old Zone files
---

## Purpose

Audit the LLM Zone for stale, broken, or orphaned files. Propose moves to `.trash/`. Never execute moves without user confirmation.

## Prerequisites

- Zone is initialized (`setup_status: zone_started`)
- `CONFIGURATION.md` has `stale_after_days` threshold (default: 90 for reports, 30 for trash)

## Steps

1. Read `CONFIGURATION.md` for staleness thresholds.
2. Check raw copy validity:
   - For each file in `raw/`, read `source:` from YAML header.
   - If Root Vault path no longer exists, flag as `stale_source`.
   - If raw copy is empty or unreadable, flag as `corrupt_copy`.
3. Check wikilinks:
   - Grep all files for `[[` wikilinks.
   - For each link, check if target file exists.
   - Flag as `broken_link` if missing.
4. Check concept maps:
   - Each map should reference at least one existing raw copy.
   - Flag orphans with no backing files.
5. Check dictionary entries:
   - Each entry should reference at least one existing raw copy.
   - Flag stale entries if all referenced files are gone.
6. Check for orphaned files with no incoming wikilinks.
7. Evaluate staleness by age:
   - Compare `updated:` date in YAML frontmatter against current date.
   - Mark files older than `stale_after_days`.
8. Write Cleaner Report in `05_agent_reports/` with:
   - Files checked, issues found, proposed moves with reasons.
9. **Wait for user confirmation** before any actual moves.

## Rules

- User confirmation is mandatory before any file move — this is a hard gate.
- Never delete files — only move to `.trash/`.
- Never modify file content — only move or flag.
- Never reorganize or rename files outside of archival moves.
- `.gitkeep` must always remain in `.trash/`.
- Evaluate by file age only — no structured research needs or tendency detection.

## See also

- `source-intake` — for adding new files to the Zone
- `orchestrator-dispatch` — Cleaner dispatch requires user-confirmation gate
