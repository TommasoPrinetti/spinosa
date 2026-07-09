# Search Provenance Footer Template

Appended to the verified report by the Evaluator. Renders the search pathway from the evidence packet's YAML frontmatter. Never rendered by the Writer.

## Format

````
┌─ Search Provenance ───────────────────────────────────────────────┐
│ Query                                                             │
│   [query from evidence packet frontmatter]                        │
│                                                                   │
│ Decomposition ···································· N sub-queries  │
│   1. [sub-query 1]                              ·· N sources     │
│   2. [sub-query 2]                              ·· N sources     │
│                                                                   │
│ Keyword expansions                                                │
│   [term] → [synonym1], [synonym2], [translation]                  │
│                                                                   │
│ Grep patterns used                                                │
│   grep -rn "[pattern]" raw/ --include="*.md"  ·· N matches       │
│   grep -rn "[pattern]" raw/ --include="*.md" ·· N matches        │
│                                                                   │
│ Navigation  [overview → group_map → raw_file]                     │
│ Rounds: N  ·  Termination: [termination_reason]                   │
│ Failed: [term] — 0 results                                        │
│ Gaps: [gap description]                                           │
└──────────────────────────────────────────────────────────────────┘
[maps:N · scanned:N · read:N · cited:N · status:○ pending]

````

## Rendering rules

| Field | Source in evidence_packet.yaml | Behavior when absent |
|-------|--------------------------------|----------------------|
| Query | `query` | Show "Query" with empty value |
| Decomposition | `navigation.decomposition.sub_queries[].query` + `sources[]` | Omit section entirely |
| Keyword expansions | `keyword_expansions` | Omit section entirely |
| Grep patterns | `grep_patterns_used[].pattern` + `matches` | Omit section entirely |
| Navigation path | `navigation.navigation_path` | Omit line entirely |
| Rounds | `navigation.search_rounds` | Omit line entirely |
| Termination | `navigation.search_termination` | Omit line entirely |
| Failed searches | `navigation.scratchpad_state.failed_searches` | Omit line entirely |
| Gaps | `navigation.scratchpad_state.gaps_remaining` | Omit line entirely |
| Maps | `navigation.maps_accessed` (count) | Show `maps: ?` |
| Raw scanned | `navigation.raw_files_scanned` | Show `scanned: ?` |
| Raw read | `navigation.raw_files_read` | Show `read: ?` |
| Sources cited | from report body | Count from evidence packet `sources_found` |
| Status | from report YAML frontmatter `status` | Show `pending` |

## Evaluator workflow

1. Read `evidence_packet_{session_id}.md` from the goal artifact or chain trace — check `agent_reports/` first, then fall back to `.trash/`. Legacy fallback: [[evidence_packet.md]]
2. Extract all available fields from YAML frontmatter
3. Render the footer block using this template
4. Append to the end of the verified report (after Sources section)
5. Update the metrics line at the bottom with status from report YAML

## Rules

- Every section is independently gated. If the source data is absent, omit the section. Do not fill with fabrications.
- Never invent grep patterns. Only use what the searcher recorded.
- The metrics line at the bottom is always present even if all sections are omitted.
- Use `none` when an enumeration would be empty (e.g., `Failed: none`).
- The status in the metrics line is read from the report's YAML frontmatter `status:` field.
