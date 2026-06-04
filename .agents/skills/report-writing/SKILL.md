---
name: report-writing
type: skill
scope: report_synthesis
description: Write synthesis reports, evidence packets, and checkpoints
created: 2026-05-26
updated: 2026-06-04
---

## Purpose

Turn retrieved material and contextual analysis into a coherent markdown report. Separate evidence from interpretation. Cite source paths. Leave verification to the Verifier.

## Prerequisites

- Searcher has written an evidence packet to `agent_reports/evidence_packet.md` (and optionally `agent_reports/evidence_appendix.md`)
- Analyst may have provided a contextual analysis packet (when in the sequence)
- Original user prompt is known

## Steps

1. Restate the original request in one sentence.
2. Read the evidence from `agent_reports/evidence_packet.md`. If an appendix exists at `agent_reports/evidence_appendix.md`, read it too.
3. Parse the `navigation:` block from the evidence packet frontmatter to collect metrics: `maps_accessed`, `raw_files_scanned`, `raw_files_read`, `evidence_found_in`.
4. Structure the report using `references/report-template.md`:

```markdown
---
type: report
created: YYYY-MM-DD
updated: YYYY-MM-DD
status: draft
---

# [Report Title]

```
┌─ Corpus Navigation ──────────────────────────────────────────────┐
│ Maps   ▓▓▓▓▓▓░░░░░░░░░░  6 consulted · 2 updated               │
│ Raw    ▓▓▓▓▓▓▓▓▓▓░░░░░░  45 scanned · 12 read                  │
│ Source ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  18 cited                              │
│ Status ○ pending                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Answer
[Short direct answer to the original request]

## Evidence
[Quotes and source references using verbatim format.
For large evidence sets, include top sources and reference the appendix.]

> For the complete evidence set, see `agent_reports/evidence_appendix.md`

## Analysis
[Interpretation, patterns, connections]

## Limitations
[Gaps, uncertainties, what was not checked]
```

5. For direct quotes, use verbatim format from `references/verbatim-format.md`:
   - `> **Author Name**, *Source Title* (Date, Place)`
   - Minimum 2 sentences or 1 full paragraph.
   - Key passage in **bold**.
6. Separate completed, partial, and unresolved items if any branch failed.
7. Number the report sequentially: check `agent_reports/` for existing `NN_*.md` files, find the highest number, increment by 1. Format: `NN_descriptive-name.md` (e.g., `00_first-report.md`, `01_followup.md`).
8. Write ONE clean report in `agent_reports/` with the numbered filename.
9. Verifier will verify and correct in-place — do not mark claims verified yourself.

## Evidence Appendix Pattern

When evidence exceeds ~300 lines or ~50 sources:

| File | Content | When |
|---|---|---|
| `agent_reports/evidence_packet.md` | All sources with excerpts | Always written by Searcher |
| `agent_reports/evidence_appendix.md` | Full evidence set (all sources) | When >300 lines or >50 sources |
| `agent_reports/<report_name>.md` | Final report with top sources + appendix link | Written by Writer |

The main report includes the top 10-20 most relevant sources inline and links to the appendix for the full set.

## Process File Lifecycle

Process files are intermediate artifacts created during search and synthesis:

| Process File | Created By | Purpose | Cleanup |
|---|---|---|---|
| `evidence_packet.md` | Searcher | Raw evidence from corpus | Move to `.trash/` after report verified |
| `evidence_appendix.md` | Searcher | Overflow evidence (when >300 lines) | Move to `.trash/` after report verified |
| `extraction_batch_*.md` | Mapper | Extraction packets per batch | Move to `.trash/` after indexing complete |
| `NN_*.md` | Writer/Serendippo | Numbered final reports | Keep in `agent_reports/` |

**Rule:** Only the numbered final verified reports stay in `agent_reports/` (e.g., `00_startup-report.md`, `01_evidence-analysis.md`). All process files are moved to `.trash/` after delivery.

## Rules

- **All output must be reports.** Every answer is a report written to `agent_reports/`. No inline chat responses. No exceptions.
- Answer the original request, not a broader invented task.
- Use only material supplied by Searcher, Analyst, or already in context.
- Preserve every source path and locator exactly.
- Never invent missing source support.
- Never mark claims verified — Verifier handles that.
- Do not include process noise or intermediate artifacts.
- Keep concise unless the user asked for depth.
- When Analyst provides broader context, integrate into Analysis — do not duplicate as separate section.
- Read evidence from files, not from inline context passed by the orchestrator.

## Formatting Standards

- One H1 per report (title). H2 for sections. No H3+ unless user explicitly asks for depth.
- Tables: consistent alignment, no empty cells, always include headers.
- Lists: `-` not `*`. No nesting deeper than 2 levels.
- No filler sentences. No "In this report we will..." — start with the answer.
- Clean markdown: no trailing spaces, no blank lines inside blockquotes.
- Maximum ~500 lines. Split into sections or reference an appendix if longer.
- Verbatim quotes in blockquotes with bold key passages.
- Interpretation clearly labeled — never mixed with evidence sections.

## Unicode Chart Types

Generate Unicode charts in report headers or sections. Each chart type serves a specific purpose.

### Chart Type Registry

| Type | Characters | Use Case | File/Zone |
|---|---|---|---|
| **Distribution Bars** | `▓░█` | Compare 3-4 metrics side-by-side | Startup Report |
| **Progress Bar** | `▓░` | Linear completion tracking | Extraction Checkpoint |
| **Status Matrix** | `✓⚠✗○◉` | Multi-dimensional health grid | Workspace Index |
| **Gauge** | `◐◑◉` | Single circular metric | Janitor Report |
| **Sparkline** | `▁▂▃▄▅▆▇█` | Trend over time | Serendipity Report |
| **Stacked Bar** | `█▓▒░` | Composition of segments | Evidence Packet |

### Common Settings

```
bar_width = 16 characters
border_style = ┌─ Title ─┐ / └─────────┘
alignment = labels left, charts right
status_values = ○ pending → ✓ verified / ⚠ corrections / ✗ failed
```

### Bar Calculation (Distribution Bars, Progress Bar, Stacked Bar)

```
filled = round((value / total) * bar_width)
empty = bar_width - filled
bar = "▓" * filled + "░" * empty
```

If total is 0 or unknown, show full bar with "?" for count.

### Status Matrix Rendering

```
For each cell, assign status based on data:
  ✓ = all checks passed
  ⚠ = minor issues or warnings
  ✗ = failures or missing
  ○ = not yet checked
  ◉ = currently processing
```

### Gauge Rendering

```
Calculate percentage: pct = value / total
Determine fill level:
  0%   = ░░░░░░░░░░░░░░░░
  25%  = ◐░░░░░░░░░░░░░░░
  50%  = ◐◐◐◐◐◐◐◐◑░░░░░░░
  75%  = ◐◐◐◐◐◐◐◐◐◐◐◐◑░░░
  100% = ◐◐◐◐◐◐◐◐◐◐◐◐◐◐◐◐
```

### Sparkline Rendering

```
Normalize values to 0-7 range:
  normalized = round((value - min) / (max - min) * 7)
  char = "▁▂▃▄▅▆▇█"[normalized]
```

### Stacked Bar Rendering

```
For each segment:
  segment_width = round((segment_value / total) * bar_width)
  Concatenate segments: bar = "█" * s1 + "▓" * s2 + "▒" * s3 + "░" * s4
```

## See also

- `claim-verification` — for the Verifier's verification workflow
- `orchestrator-dispatch` — for the routing logic that invokes this skill
