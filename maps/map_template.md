---
type: map_template
role: map_structure_guide
purpose: [guide agents in writing content-grounded navigation maps]
description:
  - Template for navigation maps under maps/.
  - Defines format levels without prescribing corpus structure.
scope: maps/
connects_to:
  - system/startup.md
created: 2026-06-03
updated: 2026-06-04
---

# Map Template

Every map file in `maps/` must include the navigation_map header and use Obsidian wikilinks for all internal references.

## YAML Header Schema

```yaml
---
type: navigation_map
role: [descriptive role, e.g. corpus_overview, group_map, theme_map]
purpose: [guide future LLM retrieval into the raw corpus]
scope: raw/
connects_to:
  - raw/
  - dictionary.md
map_quality: machine_generated | checked | human_reviewed
description_depth: retrieval_oriented
wikilink_policy: obsidian_wikilinks_required
generated_by: startup_agent
generated_at: YYYY-MM-DD
processing_status: machine_generated | checked | human_reviewed
created: YYYY-MM-DD
updated: YYYY-MM-DD
---
```

## Level 0: Structural Overview

One file at the root of maps/. This is the **central hub** of the Obsidian graph. It MUST use wikilinks to every group map, theme map, and key raw file pointers.

Format:

- H2 per natural group
- Each H2: 2-4 sentence description of what the group contains
- File count and key file pointers as wikilinks: `[[raw/path/file1]]`, `[[raw/path/file2]]`
- Wikilinks to group maps: `[[maps/group_name/group_map]]`
- Wikilinks to theme maps: `[[maps/themes/theme_name]]`
- The mapper decides what the groups are based on what it finds

## Level 1: Group Map

One file per natural group, in a subdirectory named for the organizing principle.

Format:

- H2 "What this group is about" — synthesized understanding from reading files
- H2 "Recurring concepts" — patterns across files within the group
- Each concept: 1-2 sentence description + examples with wikilinks and line references: `[[raw/path/file]]` L12-L15
- Wikilink back to hub: `[[corpus_overview]]`
- Wikilinks to related group maps when cross-references exist

## Level 2: Theme Map

One file per cross-cutting concept thread, in a subdirectory named for the thematic principle.

Format:

- H2 with theme name + 1-2 sentence definition
- H3 per group where the theme appears
- Each H3: how the theme manifests in that group + key passages with wikilinks: `[[raw/path/file]]` L12-L15
- Wikilinks to relevant group maps: `[[maps/group_name/group_map]]`
- H2 "Trajectory" — how the theme evolves across groups

## Key Principle

The template defines what maps should contain (depth, format, content quality) without prescribing how they're organized. The mapper figures out the organization from the corpus.
