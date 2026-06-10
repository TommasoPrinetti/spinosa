---
type: directory_guidance
scope: system/
description: Architecture, instructions, templates, and project context files.,Read this when consulting system-level configuration or context.
connects_to:
  - AGENTS.md
created: 2026-06-03
updated: 2026-06-04
---

# system — Architecture & Context

Core system files that define how Spinosa operates. All other directories depend on these.

## Contents

| File                         | Purpose                                                                                   |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| `context.md`                 | Project context: scope, names, particularities. Read by Writer; updated by startup.       |
| `configuration.md`           | Operating profile: source policy, source location, evidence standards, enabled workflows. |
| `startup.md`                 | Workspace indexing protocol (read by orchestrator).                                       |
| `dictionary.md`              | Shared vocabulary of canonical names, places, organizations, concepts.                    |
| `yaml_header_template.md`    | Canonical YAML frontmatter schema for raw copies.                                         |
| `workspace_index.md`         | Master workspace index (generated at startup).                                            |
| `system_architecture_map.md` | Diagrams and cross-reference tables.                                                      |

## Rules

- These files are the source of truth for system behavior.
- `context.md` and `configuration.md` are editable during initial setup and by startup.
- `startup.md` and `system_architecture_map.md` are framework reference — not edited by agents during normal operations.
- `dictionary.md`, `yaml_header_template.md`, and `workspace_index.md` are generated at startup; framework branch keeps templates only.

## See also

- [[AGENTS]] — orchestrator playbook
