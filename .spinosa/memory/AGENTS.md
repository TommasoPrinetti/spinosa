---
type: directory_guidance
scope: .spinosa/memory/
description:
  - Orchestrator-owned working memory for session context.
  - The orchestrator reads and updates its notepad based on the user request.
connects_to:
  - AGENTS.md
created: 2026-06-28
---

# .spinosa/memory — Orchestrator's Notepad

This directory holds the orchestrator's private working memory.

## File

- `orchestrator-notes.md` — A holistic markdown notepad. The orchestrator
  reads this at the start of a session to understand project context and
  past decisions, then updates it with new context, outcomes, and lessons
  as the session progresses.

## Write rules

- **Orchestrator only.** No sub-agent writes to memory.
- Content is freeform — whatever the orchestrator finds useful for future
  sessions: session summaries, key decisions, blockers, resume hints.
- No secrets, credentials, raw command logs, or source excerpts.
