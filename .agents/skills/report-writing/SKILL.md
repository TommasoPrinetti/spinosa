---
name: report-writing
description: Write synthesis reports, evidence packets, and checkpoints
---

## Purpose

Turn retrieved material into a coherent markdown report. Separate evidence from interpretation. Cite source paths. Leave verification to the Verifier.

## Prerequisites

- Searcher has provided an evidence packet with source paths and excerpts
- Original user prompt is known

## Steps

1. Restate the original request in one sentence.
2. Gather all evidence items from Searcher's packet.
3. Structure the report using `references/report-template.md`:

```markdown
---
type: report
created: YYYY-MM-DD
updated: YYYY-MM-DD
status: draft
---

# [Report Title]

## Answer
[Short direct answer to the original request]

## Evidence
[Quotes and source references using verbatim format]

## Analysis
[Interpretation, patterns, connections]

## Limitations
[Gaps, uncertainties, what was not checked]
```

4. For direct quotes, use verbatim format from `references/verbatim-format.md`:
   - `> **Author Name**, *Source Title* (Date, Place)`
   - Minimum 2 sentences or 1 full paragraph.
   - Key passage in **bold**.
5. Separate completed, partial, and unresolved items if any branch failed.
6. Write ONE clean report in `05_agent_reports/`.
7. Verifier will verify and correct in-place — do not mark claims verified yourself.

## Rules

- Answer the original request, not a broader invented task.
- Use only material supplied by Searcher or already in context.
- Preserve every source path and locator exactly.
- Never invent missing source support.
- Never mark claims verified — Verifier handles that.
- Do not include process noise or intermediate artifacts.
- Keep concise unless the user asked for depth.

## See also

- `claim-verification` — for the Verifier's verification workflow
- `orchestrator-dispatch` — for the routing logic that invokes this skill
