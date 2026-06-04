# Report Template

## File Naming Convention

Reports are numbered sequentially based on existing files in `agent_reports/`:

1. List all `NN_*.md` files in `agent_reports/`
2. Extract the number prefix from each file
3. Find the highest number
4. Increment by 1 for the new report
5. Format: `NN_descriptive-name.md`

**Examples:**
- `00_startup-report.md`
- `01_evidence-analysis.md`
- `02_serendipity-discovery.md`

If no numbered files exist, start with `00_`.

## Report Template

```markdown
---
type: report
created: YYYY-MM-DD
updated: YYYY-MM-DD
status: draft
scope: [one-line description of what this report covers]
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
For large evidence sets (>50 sources), include the top 10-20 here and link to the appendix:]

> For the complete evidence set, see `agent_reports/evidence_appendix.md`

## Analysis
[Interpretation, patterns, connections — include Analyst's broader context here]

## Limitations
[Gaps, uncertainties, what was not checked]

## Sources
[List of all source paths referenced]
```

## Evidence Appendix

When evidence exceeds ~300 lines or ~50 sources, create a separate appendix file:

**File:** `agent_reports/evidence_appendix.md`

```markdown
---
type: evidence_appendix
report: [main report filename]
sources_total: [count]
created: YYYY-MM-DD
---

# Evidence Appendix: [Report Title]

Full evidence set for the main report. The main report contains the top sources and key patterns.

### Source 1: [file path]
- **Type:** raw_copy
- **Relevant excerpt:** [quoted text with line context]
- **Confidence:** high | medium | low

### Source 2: [file path]
...
```

## Unicode Chart Types

The report template supports 6 chart types for different visualization needs.

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

### Dashboard Examples

**Distribution Bars (Startup Report):**
```
┌─ Startup Status ───────────────────────────────────────────────┐
│ Extract  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  925/925 files                     │
│ Maps     ▓▓▓▓▓▓▓▓▓▓▓▓░░░░  15 created                         │
│ Dict     ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░  342 terms                          │
│ Valid    ✓ passed                                                │
└─────────────────────────────────────────────────────────────────┘
```

**Progress Bar (Extraction Checkpoint):**
```
┌─ Extraction Progress ───────────────────────────────────────────┐
│ Files    ▓▓▓▓▓▓▓▓▓▓░░░░░░  450/925 (48%)                       │
│ Batches  ▓▓▓▓▓▓░░░░░░░░░░  30/60 completed                     │
│ Status   in_progress                                             │
└─────────────────────────────────────────────────────────────────┘
```

**Status Matrix (Workspace Index):**
```
┌─ Workspace Health ──────────────────────────────────────────────┐
│ Group    A    B    C    D    E    F                             │
│ Maps     ✓    ✓    ⚠    ✓    ✓    ✗                            │
│ Links    ✓    ✓    ✓    ✓    ⚠    ✓                            │
│ Fresh    ✓    ✓    ✓    ✓    ✓    ✓                            │
└─────────────────────────────────────────────────────────────────┘
```

**Gauge (Janitor Report):**
```
┌─ Hygiene Score ─────────────────────────────────────────────────┐
│ Overall  ◐◐◐◐◐◐◐◐◑░░░░░░░  75%                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Sparkline (Serendipity Report):**
```
┌─ Discovery Trend ───────────────────────────────────────────────┐
│ Links    ▁▂▃▅▆▇█▇▅▃▂▁▂▃▅▆▇  12 connections                     │
│ Maps     ▂▃▅▇█▇▅▃▂▁▁▂▃▅▇█  8 maps consulted                   │
└─────────────────────────────────────────────────────────────────┘
```

**Stacked Bar (Evidence Packet):**
```
┌─ Search Metrics ────────────────────────────────────────────────┐
│ Source   ████▓▓▓▓░░░░░░░░  maps:4 raw_scanned:8 raw_read:4     │
└─────────────────────────────────────────────────────────────────┘
```

## Process File Cleanup

After the final report is verified, move process files to `.trash/`:

- `agent_reports/evidence_packet.md`
- `agent_reports/evidence_appendix.md`
- `agent_reports/extraction_batch_*.md`

Only the numbered final reports stay in `agent_reports/` (e.g., `00_startup-report.md`, `01_evidence-analysis.md`).
