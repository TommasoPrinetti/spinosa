---
type: directory_guidance
scope: agent_reports/
description:
  - Rules for durable reports, checkpoints, evidence packets, and verification notes.
  - Writer, Verifier, and Janitor use this directory for non-transient output artifacts.
connects_to:
  - AGENTS.md
  - logs/user_requests.md
  - .trash/AGENTS.md
created: 2026-06-03
updated: 2026-06-03
---

# agent_reports — Durable Reports & Checkpoints

Synthesis reports, evidence packets, verification notes, checkpoints, and maintenance reports. These are the primary output artifacts of the sub-agent pipeline.

## Sub-agent ownership

- **Writer** writes reports: full synthesis, partial results, checkpoints. Each report answers the original user prompt or marks progress.
- **Verifier** annotates, corrects in-place, and writes standalone verification notes. Corrections are applied directly to the report (not as separate commentary).
- **Janitor** evaluates reports for staleness and may propose archival to `.trash/` based on age alone (no structured research needs).
- **Searcher** does not write here — outputs raw evidence packets inline to the orchestrator.

## Operations

- Reports are **read-write**: Writer creates, Verifier corrects in-place. Janitor may archive.
- Each report must have a clear `type` and `scope` in the body or frontmatter.
- Evidence-bearing claims must cite source paths (raw copy or Root Vault).
- Verification failures are documented, not hidden.
- Partial results must be labeled as such.
- Janitor evaluates staleness by comparing `updated:` dates against current date — no tendency detection or structured needs analysis.

## Report types

| Type | When | Who |
|---|---|---|
| `synthesis` | Full answer to a user prompt | Writer |
| `evidence_packet` | Raw evidence from Searcher handoff | Searcher → Writer |
| `checkpoint` | Partial progress during long routes | Writer |
| `verification` | Claim/path/index verification | Verifier |
| `maintenance` | Index repair, stale audit, cleanup proposal | Verifier / Janitor |

## Conventions

- Filenames: descriptive-snake-case.md
- Report bodies are Markdown. Use Obsidian wikilinks for workspace references.
- If a report cites a claim that Verifier could not verify, mark it explicitly.

## See also

- [[AGENTS]] — orchestrator playbook (Writer dispatch, Verifier dispatch)
- [[.trash/AGENTS]] — archival destination for stale reports
