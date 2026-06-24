## Unicode Chart Types

Generate Unicode charts in report headers or sections. Each chart type serves a specific purpose. Use the correct type for each context.

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

### Distribution Bars Rendering

```
┌─ Startup Status ───────────────────────────────────────────────┐
│ Extract  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  925/925 files                     │
│ Maps     ▓▓▓▓▓▓▓▓▓▓▓▓░░░░  15 created                         │
│ Dict     ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░  342 terms                          │
│ Valid    ✓ passed                                                │
└─────────────────────────────────────────────────────────────────┘
```

### Progress Bar Rendering

```
┌─ Extraction Progress ───────────────────────────────────────────┐
│ Files    ▓▓▓▓▓▓▓▓▓▓░░░░░░  450/925 (48%)                       │
│ Batches  ▓▓▓▓▓▓░░░░░░░░░░  30/60 completed                     │
│ Status   in_progress                                             │
└─────────────────────────────────────────────────────────────────┘
```

### Status Matrix Rendering

```
For each cell, assign status based on data:
  ✓ = all checks passed
  ⚠ = minor issues or warnings
  ✗ = failures or missing
  ○ = not yet checked
  ◉ = currently processing
```

```
┌─ Workspace Health ──────────────────────────────────────────────┐
│ Group    A    B    C    D    E    F                             │
│ Maps     ✓    ✓    ⚠    ✓    ✓    ✗                            │
│ Links    ✓    ✓    ✓    ✓    ⚠    ✓                            │
│ Fresh    ✓    ✓    ✓    ✓    ✓    ✓                            │
└─────────────────────────────────────────────────────────────────┘
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

```
┌─ Hygiene Score ─────────────────────────────────────────────────┐
│ Overall  ◐◐◐◐◐◐◐◐◑░░░░░░░  75%                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Sparkline Rendering

```
Normalize values to 0-7 range:
  normalized = round((value - min) / (max - min) * 7)
  char = "▁▂▃▄▅▆▇█"[normalized]
```

```
┌─ Discovery Trend ───────────────────────────────────────────────┐
│ Links    ▁▂▃▅▆▇█▇▅▃▂▁▂▃▅▆▇  12 connections                     │
│ Maps     ▂▃▅▇█▇▅▃▂▁▁▂▃▅▇█  8 maps consulted                   │
└─────────────────────────────────────────────────────────────────┘
```

### Stacked Bar Rendering

```
For each segment:
  segment_width = round((segment_value / total) * bar_width)
  Concatenate segments: bar = "█" * s1 + "▓" * s2 + "▒" * s3 + "░" * s4
```

```
┌─ Search Metrics ────────────────────────────────────────────────┐
│ Source   ████▓▓▓▓░░░░░░░░  maps:4 raw_scanned:8 raw_read:4     │
└─────────────────────────────────────────────────────────────────┘
```
