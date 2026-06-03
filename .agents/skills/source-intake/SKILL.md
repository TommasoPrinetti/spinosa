---
name: source-intake
description: Add new source files to the Zone and log them
---

## Purpose

Register new source files in the Zone: copy text files to `raw/`, create pointer records for binary files, add YAML headers, log intake, and update the zone index.

## Prerequisites

- Zone is initialized (`setup_status: zone_started`)
- Source files are available (Root Vault path or external URL with researcher authorization)
- `01_llm_zone/00_dictionary.md` exists for term consistency

## Steps

1. Identify source files to add. Confirm they are not already in `raw/`.
2. Copy text-like files unchanged from Root Vault into `01_llm_zone/raw/`.
3. For binary files (PDFs, images, audio, video), create `.pointer.md` records in `raw/` with:
   - Original path, media type, extension, size
   - Processing status: pending
   - OCR/ASR/transcription status: not started
4. Generate YAML headers for new raw copies using `HEADER_TEMPLATE.md`:
   - Use canonical terms from `00_dictionary.md`.
   - Include `source:`, `generated_by:`, `generated_at:`, `processing_status:`.
5. Log the intake in `03_logs/source_intake_log.md`:
   - Date, batch ID, source type (root_vault / external), location, origin, intake status, notes.
6. If any sources are external, also log in `03_logs/external_queries.md`.
7. Update `01_llm_zone/00_zone_index.md` with new file references.
8. Optionally rebuild affected navigation maps if new files change retrieval coverage.

## Rules

- Preserve original file content — do not modify source copies.
- Log every intake with a traceable batch ID.
- External sources require explicit researcher authorization before fetching.
- Headers must use canonical dictionary terms.
- Binary files are pointer-only until a processing pass creates text artifacts.

## See also

- `report-writing` — for using intake evidence in reports
- `00_system/instructions/STARTUP.md` — Zone initialization protocol
