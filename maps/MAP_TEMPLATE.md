---
type: map_template
role: map_structure_guide
purpose: [guide agents in writing the central navigation maps]
scope: maps/
connects_to:
  - HEADER_TEMPLATE.md
  - 00_system/instructions/STARTUP.md
created: 2026-06-03
updated: 2026-06-03
---

# Map Template

Every map file in `maps/` must include the navigation_map header and use Obsidian wikilinks for all internal references.

## Header Schema

```yaml
---
type: navigation_map
role: [descriptive role, e.g. folder_map, concept_map, entity_map]
purpose: [guide future LLM retrieval into the raw corpus]
scope: raw/
connects_to:
  - raw/
  - dictionary.md
  - maps/00_map_overview.md
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

## Wikilink Rules

- Every raw copy or pointer record reference must use an Obsidian wikilink: `[[raw/interviews/interview_01__txt|interview_01.txt]]`
- Every map-to-map reference must use a wikilink: `[[maps/folder_map]]`
- No Root Vault paths in map entries. Use `raw/` relative paths only.

## Entry Format (Tabular)

Each map entry for a raw copy or pointer record uses a wikilink heading plus a compact table:

```markdown
## [[raw/Ex6/CLARA_PAGE26.md|CLARA_PAGE26.md]]
| Type | Language | People | Topics | Keywords | Caveats |
|---|---|---|---|---|---|
| worksheet | en | Clara | prompt design, AI evaluation | llm, prompt, task | date_inferred |
```

For large or dense files (transcripts, long reports), add a 2-3 sentence retrieval summary below the table:

```markdown
## [[raw/Ex14/COHORT1_2025_02_03_EX14.md|COHORT1_EX14Transcript]]
| Type | Language | People | Topics | Keywords | Caveats |
|---|---|---|---|---|---|
| transcript | en | 10 speakers | imitation game, prompting | llm, chatgpt, prompt | diarization_labels |

Session transcript from the imitation game exercise. Contains extended discussion about prompt engineering strategies and LLM evaluation criteria. Useful for tracing how students' understanding of AI capabilities evolved across the session.
```

## Table Columns

| Column | Description |
|---|---|
| Type | `source_type` value (worksheet, transcript, photo, audio, etc.) |
| Language | ISO 639-1 code |
| People | Canonical names from dictionary (comma-separated) |
| Topics | Key topics (comma-separated) |
| Keywords | Retrieval keywords (comma-separated) |
| Caveats | `metadata_uncertainty` and `machine_artifacts` values (comma-separated) |
