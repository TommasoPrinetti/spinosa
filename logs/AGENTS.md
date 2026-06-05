---
type: directory_guidance
scope: logs/
description:
  - Rules for lightweight request logs and compact agent session metrics.
  - Append request, intake, external-access, and operation summaries here when traceability is needed.
connects_to:
  - AGENTS.md
  - logs/user_requests.md
  - logs/session_metrics.tsv
  - system/configuration.md
created: 2026-06-03
updated: 2026-06-04
---

# logs — Request Trail

Append-only request trail and compact operation memory for user prompts, source intake summaries, external access decisions, route outcomes, and agent activity counts.

## Sub-agent ownership

- **Orchestrator (self)** is the only actor that writes `user_requests.md`.
- **Sub-agents** may append compact count/path rows to `session_metrics.tsv`.
- **Sub-agents** return proposed `user_requests.md` summaries to the orchestrator when traceability is needed.
- **Source intake and external access routes** must include authorization/status details in the proposed log summary.
- `pilosa-janitor`, `pilosa-searcher`, `pilosa-verifier`, `pilosa-mapper`, and `pilosa-serendippo` may append only to `session_metrics.tsv`; they never edit `user_requests.md`.

## Operations

- **Append-only**: never delete, edit, or reorder existing log rows. Add new rows at the bottom of the table. Preserve the header row.
- Timestamps in YYYY-MM-DD format.
- `user_requests.md` has YAML frontmatter with type, role, and purpose.
- `session_metrics.tsv` is TSV without frontmatter so shell helpers can append and parse it safely.

## Per-file rules

- `user_requests.md` — written by the orchestrator. One row per user prompt. Route, status, and output recorded after completion.
- `session_metrics.tsv` — append-only operation ledger. Record counts and paths only; do not record raw command logs, long grep terms, source excerpts, secrets, or credentials.
- Source intake rows use route `source_intake` and include batch/source location in the output field.
- External access rows use route `external_access` and must name the user authorization and retained output.

## See also

- [[AGENTS]] — orchestrator playbook (log step in Close)
- [[startup]] — intake logging during setup
- [[configuration]] — external source policy
