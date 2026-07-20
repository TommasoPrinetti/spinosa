# Reports & Charts

Every substantial answer from Spinosa comes back as a markdown report in the chat. Reports show the answer, the evidence behind it, the interpretation, limitations, and a verification status.

## Report sections

**Answer** — The shortest direct response to your question.

**Evidence** — Quoted passages from your documents with source paths and confidence labels. This is what you read when you need to know exactly what the corpus supports.

**Analysis** — Interpretation built from the evidence.

**Limitations** — What is missing, ambiguous, or out of scope.

**Sources** — The file paths used to ground the answer.

**Status** — The verification outcome (see below).

## Verification statuses

| Status | Meaning |
|--------|---------|
| `○ pending` | Draft exists, verification not finished yet |
| `✓ verified` | Claims and quotes passed source review |
| `⚠ corrections` | Minor fixes made during verification, still usable |
| `✗ failed` | Important claims could not be supported reliably |

Trust reports by reading the status and the evidence together.

## Navigation dashboard

Many reports open with a compact dashboard:

```text
┌─ Corpus Navigation ──────────────────────────────────────────────┐
│ Maps   ▓▓▓▓▓▓░░░░░░░░░░  6 consulted                            │
│ Raw    ▓▓▓▓▓▓▓▓▓▓░░░░░░  45 scanned · 12 read                   │
│ Source ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  18 cited                               │
│ Status ✓ verified                                               │
└─────────────────────────────────────────────────────────────────┘
```

- **Maps** — how many navigation maps were searched
- **Raw** — how many files were scanned vs read in depth
- **Source** — how many sources made it into the final answer
- **Status** — verification outcome

## Chart types

Spinosa uses simple Unicode charts readable in plain text.

| Chart | Characters | Meaning |
|-------|-----------|---------|
| Distribution bars | `▓░█` | Done versus total |
| Progress bar | `▓░` | Linear progress |
| Status matrix | `✓⚠✗○◉` | Health across categories |
| Gauge | `◐◑◉` | Single health score |
| Sparkline | `▁▂▃▄▅▆▇█` | Trend over time |
| Stacked bar | `█▓▒░` | Total split into parts |

## Reading reports well

- Read the Answer first, then check it against the Evidence.
- Use Limitations to decide whether to ask a narrower follow-up.
- Open cited files when a claim matters and you want surrounding context.
- Treat failed or pending status as a reason to pause, not decoration.

## Related

- [Tour](/spinosa/docs/tour) — first report walkthrough
- [Agents](/spinosa/docs/agents) — how reports are assembled and verified
- [Workspace](/spinosa/docs/workspace) — where reports and source files live
- [FAQ](/spinosa/docs/faq) — troubleshooting reports
