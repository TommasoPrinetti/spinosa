---
type: directory_guidance
scope: logs/
description:
  - Rules for the lightweight request and routing log.
  - Agents append request, intake, and external-access summaries here when traceability is needed.
connects_to:
  - AGENTS.md
  - logs/user_requests.md
  - system/instructions/configuration.md
created: 2026-06-03
updated: 2026-06-03
---

# logs — Request Trail

Append-only request trail for user prompts, source intake summaries, external access decisions, and route outcomes.

## Sub-agent ownership

- **Orchestrator (self)** logs user requests during the Close step of every route.
- **Searcher** records source intake summaries in `user_requests.md` when new files enter the workspace.
- **Verifier or any agent** that queries external sources records the authorization and result in `user_requests.md` and the relevant report.
- **Janitor** never touches logs.
- **Writer** never touches logs.

## Operations

- **Append-only**: never delete, edit, or reorder existing log rows. Add new rows at the bottom of the table. Preserve the header row.
- Timestamps in YYYY-MM-DD format.
- `user_requests.md` has YAML frontmatter with type, role, and purpose.

## Per-file rules

- `user_requests.md` — written by the orchestrator. One row per user prompt. Route, status, and output recorded after completion.
- Source intake rows use route `source_intake` and include batch/source location in the output field.
- External access rows use route `external_access` and must name the user authorization and retained output.

## See also

- [[AGENTS]] — orchestrator playbook (log step in Close)
- [[startup]] — intake logging during setup
- [[configuration]] — external source policy
