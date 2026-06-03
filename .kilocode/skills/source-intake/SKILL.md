---
name: source-intake
description: Add new source files to the Zone and log them
---

## Purpose

Register new source files in the Zone: copy text/native files and PDFs to `raw/`, skip images/video/audio, add YAML headers, log intake, and update the zone index.

## Prerequisites

- Zone is initialized (`setup_status: zone_started`)
- Source files are available (Root Vault path or external URL with researcher authorization)
- `dictionary.md` exists for term consistency

## Steps

1. Identify source files to add. Confirm they are not already in `raw/`.
2. Copy text-like files, native-readable files, and PDFs from Root Vault into `raw/`.
3. Do not create `.pointer.md` records for images, audio, or video. Leave those media files in the Root Vault and record counts / processing gaps in the intake log and `zone_index.md`.
4. Generate YAML headers for new raw copies using `HEADER_TEMPLATE.md`:
   - Use canonical terms from `dictionary.md`.
   - Include `source:`, `generated_by:`, `generated_at:`, `processing_status:`.
5. Log the intake in `03_logs/source_intake_log.md`:
   - Date, batch ID, source type (root_vault / external), location, origin, intake status, notes.
6. If any sources are external, also log in `03_logs/external_queries.md`.
7. Update `zone_index.md` with new file references.
8. Optionally rebuild affected navigation maps if new files change retrieval coverage.

## Rules

- Preserve original file content — do not modify source copies.
- Log every intake with a traceable batch ID.
- External sources require explicit researcher authorization before fetching.
- Headers must use canonical dictionary terms.
- Images, audio, and video stay Root Vault-only until a later processing pass creates text artifacts.

## See also

- `report-writing` — for using intake evidence in reports
- `00_system/instructions/STARTUP.md` — Zone initialization protocol
