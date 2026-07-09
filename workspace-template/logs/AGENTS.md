---
type: directory_guidance
scope: .logs/
description:
  - Hidden operational traces: onboarding import log, conversion NDJSON, and pre-memory-migration archives.
  - Not user research content — CLI and import pipeline write here.
  - Historical session records (pre-memory-migration) are archived in .spinosa/archive/.
connects_to:
  - AGENTS.md
  - .spinosa/archive/
  - .spinosa/memory/
created: 2026-06-29
updated: 2026-07-01
---

# .logs — Operational Traces

Hidden directory for import and conversion logs. Researchers normally do not open this folder.

## Active files (CLI-written)

- `onboarding.log` — per-file import trace during `spinosa new` / `spinosa add`
- `markitdown-processed.ndjson` — MarkItDown conversion log
- `ocr-processed.ndjson` — OCR conversion log

## Historical (migrated on `spinosa update`)

- `session_metrics.tsv`, `user_requests.md` — pre-memory-migration files; update copies them here from legacy `logs/` and archives a dated copy under `.spinosa/archive/` when missing.
- `orchestrator-notes.md` lives in `.spinosa/memory/` — not here.