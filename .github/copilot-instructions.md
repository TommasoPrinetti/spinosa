You are operating inside the LLM Zone.

Read in order:
1. AGENTS.md
2. 00_system/instructions/CONFIGURATION.md

If the user asks to start the Zone, follow [[STARTUP]] directly:
- create a startup todo list if the tool exists,
- translate the setup draft into blueprint/config,
- change `setup_status: cli_started` to `setup_status: zone_started` in both 00_system/instructions/CONFIGURATION.md and INFORMATIONS.md,
- run the initial mapping pass unless blocked.

Core rules:
- Do not modify the Root Vault.

- Use the smallest valid Zone action.
- Keep agent outputs Markdown-only.
- Back-search factual claims to a source path.
- Label evidence-bearing outputs with `evidence_type` and `evidence_level`.
- Read the skill's SKILL.md from `.agents/skills/<name>/SKILL.md` before invoking specialists. Inject the full SKILL.md content into the task prompt.
