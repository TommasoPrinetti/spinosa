---
type: directory_guidance
scope: maps/
description: Rules for content-grounded navigation maps generated from the raw corpus.,Read this before creating, repairing, or validating map files.
connects_to:
  - AGENTS.md
created: 2026-06-03
updated: 2026-06-04
---

# maps — Navigation Layer

`maps/` holds content-grounded navigation fragments extracted from raw files. Maps are natural-language summaries organized by the corpus's natural structure. Maps mention filenames alongside concepts and very brief extracts to make things back-searchable. Maps are the first thing read by agents when searching.

## What Maps Contain

- **Structural overview**: what the corpus contains, how it's organized, what each group is about
- **Per-group maps**: what files in each group contain, with key passages and line references
- **Cross-cutting themes**: concepts that span groups, with trajectory and evidence

## Rules

- Maps are **content-grounded**: produced by reading file contents, not filenames.
- Natural language prose, not data tables.
- Every key passage includes file path and line references.
- Organized by the corpus's natural structure — the mapper discovers this during startup.
- Maps evolve: startup does initial pass; maps deepen as more files are read.
- Do not map `AGENTS.md` files; they are control instructions, not source evidence.
- Use `raw/` relative paths only.
- **Wikilinks are mandatory** for all references to raw files and other maps in the map body. Obsidian only creates graph edges from wikilinks in the body, not from YAML frontmatter.
- **Wikilink convention:** `[[raw/path/filename]]` for raw files (no `.md` extension), `[[maps/group/map_name]]` for group maps, `[[corpus_overview]]` for the hub, `[[maps/themes/theme_name]]` for theme maps. Line references go after the wikilink: `[[raw/path/file]]` L12-L15.
- **Hub map rules:** `corpus_overview.md` (Level 0) is the central hub. It MUST contain wikilinks to every group map and theme map. Every group map MUST link back to `[[corpus_overview]]`. Theme maps MUST link to relevant group maps. Group maps SHOULD link to related group maps.
- Keep key passages short and effective to act as anchors for different concepts.

## Who Writes Maps

- **Startup**: `spinosa-mapper` writes all maps.
- **Normal operations**: `spinosa-mapper` (deep maintenance), `spinosa-serendippo`, `spinosa-searcher`, `spinosa-analyst` can write maps when the orchestrator grants `map_write` route constraint.
- **Verification**: map content is self-correcting through agent use, not through dedicated verifier gate.
- **Force update:** `spinosa-mapper` can be executed to enlarge, enrich and update the maps

## Validation

- Each map entry links to an existing raw copy.
- Structural overview exists at root of `maps/`.
- At least one group map subdirectory exists.
