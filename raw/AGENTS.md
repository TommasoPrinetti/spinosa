---
type: directory_guidance
scope: raw/
description:
  - Rules for raw source copies created during onboarding or source intake.
  - Agents read this before modifying headers or validating corpus files.
connects_to:
  - AGENTS.md
  - header_template.md
  - maps/AGENTS.md
created: 2026-06-03
updated: 2026-06-03
---

# raw — Corpus Copies

`raw/` is the active working corpus after onboarding. On the framework branch it stays empty except for `.gitkeep` and this guidance file.

## Rules

- Do not edit raw source bodies during normal research operations.
- Header generation and repair may edit YAML frontmatter only.
- Onboarding copies text-like files, native-readable files, and PDFs here.
- Root Vault `AGENTS.md` files are control instructions, not evidence; they must never be imported, mapped, headered, or cited.
- Images, video, and audio stay Root Vault-only unless a later processing pass creates text artifacts.

## Validation

- Raw copies use `type: raw_copy` and the schema in `header_template.md`.
- `source:` uses a repo-relative `raw/...` path, not an absolute Root Vault path.
- Root Vault paths belong in `context.md` for re-onboarding only.
