---
name: evidence-search
description: Read-only fallback for pilosa-searcher evidence retrieval
---

## Purpose

Search existing workspace sources for evidence. This is the fallback instruction set for `pilosa-searcher` when native sub-agent dispatch is unavailable.

## Prerequisites

- Workspace source search is allowed by the orchestrator.
- `system/dictionary.md`, `maps/`, and `raw/` are available.
- The orchestrator has provided the cleaned user prompt and route constraints.

## Steps

1. Read `system/dictionary.md` for canonical terms and aliases related to the query.
2. Search `maps/` for concept navigation and likely raw source paths.
3. Search `raw/` for matching terms and aliases.
4. Read only the relevant source sections needed to answer the retrieval task.
5. Return an evidence packet with source paths, excerpts, and confidence.

## Output Format

```markdown
## Evidence for: [query summary]

### Source 1: [file path]
- **Type:** raw_copy
- **Relevant excerpt:** [quoted text with enough line context]
- **Confidence:** high | medium | low

### Source 2: [file path]
...
```

## Rules

- Never edit files.
- Never copy new files into `raw/`.
- Never update logs, maps, dictionary, reports, or workspace indexes.
- Report evidence only; do not synthesize interpretation.
- Include a source path for every evidence item.
- If no relevant source exists, say so clearly.

## See also

- `source-intake` — write-capable workflow for adding new sources; not a Searcher fallback
- `orchestrator-dispatch` — primary route selection and native sub-agent dispatch
