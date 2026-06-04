---
type: directory_guidance
scope: agent_reports/
description:
  - Rules for durable reports, checkpoints, evidence packets, and verification notes.
  - "`pilosa-writer`, `pilosa-verifier`, and `pilosa-janitor` use this directory for non-transient output artifacts."
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
- `pilosa-searcher` does not write here — outputs raw evidence packets inline to the orchestrator.

## Operations

- Reports are **read-write**: `pilosa-writer` creates, `pilosa-verifier` corrects in-place. `pilosa-janitor` may archive.
- Each report must have a clear `type` and `scope` in the body or frontmatter.
- Evidence-bearing claims must cite source paths (raw copy).
- Verification failures are documented, not hidden.
- Partial results must be labeled as such.
- `pilosa-janitor` evaluates staleness by comparing `updated:` dates against current date — no tendency detection or structured needs analysis.

## Report types

| Type | When | Who |
|---|---|---|
| `synthesis` | Full answer to a user prompt | `pilosa-writer` |
| `evidence_packet` | Raw evidence from `pilosa-searcher` handoff | `pilosa-searcher` -> `pilosa-writer` |
| `checkpoint` | Partial progress during long routes | `pilosa-writer` |
| `verification` | Standalone claim/path/index verification when no report exists | `pilosa-verifier` |
| `maintenance` | Index repair, stale audit, cleanup proposal | `pilosa-verifier` / `pilosa-janitor` |

## Conventions

- Filenames: descriptive-snake-case.md
- Report bodies are Markdown. Use Obsidian wikilinks for workspace references.
- If a report cites a claim that `pilosa-verifier` could not verify, mark it explicitly.

## See also

- [[AGENTS]] — orchestrator playbook (`pilosa-writer` dispatch, `pilosa-verifier` dispatch)
- [[.trash/AGENTS]] — archival destination for stale reports
