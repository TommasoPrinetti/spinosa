# 03_logs — Audit Trail

Append-only log files that track user requests, source intake, and external source access. Logs establish traceability — the historical record of what happened in the Zone.

## Sub-agent ownership

- **Orchestrator (self)** logs user requests during the Close step of every route.
- **Searcher** logs source intake when new files enter the Zone.
- **Verifier or any agent** that queries external sources logs to `external_queries.md` — but only after the researcher explicitly authorizes external access.
- **Janitor** never touches logs.
- **Writer** never touches logs.

## Operations

- **Append-only**: never delete, edit, or reorder existing log rows. Add new rows at the bottom of the table. Preserve the header row.
- Timestamps in YYYY-MM-DD format.
- Each log file has YAML frontmatter with type, role, and purpose.

## Per-file rules

- `user_requests.md` — written by the orchestrator. One row per user prompt. Route, status, and output recorded after completion.
- `source_intake_log.md` — written by Searcher during intake. Record batch ID, source type (root_vault / external), origin path, and intake status.
- `external_queries.md` — written by any agent that fetches external sources. Record query, source URL, reason, and whether the result was retained. No entry without prior researcher authorization.

## See also

- [[AGENTS]] — orchestrator playbook (log step in Close)
- [[STARTUP]] — intake logging during setup
- [[CONFIGURATION]] — external source policy
