---
type: directory_guidance
scope: maps/
description:
  - Rules for navigation maps generated from the raw corpus.
  - Agents read this before creating, repairing, or validating map files.
connects_to:
  - AGENTS.md
  - maps/map_template.md
  - raw/AGENTS.md
created: 2026-06-03
updated: 2026-06-03
---

# maps — Navigation Layer

`maps/` holds retrieval-oriented navigation maps that point agents toward the right raw files.

## Rules

- Use the tabular map format from [[maps/map_template]].
- Body text uses Obsidian wikilinks for internal references.
- YAML `connects_to:` fields use bare repo-relative paths.
- Do not include Root Vault absolute paths in map headers or body text.
- Do not map Root Vault `AGENTS.md` files; they are control instructions, not source evidence.

## Validation

- Map files use `type: navigation_map`.
- Each source entry links to an existing raw copy.
- Create as many maps as the corpus needs; there is no fixed required set.
