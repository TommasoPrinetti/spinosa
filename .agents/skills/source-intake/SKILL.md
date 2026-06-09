---
name: pilosa-source-intake
type: skill
scope: source_registration
description: Add new source files to the workspace and log them
created: 2026-05-26
updated: 2026-06-09
---

## Purpose

Register new source files in the workspace. Supported formats are routed to the appropriate conversion engine: Office documents (docx, pptx, xlsx, xls), HTML, EPUB, ZIP, and Outlook MSG via MarkItDown; scanned PDFs and images via RapidOCR OCR. Text-based PDFs are automatically classified and extracted via MarkItDown. Renamer handles text formats (txt, rtf, textile, wiki, etc.). Native files (md, csv, json, yaml, etc.) are copied unchanged. Videos, audio, and AGENTS.md control files are skipped.

## Prerequisites

- workspace is initialized (`setup_status: workspace_started`)
- Source files are available (source location or external URL with researcher authorization)
- `system/dictionary.md` exists for term consistency

## Steps

1. Identify source files to add. Confirm they are not already in `raw/`.
2. Copy convertible source files into `raw/`:

   | Engine | Formats | Action |
   |--------|---------|--------|
   | Renamer | txt, rtf, textile, wiki, mediawiki, dokuwiki, pmwiki, outliner, workflowy, dynalist | Rename to .md (no conversion) |
   | MarkItDown | docx, pptx, xlsx, xls, epub, html, msg, zip, text-based PDF | Convert to .md |
   | RapidOCR | scanned PDF, jpg, jpeg, png, gif, webp, heic, heif, tif, tiff, bmp, svg | OCR -> .md |
   | Native | md, csv, json, yaml, yml, toml, xml, log, org, adoc, rst, tex, bib, etc. | Copy unchanged |

   PDFs are automatically classified: text-based PDFs route through MarkItDown, image-based PDFs through RapidOCR.

3. Skip `AGENTS.md` control files. They are repository instructions, not source evidence.
4. Do not create `.pointer.md` records for videos or audio. Leave those media files at the source location and include counts and processing gaps in the proposed log summary, `workspace_index.md`, or the relevant report.
5. Generate YAML headers for new raw copies using `system/header_template.md`:
   - Use canonical terms from `system/dictionary.md`.
   - Include `source:`, `original_format:`, `converter_engine:`, `generated_by:`, `generated_at:`, `processing_status:`.
6. Return a proposed intake or external-access log summary for the orchestrator when traceability is needed:
   - Date, batch ID or request summary, route (`source_intake` or `external_access`), status, output path or retained result.
7. Update `workspace_index.md` with new file references.
8. Optionally rebuild affected navigation maps if new files change retrieval coverage.

## Rules

- Preserve original file content — do not modify source copies.
- Include a traceable batch ID in every intake summary.
- Do not edit `logs/user_requests.md`; the orchestrator writes logs.
- External sources require explicit researcher authorization before fetching.
- Headers must use canonical dictionary terms.
- Never import, header, map, or cite `AGENTS.md` control files.
- Images are processed via RapidOCR. Videos and audio stay at the source location until a later processing pass creates text artifacts.

## See also

- `pilosa-report-writing` — for using intake evidence in reports
- `system/startup.md` — workspace initialization protocol
