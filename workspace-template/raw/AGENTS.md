---
type: directory_guidance
scope: raw/
description:
  - Rules for raw source copies created during onboarding or source intake.
  - Read this before modifying headers or validating corpus files.
connects_to:
  - AGENTS.md
  - system/yaml_header_template.md
  - maps/AGENTS.md
created: 2026-06-03
updated: 2026-06-04
---

# raw — Corpus Copies

`raw/` is the active working corpus after onboarding. On the framework branch it stays empty except for `.gitkeep` and this guidance file.

## Rules

- Do not edit raw source bodies during normal research operations.
- Header generation and repair may edit YAML frontmatter only.
- Onboarding copies text-like files, native-readable files, and PDFs here.
- `AGENTS.md` files are control instructions, not evidence; they must never be imported, mapped, headered, or cited.
- Skipped media are recorded in `.spinosa/onboarding-summary.md` unless a later processing pass creates text artifacts in `raw/`.
- **Never commit personal data to this repository.** Processing logs, OCR output, backup files (`.bak`, `.jsonl`, `*ocr-processed*`) and any file containing emails, credentials, or local paths must not be tracked. These patterns are in `.gitignore` at the repo root.

## Validation

- Raw copies use `type: raw_copy` and the schema in `yaml_header_template.md`.
- `source:` uses a repo-relative `raw/...` path.
- Corpus work should use `raw/` paths and onboarding-summary counts, not import-origin paths.
