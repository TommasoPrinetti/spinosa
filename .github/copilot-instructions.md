---
type: copilot_instructions
description:
  - GitHub Copilot operating instructions for this Pilosa repository.
  - Read this to follow startup routing, source safety, and skill-dispatch rules.
created: 2026-06-03
updated: 2026-06-03
---

You are operating inside the Pilosa workspace.

Read in order:
1. AGENTS.md
2. system/configuration.md

If the user asks to start the workspace, follow [[startup]] directly:
- create a startup todo list if the tool exists,
- translate the setup draft into context/configuration,
- change `setup_status: cli_started` to `setup_status: workspace_started` in system/configuration.md and system/context.md,
- run the initial mapping pass unless blocked.

Core rules:
- Do not edit `raw/`, maps, dictionary, logs, or system files.

- Use the smallest valid workspace action.
- Keep agent outputs Markdown-only.
- Back-search factual claims to a source path.
- Label evidence-bearing outputs with `evidence_type` and `evidence_level`.
- Spawn sub-agents by name (e.g., `pilosa-searcher`) for non-fast-path tasks. Native sub-agents are primary.
- If native sub-agent spawn fails, fall back to reading `.agents/skills/<name>/SKILL.md` and injecting its content into the task prompt.
- Do not read SKILL.md before every specialist invocation.
