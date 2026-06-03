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
2. system/instructions/configuration.md

If the user asks to start the workspace, follow [[startup]] directly:
- create a startup todo list if the tool exists,
- translate the setup draft into blueprint/config,
- change `setup_status: cli_started` to `setup_status: zone_started` in both system/instructions/configuration.md and information.md,
- run the initial mapping pass unless blocked.

Core rules:
- Do not modify the Root Vault.

- Use the smallest valid workspace action.
- Keep agent outputs Markdown-only.
- Back-search factual claims to a source path.
- Label evidence-bearing outputs with `evidence_type` and `evidence_level`.
- Read the skill's SKILL.md from `.agents/skills/<name>/SKILL.md` before invoking specialists. Inject the full SKILL.md content into the task prompt.
