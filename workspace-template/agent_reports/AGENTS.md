---
type: directory_guidance
scope: agent_reports/
description:
  - Rules for durable reports, checkpoints, evidence packets, and verification notes.
  - "`spinosa-writer`, `spinosa-verifier`, `spinosa-janitor`, and `spinosa-searcher` use this directory for output artifacts."
connects_to:
  - AGENTS.md
  - .spinosa/memory/
created: 2026-06-03
updated: 2026-06-24
---

# agent_reports — Durable Reports & Checkpoints

Synthesis reports, evidence packets, verification notes, checkpoints, and maintenance reports. These are the primary output artifacts of the sub-agent pipeline.

## Operations

- Reports are **read-write**: `spinosa-writer` creates, `spinosa-verifier` corrects in-place. `spinosa-janitor` may archive.
- Each report must have a clear `type` and `scope` in the body or frontmatter.
- Evidence-bearing claims must cite source paths (raw copy).
- Verification failures are documented, not hidden.
- Partial results must be labeled as such.
- `spinosa-janitor` evaluates staleness by comparing `updated:` dates against current date — no tendency detection or structured needs analysis.
- Older reports may cite legacy [[logs/]] paths — current operational traces are in [[.logs/]]; archived session records are in [[.spinosa/archive/]]. `spinosa update` migrates [[logs/]] → [[.logs/]] automatically.

## Conventions

- **Filenames must be understandable from outside** — follow [[.agents/references/artifact-naming.md]] (canonical rules).
- User-facing answers: `NN_{topic-slug}.md` (two-digit sequence + kebab-case topic). Example: `04_coastal-erosion-interviews.md`. Never `NN_report.md`, `NN_analysis.md`, `NN_final.md`.
- Session intermediates: fixed prefixes (`g_`, `evidence_packet_`, `analysis_`, etc.) + `session_id`; put human context in YAML `scope:` and the title.
- Report bodies are flavoured Markdown, well designed and tidy.
- Use Obsidian wikilinks for in-workspace references.
- If a report cites a claim that `spinosa-verifier` could not verify, mark it explicitly.
