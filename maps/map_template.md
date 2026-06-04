---
type: map_template
role: map_structure_guide
purpose: [guide agents in writing the central navigation maps]
description:
  - Template for retrieval-oriented navigation maps under maps/.
  - Agents use it to keep map headers, wikilinks, and tabular entries consistent.
scope: maps/
connects_to:
  - system/startup.md
created: 2026-06-03
updated: 2026-06-04
---

# Map Template

Every map file in `maps/` must include the navigation_map header and use Obsidian wikilinks for all internal references.

## Header Schema

```yaml
---
type: navigation_map
role: [descriptive role, e.g. concept_index, thematic_tags, cross_exercise_synthesis, entity_index, corpus_structure]
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

## Wikilink Rules

- Every raw copy reference must use an Obsidian wikilink: `[[raw/path/to/file.md|filename]]`
- Every map-to-map reference must use a wikilink: `[[maps/concept_index]]`
- No absolute source paths in map entries. Use `raw/` relative paths only.

## Concept Index Format

Each concept gets a section with definition, coverage, and file references:

```markdown
## [Concept Name]

[1-2 sentence definition]

**Exercises:** Ex3, Ex5, Ex9
**Cohorts:** C1, C2, C3

| File | Exercise | Cohort | Thematic Tags | Summary |
|---|---|---|---|---|
| [[raw/path/to/file.md\|filename]] | Ex3 | C1 | ethics, reflection | One-sentence summary |
```

## Thematic Tags Format

Each tag gets a section listing all files with that tag:

```markdown
## [Tag Name]

[N sentences describing what this tag means in context]

| File | Exercise | Cohort | Core Concepts | Summary |
|---|---|---|---|---|
| [[raw/path/to/file.md\|filename]] | Ex3 | C1 | ethics, trust | One-sentence summary |
```

## Cross-Exercise Synthesis Format

Each theme gets a section showing evolution across exercises:

```markdown
## [Theme Name]

[N sentences describing how this theme evolves across exercises]

| Exercise | Files | Key Observations |
|---|---|---|
| Ex3 | [[raw/file1.md\|file1]], [[raw/file2.md\|file2]] | Initial assessment |
| Ex9 | [[raw/file3.md\|file3]], [[raw/file4.md\|file4]] | Formal judgment |
| Ex17 | [[raw/file5.md\|file5]] | Final reflection |
```

## Entity Index Format

Each entity gets a section with role/description and file references:

```markdown
## [Entity Name]

[1-2 sentence description of who/what this is]

| File | Exercise | Cohort | Context |
|---|---|---|---|
| [[raw/path/to/file.md\|filename]] | Ex0 | C1 | Pre-session interview |
```

## Corpus Structure Format

Files organized by exercise and cohort:

```markdown
## Exercise N — [Exercise Name]

[1-2 sentence description of the exercise]

### Cohort X

| File | Participant | Thematic Tags | Summary |
|---|---|---|---|
| [[raw/path/to/file.md\|filename]] | Name | tag1, tag2 | One-sentence summary |
```
