# Reports & Charts

This is the canonical page for reading Spinosa output. Use it to understand what a report contains, how verification changes its status, and what the dashboard-style charts are telling you.

## What a report is

Every substantial answer comes back as a markdown report in `agent_reports/`. A report is not just a summary. It is the package Spinosa uses to show:

- the answer,
- the evidence behind it,
- the interpretation layered on top,
- the limitations,
- and whether verification passed.

## Report anatomy

A typical report includes these sections:

### Answer

The shortest direct response Spinosa can give to your question.

### Evidence

Quoted passages with source paths and confidence labels. This is the part you read when you need to know exactly what the corpus supports.

### Analysis

Interpretation built from the evidence. Analysis should be useful, but it should never pretend to be the source itself.

### Limitations

What is missing, ambiguous, weakly supported, or still out of scope.

### Sources

The file paths used to ground the answer.

### Status

The verification outcome after the Verifier checks the report against the source files.

## Verification statuses

- `○ pending`: the draft exists, but verification has not finished yet.
- `✓ verified`: the checked claims and quotes passed source review.
- `⚠ corrections`: the report needed minor fixes during verification but is still usable.
- `✗ failed`: important claims could not be supported reliably. Review before relying on it.

If you only remember one rule, make it this one: trust reports by reading the status and the evidence together.

## The navigation dashboard

Many reports open with a compact dashboard like this:

```text
┌─ Corpus Navigation ──────────────────────────────────────────────┐
│ Maps   ▓▓▓▓▓▓░░░░░░░░░░  6 consulted                            │
│ Raw    ▓▓▓▓▓▓▓▓▓▓░░░░░░  45 scanned · 12 read                   │
│ Source ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  18 cited                               │
│ Status ✓ verified                                               │
└─────────────────────────────────────────────────────────────────┘
```

How to read it:

- `Maps` tells you how broadly the system ranged across navigation maps.
- `Raw` tells you how many files were scanned versus opened in more depth.
- `Source` tells you how many sources made it into the final answer.
- `Status` tells you whether verification is still pending, passed, corrected, or failed.

## Chart types

Spinosa uses simple Unicode charts so progress and health stay readable in plain text.

| Chart             | Characters | Meaning                             |
| ----------------- | ---------- | ----------------------------------- |
| Distribution bars | `▓░█`      | Done versus total                   |
| Progress bar      | `▓░`       | Linear progress through a process   |
| Status matrix     | `✓⚠✗○◉`    | Health across multiple categories   |
| Gauge             | `◐◑◉`      | A single health or completion score |
| Sparkline         | `▁▂▃▄▅▆▇█` | A trend across time or batches      |
| Stacked bar       | `█▓▒░`     | A total split into component parts  |

## Using reports well

- Read the Answer first, then test it against the Evidence.
- Use Limitations to decide whether to ask a narrower or broader follow-up.
- Open the cited files in `raw/` when a claim matters and you want the surrounding context.
- Treat a failed or pending status as a reason to pause, not as a cosmetic warning.

## Next reads

- [Tour](/docs/tour) for the first-report walkthrough
- [Agents & Pipeline](/docs/agents) for how reports are assembled and verified
- [Corpus Structure](/docs/corpus) for where reports and source files live
- [FAQ](/docs/faq) for troubleshooting pending, failed, or confusing reports
