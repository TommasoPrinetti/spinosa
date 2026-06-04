---
type: directory_guidance
scope: maps/
description:
  - Rules for content-grounded navigation maps generated from the raw corpus.
  - Read this before creating, repairing, or validating map files.
connects_to:
  - AGENTS.md
created: 2026-06-03
updated: 2026-06-04
---

# maps — Navigation Layer

`maps/` holds content-grounded navigation fragments extracted from raw files. Maps are natural-language summaries organized by the corpus's natural structure.

## What Maps Contain

- **Structural overview**: what the corpus contains, how it's organized, what each group is about
- **Per-group maps**: what files in each group contain, with key passages and line references
- **Cross-cutting themes**: concepts that span groups, with trajectory and evidence

## Rules

- Maps are content-grounded: produced by reading file contents, not filenames.
- Natural language prose, not data tables.
- Every key passage includes file path and line references.
- Organized by the corpus's natural structure — the mapper discovers this during startup.
- Maps evolve: startup does initial pass; maps deepen as more files are read.
- Do not map `AGENTS.md` files; they are control instructions, not source evidence.
- Use `raw/` relative paths only.
- Use Obsidian wikilinks for internal references.

## Who Writes Maps

- **Startup**: `pilosa-mapper` writes all maps.
- **Normal operations**: `pilosa-mapper` (deep maintenance), `pilosa-serendippo`, `pilosa-searcher`, `pilosa-analyst` can write maps when the orchestrator grants `map_write` route constraint.
- **Verification**: map content is self-correcting through agent use, not through dedicated verifier gate.

## Validation

- Each map entry links to an existing raw copy.
- Key passages include line references.
- Structural overview exists at root of `maps/`.
- At least one group map subdirectory exists.
