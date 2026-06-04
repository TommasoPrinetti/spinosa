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

- Searcher has provided an evidence packet with source paths and excerpts
- Analyst may have provided a contextual analysis packet (when in the sequence)
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
6. Write ONE clean report in `agent_reports/`.
7. Verifier will verify and correct in-place — do not mark claims verified yourself.

## Rules

- Answer the original request, not a broader invented task.
- Use only material supplied by Searcher, Analyst, or already in context.
- Preserve every source path and locator exactly.
- Never invent missing source support.
- Never mark claims verified — Verifier handles that.
- Do not include process noise or intermediate artifacts.
- Keep concise unless the user asked for depth.
- When Analyst provides broader context, integrate into Analysis — do not duplicate as separate section.

## Formatting Standards

- One H1 per report (title). H2 for sections. No H3+ unless user explicitly asks for depth.
- Tables: consistent alignment, no empty cells, always include headers.
- Lists: `-` not `*`. No nesting deeper than 2 levels.
- No filler sentences. No "In this report we will..." — start with the answer.
- Clean markdown: no trailing spaces, no blank lines inside blockquotes.
- Maximum ~500 lines. Split into sections or checkpoint if longer.
- Verbatim quotes in blockquotes with bold key passages.
- Interpretation clearly labeled — never mixed with evidence sections.

## See also

- `claim-verification` — for the Verifier's verification workflow
- `orchestrator-dispatch` — for the routing logic that invokes this skill
