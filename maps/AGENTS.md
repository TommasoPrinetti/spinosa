---
type: directory_guidance
scope: maps/
description:
  - Rules for navigation maps generated from the raw corpus.
  - Agents read this before creating, repairing, or validating map files.
connects_to:
  - AGENTS.md
  - raw/AGENTS.md
created: 2026-06-03
updated: 2026-06-04
---

# maps — Navigation Layer

`maps/` holds retrieval-oriented navigation maps that point agents toward the right raw files. Maps are concept-indexed — they organize files by meaning, not just by filename metadata.

## Map Types

| Map | Role | Content |
|---|---|---|
| `concept_index.md` | Master concept index | Concepts with file references, definitions, exercise/cohort coverage |
| `thematic_tags.md` | Thematic navigation | Files organized by thematic tags (2-5 tags per file) |
| `cross_exercise_synthesis.md` | Longitudinal analysis | Themes spanning 3+ exercises, showing evolution across curriculum |
| `entity_index.md` | Entity navigation | People, organizations, places with file references |
| `corpus_structure.md` | Structural navigation | Files organized by exercise and cohort |

## Rules

- Maps are concept-indexed: organize by meaning, not just filename metadata.
- Each concept/tag/theme gets a section with definition and file references.
- Body text uses Obsidian wikilinks for internal references.
- YAML `connects_to:` fields use bare repo-relative paths.
- Do not include Root Vault absolute paths in map headers or body text.
- Do not map Root Vault `AGENTS.md` files; they are control instructions, not source evidence.
- Files have 2-5 thematic tags from content analysis, not exercise names.
- Cross-exercise synthesis identifies themes that appear in 3+ exercises.

## Validation

- Map files use `type: navigation_map`.
- Each source entry links to an existing raw copy.
- Concepts have definitions and file references.
- Thematic tags are content-derived, not filename-derived.
- Cross-exercise themes span 3+ exercises.
