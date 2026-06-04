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
[Quotes and source references using verbatim format.
For large evidence sets, include top sources and reference the appendix.]

> For the complete evidence set, see `agent_reports/evidence_appendix.md`

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

**Rule:** Only the final verified report stays in `agent_reports/`. All process files are moved to `.trash/` after delivery.

## Rules

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

## See also

- `claim-verification` — for the Verifier's verification workflow
- `orchestrator-dispatch` — for the routing logic that invokes this skill
