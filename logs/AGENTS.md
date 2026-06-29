---
type: directory_guidance
scope: logs/
description:
  - Session activity records and historical user request logs.
  - Active logs track startup sessions, user requests, and orchestrator-level events.
  - Historical logs (pre-memory-migration) are archived in .spinosa/archive/.
connects_to:
  - AGENTS.md
  - .spinosa/archive/
  - .spinosa/memory/
created: 2026-06-29
updated: 2026-06-29
---

# logs — Session Activity Records

Session-level activity records. These are plain Markdown files written by the orchestrator and read for session continuity.

## Operations

- The orchestrator appends to `user_requests.md` at session start (historical).
- `orchestrator-notes.md` lives in `.spinosa/memory/` — not here.
- Pre-memory-migration records are in `.spinosa/archive/`.

## Conventions

- Filenames: descriptive-kebab-case.md
- One entry per session with date, prompt, and outcome.
- Archived files use date-stamped names (e.g., `user_requests_20260628.md`).
