---
type: project_context
scope: [repo-wide guidance for standard coding agents]
connects_to:
  - 00_system/instructions/STARTUP.md
  - 00_system/instructions/CONFIGURATION.md
  - INFORMATIONS.md
created: 2026-05-26
updated: 2026-06-02
---

# LLM Zone Framework

Research workspace with agent-driven source indexing, verification, and synthesis.

## Setup

Place source files in `raw/` (text) or add `.pointer.md` records for binary files (PDFs, images, audio). Run `bash .bin/onboard.sh` to configure, then tell the orchestrator agent to "start the Zone" to build the dictionary, headers, and navigation maps.

## Sub-agent pipeline

| Agent | Role | Native Agent |
|---|---|---|
| Orchestrator | Routes prompts, classifies, dispatches, answers fast-path | `pilosa-orchestrator` |
| Searcher | Searches raw copies and maps for evidence | `pilosa-searcher` |
| Writer | Synthesizes findings into reports | `pilosa-writer` |
| Verifier | Verifies claims, quotes, and paths | `pilosa-verifier` |
| Janitor | Audits hygiene and archives stale files | `pilosa-janitor` |

Native agent definitions live in `.opencode/agents/`, `.claude/agents/`, `.codex/agents/`.
Fallback SKILL.md files live in `.agents/skills/`.

## Per-directory rules

Domain-specific AGENTS.md files define local conventions. Standard coding agents should read the one nearest to their work:

- `raw/AGENTS.md` — corpus access, dictionary, maps, raw copy rules
- `03_logs/AGENTS.md` — append-only audit trail conventions
- `05_agent_reports/AGENTS.md` — report writing and verification
- `.trash/AGENTS.md` — archival rules (Janitor only, user confirmation required)
- `.bin/AGENTS.md` — script maintenance (read-only for agents)

## Global rules

- Raw source copies in `raw/` are read-only during normal operations.
- The Root Vault (original source collection) is immutable — never edit.
- External source access requires explicit researcher authorization.
- Dictionary and map edits must be verified by Verifier.
- Standard coding agents should not answer source-grounded questions — dispatch to sub-agents.

## File Map

### Root
- `AGENTS.md` — this file (project context for standard coding agents)
- `README.md` — project overview and development TODO
- `CONFIGURATION.md` — operating profile
- `INFORMATIONS.md` — research scope
- `dictionary.md` — shared vocabulary
- `zone_index.md` — master zone map

### `00_system/instructions/`
- `STARTUP.md` — setup translation + indexing protocol
- `CONFIGURATION.md` — operating profile (alias)
- `SYSTEM_ARCHITECTURE_MAP.md` — diagrams

### `raw/`
- Source copies and `.pointer.md` records
- `AGENTS.md` — corpus access rules

### `maps/`
- Navigation maps with wikilinks into raw files
- `MAP_TEMPLATE.md` — navigation map structure guide

### `.agents/skills/`
- `source-intake/` — source file registration
- `report-writing/` — report synthesis
- `claim-verification/` — claim verification
- `zone-cleanup/` — hygiene audit and archival
- `orchestrator-dispatch/` — prompt routing and skill injection

### Other
- `03_logs/` — request log, source intake, external queries (+ AGENTS.md)
- `05_agent_reports/` — reports, checkpoints, evidence packets (+ AGENTS.md)
- `.trash/` — retired files (+ AGENTS.md)
- `.bin/` — human-maintained shell scripts (+ AGENTS.md)

## Write Boundaries

| Path | Rule |
|---|---|
| Root Vault | Read-only |
| `INFORMATIONS.md` | Project scope; editable during initial setup |
| `00_system/` | Architecture, instructions, templates |
| `raw/` | Raw copies, source pointer records, central maps, dictionary, concept maps |
| `03_logs/` | Request log, source intake, external queries |
| `05_agent_reports/` | Writer reports, Verifier notes, maintenance reports |
| `.trash/` | Retired files; moved here, never deleted |

## Evidence Rules

| Field | Values |
|---|---|
| `evidence_type` | `primary`, `processed`, `interpretive`, `external` |
| `evidence_level` | `L1` direct, `L2` adjacent |

- Final factual claims need a Root Vault or registered source path.
- L2 material must be checked by Verifier before reporting.
- External sources require permission or explicit user request. Log in `03_logs/external_queries.md`.

## Project Glossary

| Term | Meaning |
|---|---|
| **Agent** | One of five sub-agents: Orchestrator, Searcher, Writer, Verifier, Janitor. Native definitions in `.opencode/agents/`, `.claude/agents/`, `.codex/agents/`. |
| **Blueprint** | Short for `INFORMATIONS.md`. Defines the research project scope, questions, corpus, evidence standards, and direction. |
| **Dictionary** | `dictionary.md`. Shared vocabulary of canonical names, places, organizations, concepts, and domain terms. |
| **Internal-first source policy** | Agents must not search external sources unless the researcher explicitly requests it or Zone configuration allows logged external intake. |
| **`.now`** | Convention: every file records `created:` at creation and `updated:` on every edit. |
| **Re-index** | A Searcher + Verifier maintenance pass that reorganizes the Zone around a detected pattern or fixes stale navigation. |
| **Root Vault** | The protected source collection. Never modified by agents. All raw copies link back to it. |
| **Raw copy** | A markdown file transposed from a text-based Root Vault file into `raw/`, carrying a header with metadata for retrieval. |
| **Source intake log** | `03_logs/source_intake_log.md`. Register of new Root Vault batches and retained external sources. |
| **Zone** | The writable, indexed, conceptually navigable map of the Root Vault. |
| **Zone Configuration** | `CONFIGURATION.md`. Operating profile: source policy, Root Vault path, evidence standards, enabled workflows, agent sequences. |
