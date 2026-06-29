# Reports & Charts

Every answer comes back as a markdown report. This page shows the format and explains any charts you'll see.

## How a report is built

```
Your question
    ↓
Searcher finds evidence → writes evidence_packet.md
    ↓
Writer composes report from evidence + context
    ↓
Verifier checks every claim against original files
    ↓
Report gets a status badge
```

## Read a sample report

Here's a real report with callouts explaining each section:

```
---
type: report
created: 2026-06-10         ← When the report was written
status: draft                ← Before verification
scope: coastal erosion evidence
---

┌─ Corpus Navigation ──────────────────────────────────────────────┐
│ Maps   ▓▓▓▓▓▓░░░░░░░░░░  6 consulted                            │
│ Raw    ▓▓▓▓▓▓▓▓▓▓░░░░░░  45 scanned · 12 read                   │
│ Source ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  18 cited                               │
│ Status ○ pending                                                 │
└─────────────────────────────────────────────────────────────────┘
   ▲                       ▲
   │                       └── Filled bars = proportion of total
   └── 6 maps were consulted; filled shows how many of the max

## Answer
The Normandy interviews consistently describe coastal erosion
as accelerating over the past decade, with participants citing
both natural processes and human interventions.

## Evidence
### Interview with Maria Santos (raw/interviews/normandy/ms-2024.md L45-L52)
> "The shoreline has retreated about 15 meters since 2015. The
> old coastal path that we used for walking is completely gone."

Confidence: HIGH

### Field notes (raw/field-notes/coastal-survey-2023.md L12-L18)
> "Several locations show active cliff erosion with recent
> collapse debris. Residents report increased frequency of
> minor landslides during winter storms."

Confidence: HIGH

For the complete evidence set, see agent_reports/evidence_appendix.md

## Analysis
The evidence suggests two parallel narratives: natural erosion
processes and the impact of sea defences constructed in the 1990s.
The Analyst noted that "sea level rise" is a related concept that
appears in 3 interview groups beyond Normandy, suggesting this
is part of a broader coastal concern across the corpus.

## Limitations
- No quantitative data on erosion rates from engineering reports
- Only 4 of 12 Normandy interview participants discussed erosion
  directly — other participants may have different views

## Sources
- raw/interviews/normandy/ms-2024.md
- raw/field-notes/coastal-survey-2023.md
- raw/interviews/normandy/jd-2024.md
- (18 total sources)
```

After verification, the status badge updates:

- `○ pending` → `✓ verified` — all claims checked against source files, all accurate
- `○ pending` → `⚠ corrections` — minor fixes applied, report is still reliable
- `○ pending` → `✗ failed` — some claims couldn't be verified; review before using

## Evidence packets (how Searcher works)

When the Searcher finds evidence, it writes an intermediate file:

```markdown
---
type: evidence_packet
query: coastal erosion in Normandy interviews
sources_found: 8
navigation:
  maps_accessed:
    - maps/corpus_overview.md
    - maps/groups/normandy-interviews/map.md
  raw_files_scanned: 45
  raw_files_read: 12
---

### Source: raw/interviews/normandy/ms-2024.md
- **Relevant excerpt:** "The shoreline has retreated about 15 meters..."
- **Confidence:** HIGH
```

This file is intermediate — the Writer reads it to build the final report, then it's moved to `.trash/`.

## Chart types

Spinosa uses Unicode charts to show progress, health, and metrics at a glance.

| Chart | Characters | What it tells you |
|---|---|---|
| **Distribution bars** | `▓░█` | How much has been done vs total (startup completion) |
| **Progress bar** | `▓░` | Linear progress through a process (file extraction) |
| **Status matrix** | `✓⚠✗○◉` | Health across multiple categories (workspace groups) |
| **Gauge** | `◐◑◉` | Single percentage score (workspace hygiene) |
| **Sparkline** | `▁▂▃▄▅▆▇█` | Trend over time (discoveries per session) |
| **Stacked bar** | `█▓▒░` | Breakdown of a total into segments (evidence composition) |

### Distribution bars — "How complete is this?"

```
┌─ Startup Status ───────────────────────────────────────────────┐
│ Extract  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  25/25 files                        │
│ Maps     ▓▓▓▓▓▓▓▓▓▓▓▓░░░░  8 created                           │
│ Dict     ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░  142 terms                           │
│ Valid    ✓ passed                                                │
└─────────────────────────────────────────────────────────────────┘
```

Filled bars mean complete. Empty space means remaining. All full = done.

### Progress bar — "How far along?"

```
┌─ Extraction Progress ───────────────────────────────────────────┐
│ Files    ▓▓▓▓▓▓▓▓▓▓░░░░░░  18/25 (72%)                         │
│ Status   in_progress                                             │
└─────────────────────────────────────────────────────────────────┘
```

### Status matrix — "What's healthy?"

```
┌─ Workspace Health ──────────────────────────────────────────────┐
│ Group    A    B    C    D    E    F                             │
│ Maps     ✓    ✓    ⚠    ✓    ✓    ✗                            │
│ Links    ✓    ✓    ✓    ✓    ⚠    ✓                            │
│ Fresh    ✓    ✓    ✓    ✓    ✓    ✓                            │
└─────────────────────────────────────────────────────────────────┘
```

`✓` = good, `⚠` = needs attention, `✗` = needs fixing, `○` = not checked.

### Gauge — "Overall score"

```
┌─ Hygiene Score ─────────────────────────────────────────────────┐
│ Overall  ◐◐◐◐◐◐◐◐◑░░░░░░░  75%                                 │
└─────────────────────────────────────────────────────────────────┘
```

Read it like a fuel gauge. More filled = better.

### Sparkline — "Trend over time"

```
┌─ Discovery Trend ───────────────────────────────────────────────┐
│ Links    ▁▂▃▅▆▇█▇▅▃▂▁▂▃▅▆▇  12 connections                     │
└─────────────────────────────────────────────────────────────────┘
```

Taller spikes = more discoveries. Read left to right like a timeline.

### Stacked bar — "Composition"

```
┌─ Search Metrics ────────────────────────────────────────────────┐
│ Source   ████▓▓▓▓░░░░░░░░  maps:4 scanned:12 read:8            │
└─────────────────────────────────────────────────────────────────┘
```

Each character segment represents a different category. Longer = more.

### Session-Named Artifacts

Several agent outputs use `{session_id}` in their filename, where `{session_id}` is a unique identifier generated by the orchestrator at the start of each non-fast-path route.

| Pattern | Produced By | Example |
|---|---|---|
| `g_{session_id}.md` | Orchestrator (goal artifact) | `g_20260629-abcd1234.md` |
| `e_{session_id}.md` | Evaluator | `e_20260629-abcd1234.md` |
| `v_{session_id}.md` | Verifier | `v_20260629-abcd1234.md` |
| `c_{session_id}.md` | Overseer | `c_20260629-abcd1234.md` |

The `session_id` format is `YYYYMMDD-{short_hash}` generated by the orchestrator at route start.

## Session notes

The orchestrator keeps a working notepad at `.spinosa/memory/orchestrator-notes.md` — session summaries, context, blockers, and lessons. Freeform markdown, updated per session. No structured logging.
