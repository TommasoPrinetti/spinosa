---
name: evidence-search
type: skill
scope: evidence_retrieval
description: Write-capable fallback for pilosa-searcher evidence retrieval
created: 2026-05-26
updated: 2026-06-04
---

## Purpose

Search existing workspace sources for evidence. This is the fallback instruction set for `pilosa-searcher` when native sub-agent dispatch is unavailable.

## Prerequisites

- Workspace source search is allowed by the orchestrator.
- `system/dictionary.md`, `maps/`, and `raw/` are available.
- The orchestrator has provided the cleaned user prompt and route constraints.

## Steps

1. Read `system/dictionary.md` for canonical terms and aliases related to the query.
2. Read `maps/` for navigation — start with the structural overview, then group maps to identify relevant files.
3. Search `raw/` for matching terms and aliases.
4. Read only the relevant source sections needed to answer the retrieval task.
5. Write evidence to `agent_reports/evidence_packet.md`.
6. Return file path and summary to orchestrator.

## Output — Always Write to File

Never return a large evidence list inline. Write results to a file and return the path.

### Step 1: Write the evidence packet

Write to `agent_reports/evidence_packet.md`:

```markdown
---
type: evidence_packet
query: [original query summary]
sources_found: [count]
created: YYYY-MM-DD
---

# Evidence for: [query summary]

### Source 1: [file path]
- **Type:** raw_copy
- **Relevant excerpt:** [quoted text with line context]
- **Confidence:** high | medium | low

### Source 2: [file path]
...
```

### Step 2: If evidence exceeds ~300 lines, split into main + appendix

- **Main file** (`agent_reports/evidence_packet.md`): summary, top sources by confidence, key patterns.
- **Appendix file** (`agent_reports/evidence_appendix.md`): every source with full excerpts.

### Step 3: Return path to orchestrator

Return only:

```
Evidence written to agent_reports/evidence_packet.md
- Sources found: N
- Confidence breakdown: X high, Y medium, Z low
- Key themes: [1-3 sentence summary]
```

## Rules

- Always write evidence to files. Do not return large lists inline.
- Never copy new files into `raw/`.
- Never update logs, dictionary, reports, or workspace indexes. Update maps only when route constraints explicitly include `map_write`; otherwise propose map updates in the evidence packet.
- Report evidence only; do not synthesize interpretation.
- Include a source path for every evidence item.
- If no relevant source exists, write a packet with `sources_found: 0` and say so clearly.
- If you run multiple search rounds, append to the same file — do not overwrite.

## See also

- `source-intake` — write-capable workflow for adding new sources; not a Searcher fallback
- `orchestrator-dispatch` — primary route selection and native sub-agent dispatch
