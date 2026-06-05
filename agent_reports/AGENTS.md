---
type: directory_guidance
scope: agent_reports/
description:
  - Rules for durable reports, checkpoints, evidence packets, and verification notes.
  - "`pilosa-writer`, `pilosa-verifier`, `pilosa-janitor`, and `pilosa-searcher` use this directory for output artifacts."
connects_to:
  - AGENTS.md
  - logs/user_requests.md
  - .trash/AGENTS.md
created: 2026-06-03
updated: 2026-06-04
---

# agent_reports — Durable Reports & Checkpoints

Synthesis reports, evidence packets, verification notes, checkpoints, and maintenance reports. These are the primary output artifacts of the sub-agent pipeline.

## Sub-agent ownership

- `pilosa-writer` writes reports: full synthesis, partial results, checkpoints. Each report answers the original user prompt or marks progress.
- `pilosa-verifier` annotates and corrects reports in-place. Standalone verification notes are only for verification routes without an existing report.
- `pilosa-janitor` evaluates reports for staleness and may propose archival to `.trash/` based on age alone (no structured research needs).
- `pilosa-searcher` writes evidence packets and appendices here during search operations. These are process files — moved to `.trash/` after the final report is verified.
- `pilosa-mapper` writes extraction batches here during startup indexing. These are process files — moved to `.trash/` after indexing completes.

## Process File Lifecycle

Process files are intermediate artifacts. Only the final **unique** verified report stays.

| Process File | Created By | Purpose | Lifecycle |
|---|---|---|---|
| `evidence_packet.md` | `pilosa-searcher` | Raw evidence from corpus search | Created during search → Read by Writer → Moved to `.trash/` after verification |
| `evidence_appendix.md` | `pilosa-searcher` | Overflow evidence (when >300 lines) | Created during search → Read by Writer → Moved to `.trash/` after verification |
| `extraction_batch_*.md` | `pilosa-mapper` | Extraction packets per batch | Created during indexing → Read by Writer → Moved to `.trash/` after indexing |

**Rule: ONLY ONE final verified report remains in `agent_reports/`** after all the processing.

## Operations

- Reports are **read-write**: `pilosa-writer` creates, `pilosa-verifier` corrects in-place. `pilosa-janitor` may archive.
- Each report must have a clear `type` and `scope` in the body or frontmatter.
- Evidence-bearing claims must cite source paths (raw copy).
- Verification failures are documented, not hidden.
- Partial results must be labeled as such.
- `pilosa-janitor` evaluates staleness by comparing `updated:` dates against current date — no tendency detection or structured needs analysis.

## Conventions

- Filenames: nn_descriptive-snake-case.md
- Report bodies are flavoured Markdown, well designed and tidy.
- Use Obsidian wikilinks for in-workspace references.
- If a report cites a claim that `pilosa-verifier` could not verify, mark it explicitly.

## See also

- [[AGENTS]] — orchestrator playbook (`pilosa-writer` dispatch, `pilosa-verifier` dispatch)
- [[.trash/AGENTS]] — archival destination for stale reports and process files
