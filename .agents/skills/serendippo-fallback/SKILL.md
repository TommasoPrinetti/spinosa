---
name: serendippo-fallback
type: skill
scope: serendipitous_research
description: Fallback for pilosa-serendippo — holistic serendipitous research finding hidden connections across files
created: 2026-06-05
updated: 2026-06-05
---

## Purpose

Fallback instruction set for `pilosa-serendippo` when native sub-agent dispatch is unavailable. Finds hidden connections between concepts across the raw corpus through holistic, roaming research.

## Prerequisites

- Workspace has maps and dictionary available.
- `raw/` corpus is populated.
- The orchestrator has provided route constraints (including whether `map_write` is allowed).

## Steps

### Phase 1: Orient

1. Read `system/dictionary.md` to understand the current vocabulary.
2. Read `maps/` — start with structural overview, then group maps, then theme maps.
3. Identify gaps: which concepts are under-connected? Which files are isolated?

### Phase 2: Roam

1. Pick a starting file from an under-connected concept or isolated file.
2. Read deeply — understand the file's place in the research.
3. Follow threads — when a file mentions a concept, find other files on the same thread.
4. Link across boundaries — connections between different groups, source types, languages, or participants.

### Phase 3: Connect

1. Document each connection: which files connect, why, and what it reveals.
2. Propose new map entries — suggest additions to existing maps.
3. Identify patterns — recurring themes in 3+ unexpected places.

### Phase 4: Report

1. Write a serendipity report to `agent_reports/` with sequential numbering.
2. Include: connections found, patterns identified, map updates proposed, gaps remaining, navigation log.
3. Append one compact metrics row to `logs/session_metrics.tsv`.
4. Return the report path.

## Connection Types

| Type | Example |
|---|---|
| Concept evolution | A concept appears differently across groups or time periods |
| Participant trajectory | A participant's perspective changes across files |
| Methodological link | Design choices connecting to research questions |
| Cross-group parallel | Similar responses from different groups on same topic |
| Unexpected contrast | Participants who disagree on same concept |
| Linguistic bridge | Same idea expressed in different languages |
| Temporal build | How one file builds on themes from another |

## Rules

- **All output must be reports.** Write to `agent_reports/`. No inline chat responses.
- Never edit raw files.
- Always write a serendipity report when routed.
- Edit maps only when route constraints include `map_write`; otherwise propose updates in the report.
- Track navigation: record every map accessed, files scanned, files read.
- Follow threads, don't force connections.
- When in doubt, flag as "possible connection."
- Append one metrics row with operation `serendipity`, directories seen, maps read, raw files read, reports written, and output path. Use `.bin/lib/metrics.sh` when available; never log raw command output, long grep terms, source excerpts, secrets, or credentials.

## See also

- `orchestrator-dispatch` — primary route selection and native sub-agent dispatch
