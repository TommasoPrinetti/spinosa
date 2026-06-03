---
name: source-intake
description: Add new source files to the workspace and log them
---

## Purpose

Register new source files in the workspace: copy text/native files and PDFs to `raw/`, skip images/video/audio and AGENTS.md control files, add YAML headers, log intake, and update the workspace index.

## Prerequisites

- workspace is initialized (`setup_status: workspace_started`)
- Source files are available (Root Vault path or external URL with researcher authorization)
- `system/dictionary.md` exists for term consistency

## Steps

1. Identify source files to add. Confirm they are not already in `raw/`.
2. Copy text-like files, native-readable files, and PDFs from Root Vault into `raw/`.
3. Skip `AGENTS.md` control files. They are repository instructions, not source evidence.
4. Do not create `.pointer.md` records for images, audio, or video. Leave those media files in the Root Vault and record counts and processing gaps in `logs/user_requests.md`, `workspace_index.md`, or the relevant report.
5. Generate YAML headers for new raw copies using `system/header_template.md`:
   - Use canonical terms from `system/dictionary.md`.
   - Include `source:`, `generated_by:`, `generated_at:`, `processing_status:`.
6. Log intake or external-access summaries in `logs/user_requests.md` when traceability is needed:
   - Date, batch ID or request summary, route (`source_intake` or `external_access`), status, output path or retained result.
7. Update `workspace_index.md` with new file references.
8. Optionally rebuild affected navigation maps if new files change retrieval coverage.

## Rules

- Preserve original file content — do not modify source copies.
- Log every intake with a traceable batch ID.
- External sources require explicit researcher authorization before fetching.
- Headers must use canonical dictionary terms.
- Never import, header, map, or cite Root Vault `AGENTS.md` files.
- Images, audio, and video stay Root Vault-only until a later processing pass creates text artifacts.

## See also

- `report-writing` — for using intake evidence in reports
- `system/instructions/startup.md` — workspace initialization protocol
