---
type: map_template
role: map_structure_guide
purpose: [guide agents in writing the central navigation maps]
description:
  - Template for retrieval-oriented navigation maps under maps/.
  - Agents use it to keep map headers, wikilinks, and tabular entries consistent.
scope: maps/
connects_to:
  - header_template.md
  - system/instructions/startup.md
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
  - maps/map_overview.md
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

- Every raw copy reference must use an Obsidian wikilink: `[[raw/interviews/interview_01.md|interview_01.md]]`
- Every map-to-map reference must use a wikilink: `[[maps/folder_map]]`
- No Root Vault paths in map entries. Use `raw/` relative paths only.

## Entry Format (Tabular)

Each map entry for a raw copy uses a wikilink heading plus a compact table:

```markdown
## [[raw/field_notes/session_01_notes.md|session_01_notes.md]]
| Type | Language | People | Topics | Keywords | Caveats |
|---|---|---|---|---|---|
| field_notes | en | Researcher A | observation, interview setup | site visit, method, consent | date_inferred |
```

For large or dense files (transcripts, long reports), add a 2-3 sentence retrieval summary below the table:

```markdown
## [[raw/interviews/session_01_transcript.md|session_01_transcript.md]]
| Type | Language | People | Topics | Keywords | Caveats |
|---|---|---|---|---|---|
| transcript | en | Participant A, Participant B | interview, fieldwork | conversation, evidence, theme | diarization_labels |

Session transcript from a fieldwork interview. Contains extended discussion of the research topic and participant observations. Useful for tracing claims back to source evidence and identifying themes for follow-up maps.
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
