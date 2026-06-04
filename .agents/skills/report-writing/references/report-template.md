# Report Template

```markdown
---
type: report
created: YYYY-MM-DD
updated: YYYY-MM-DD
status: draft
scope: [one-line description of what this report covers]
---

# [Report Title]

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

## Process File Cleanup

After the final report is verified, move process files to `.trash/`:

- `agent_reports/evidence_packet.md`
- `agent_reports/evidence_appendix.md`
- `agent_reports/extraction_batch_*.md`

Only the final report stays in `agent_reports/`.
