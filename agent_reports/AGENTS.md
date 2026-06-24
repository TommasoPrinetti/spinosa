---
type: directory_guidance
scope: agent_reports/
description:
  - Rules for durable reports, checkpoints, evidence packets, and verification notes.
  - "`spinosa-writer`, `spinosa-verifier`, `spinosa-janitor`, and `spinosa-searcher` use this directory for output artifacts."
connects_to:
  - AGENTS.md
  - logs/user_requests.md
  - .trash/AGENTS.md
created: 2026-06-03
updated: 2026-06-04
---

# agent_reports — Durable Reports & Checkpoints

Synthesis reports, evidence packets, verification notes, checkpoints, and maintenance reports. These are the primary output artifacts of the sub-agent pipeline.

## Process File Lifecycle

Process files are intermediate artifacts. Only numbered final verified reports (e.g., `00_*.md`) persist.

| Process File | Created By | Purpose | Lifecycle |
|---|---|---|---|
| `evidence_packet.md` / `evidence_appendix.md` | Searcher | Raw evidence from corpus | Created during search → Moved to `.trash/` after verification |
| `extraction_batch_*.md` | Mapper | Extraction packets per batch | Created during indexing → Moved to `.trash/` after indexing |
| `NN_*.md` | Writer / Serendippo | Numbered final reports | Keep in `agent_reports/` |

## Operations

- Reports are **read-write**: `spinosa-writer` creates, `spinosa-verifier` corrects in-place. `spinosa-janitor` may archive.
- Each report must have a clear `type` and `scope` in the body or frontmatter.
- Evidence-bearing claims must cite source paths (raw copy).
- Verification failures are documented, not hidden.
- Partial results must be labeled as such.
- `spinosa-janitor` evaluates staleness by comparing `updated:` dates against current date — no tendency detection or structured needs analysis.

## Conventions

- Filenames: nn_descriptive-snake-case.md
- Report bodies are flavoured Markdown, well designed and tidy.
- Use Obsidian wikilinks for in-workspace references.
- If a report cites a claim that `spinosa-verifier` could not verify, mark it explicitly.


