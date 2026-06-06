---
name: mapper-fallback
type: skill
scope: startup_indexing
description: Fallback for pilosa-mapper — reads raw files in batch and extracts content-grounded fragments
created: 2026-06-05
updated: 2026-06-05
---

## Purpose

Fallback instruction set for `pilosa-mapper` when native sub-agent dispatch is unavailable. Runs in two phases: extraction batches first, then navigation map creation or enrichment from those batches.

## Prerequisites

- Workspace is initialized (`setup_status: workspace_started`).
- `system/dictionary.md`, `raw/`, and `maps/` are available.
- The orchestrator has provided a file list (10-15 paths) and route constraints.

## Steps

### Phase 1 — Extraction batches (`map_extract`)

1. Read `system/dictionary.md` to learn canonical terms, names, and concepts.
2. Read each file in the provided list completely.
3. For each file, extract: one-paragraph content-grounded summary, 2-5 key passages with line references, 2-5 concept signals using dictionary canonical terms, and connections to other files.
4. Write extraction packets to `agent_reports/extraction_batch.md`.
5. Return the extraction file path and summary to the orchestrator.

### Phase 2 — Map writing and enrichment (`map_write`)

1. When instructed, read all extraction batches.
2. Identify natural groups in the corpus.
3. Write or update the structural overview at `maps/corpus_overview.md`.
4. Create new group maps when missing and enrich existing group maps when they already exist.
5. Identify cross-cutting themes and write or enrich theme maps.
6. Verify every file appears in at least one group map.
7. Append one compact metrics row to `logs/session_metrics.tsv`.

## Extraction Per File

For every file, extract:

1. **One-paragraph summary** (3-5 sentences): what the file is about, what arguments it makes, what evidence it provides.
2. **Key passages** (2-5): short quotes or close paraphrases with file path and line references.
3. **Concept signals** (2-5): which recurring concepts appear in this file. Use dictionary canonical terms.
4. **Connections**: which other files relate to the same concepts.

## Map Writing

When instructed:

1. Read all extraction batches.
2. Identify natural groups in the corpus.
3. Write or update the structural overview at `maps/corpus_overview.md`.
4. Create subdirectories and write group maps.
5. Identify cross-cutting themes and write or enrich theme maps.
6. Verify every file appears in at least one group map.

## Rules

- Extraction batches are process files written to `agent_reports/`. Maps are durable navigation artifacts written to `maps/`.
- Read each file completely before extracting.
- Use dictionary canonical forms for all concept signals.
- If a file is unreadable, note it and continue.
- Always write to files. Do not return all packets inline.
- If processing multiple batches, use distinct filenames.
- During `map_write`, create new maps when missing and enrich existing maps when they already exist.
- Every key passage must include file path and line references.
- Do not assume exercises, cohorts, or any specific corpus structure — discover it from the files.
- During extraction batches, do not force cross-file interpretation; record only grounded connections.
- Append one metrics row with operation `map_extract` or `map_write`, directories seen, maps read, raw files read, reports written, and output path. Use `.bin/lib/metrics.sh` when available; never log raw command output, long grep terms, source excerpts, secrets, or credentials.

## See also

- `orchestrator-dispatch` — primary route selection and native sub-agent dispatch
- `source-intake` — for adding new files to the workspace
