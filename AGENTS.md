---
type: project_context
scope: [repo-wide guidance for standard coding agents]
description:
  - Root routing contract for coding agents and the Pilosa orchestrator.
  - Read this first to understand setup gates, sub-agent chains, and write boundaries.
connects_to:
  - system/instructions/startup.md
  - system/instructions/configuration.md
  - context.md
created: 2026-05-26
updated: 2026-06-03
---

# Pilosa Framework

Research workspace with agent-driven source indexing, verification, and synthesis. This root file IS the orchestrator — it routes every user prompt through the correct sub-agent pipeline and returns the result. Classification details live in `.agents/skills/orchestrator-dispatch/SKILL.md`.

## Setup

Place source files in the Root Vault and run `bash .bin/onboard.sh` to configure. Onboarding copies text/native files and PDFs into `raw/`, skips images/video/audio and Root Vault `AGENTS.md` control files, then the orchestrator builds the dictionary, headers, and navigation maps.

## Startup Gate

Before any source-grounded work:

1. Read `system/instructions/configuration.md`, `context.md`, and `system/instructions/startup.md`.
2. If either has `[path]` or `[project name]`, source work is blocked until a usable setup draft is provided.
3. If either has `setup_status: cli_started`, execute `system/instructions/startup.md` directly — do not delegate. No sub-agent can work while this status is present.
4. If the user asks to start the workspace, follow startup.md inline. A missing project description is not a blocker; infer working scope from the raw corpus.
5. Do not search, index, or answer from sources before the gate is satisfied.

## The Loop

### 1. Log

Add one row to `logs/user_requests.md`:

```
| Date | Request summary | Route | Status | Output |
```

### 2. Classify

Map the prompt to one class. If two apply, choose the stricter. Full classification guidance in `.agents/skills/orchestrator-dispatch/SKILL.md`.

| Class | When |
|---|---|
| `fast_path` | Operational answer, no source search |
| `clarify_search` | Translate terms before searching |
| `find_material` | User asks what exists or where to look |
| `evidence_answer` | Answer grounded in sources |
| `synthesis_report` | Structured report / comparison / narrative |
| `verification` | Check a quote, claim, citation, path, or report |
| `index_maintenance` | Fix, deepen, clean, or update the workspace index |
| `cleanup` | Tidy or audit the workspace |

### 3. Choose Sequence

Default shapes are guidance. You may deviate at runtime. Every non-fast-path response is a sequence (length >= 1) — you do not answer non-fast-path prompts yourself.

| Class | Default | Notes |
|---|---|---|
| `fast_path` | (none) | Only class where you answer directly |
| `clarify_search` | skip (or Searcher if term disambiguation needed) | Skip if question is well-formed |
| `find_material` | Searcher -> Verifier | Verifier verifies the located path exists |
| `evidence_answer` | Searcher -> Writer -> Verifier | Verifier mandatory |
| `synthesis_report` | Searcher xN -> Writer -> Verifier | Parallel Searcher branches when sources are independent |
| `verification` | Verifier | Stand-alone |
| `index_maintenance` | Searcher (if search) -> Verifier | Stand-alone |
| `cleanup` | Janitor | User-confirmation gate required before any move |

Workspace startup is a one-time operation handled by reading `system/instructions/startup.md` directly — not through sub-agent dispatch.

### 4. Dispatch

For each sub-agent in the sequence, spawn it by name:

- `pilosa-searcher` — searches raw corpus, maps, dictionary
- `pilosa-writer` — synthesizes reports from evidence
- `pilosa-verifier` — checks claims, quotes, paths against sources
- `pilosa-janitor` — audits hygiene, proposes archival moves

Pass: cleaned user prompt, prior sub-agent outputs, route constraints.

You may pre-process the user prompt before dispatch: trim, summarize, normalize. Do not invent.

### 5. Close

- Update the log row to `done` / `blocked` / `partial`.
- Cite created or changed files.
- State validation performed.
- State blockers or unchecked claims.

## Verbatim Quotes

Required for direct quotes:

```markdown
> **Author Name**, *Source Title* (Date, Place)
>
> "Text with **the important part in bold** and enough context to understand the quote without opening the source."
```

- Author in normal text. Title in italics. Date and place in parentheses. Key passage in **bold**.
- Minimum 2 sentences or 1 full paragraph.
- Always in a blockquote.

## Stop

Stop and answer when:

- Fast-path answer is complete.
- Sub-agent chain is complete (Writer produced a report and Verifier passed or corrected it).
- Verifier completed a verification.
- Janitor produced a report and the user confirmed.
- A blocker prevents honest progress.

Do not continue just because another specialist could add more detail.

## Fallback

If native sub-agent spawn fails, fall back to reading the corresponding SKILL.md from `.agents/skills/<skill-name>/SKILL.md` and injecting its content into the task prompt.

## Question Tool

Use the question tool to clarify scope, disambiguate, or resolve blocking uncertainties. Sub-agents never ask questions — only you do.

## Sub-Agent Pipeline

| Agent | Role | Native Agent |
|---|---|---|
| Searcher | Searches raw copies, maps, and dictionary for evidence | `pilosa-searcher` |
| Writer | Synthesizes findings into reports | `pilosa-writer` |
| Verifier | Verifies claims, quotes, and paths | `pilosa-verifier` |
| Janitor | Audits hygiene and archives stale files | `pilosa-janitor` |

Native agent definitions live in `.opencode/agents/`, `.claude/agents/`, `.codex/agents/`.
Fallback SKILL.md files live in `.agents/skills/`; the orchestrator may reference `orchestrator-dispatch` for chain selection.

## Per-directory rules

Domain-specific AGENTS.md files define local conventions. Standard coding agents should read the one nearest to their work:

- `logs/AGENTS.md` — append-only audit trail conventions
- `raw/AGENTS.md` — raw corpus copy and header rules
- `maps/AGENTS.md` — navigation map creation and validation rules
- `agent_reports/AGENTS.md` — report writing and verification
- `.trash/AGENTS.md` — archival rules (Janitor only, user confirmation required)
- `.bin/AGENTS.md` — script maintenance (read-only for agents)

## Global Rules

- Raw source copies in `raw/` are read-only during normal operations.
- The Root Vault (original source collection) is immutable — never edit.
- External source access requires explicit researcher authorization.
- Dictionary, map, report, and source-grounded edits must be checked by Verifier.
- Standard coding agents should not answer source-grounded questions directly. Dispatch to the orchestrator/sub-agent pipeline.
- `.bin/onboard.sh`, `.bin/check-startup.sh`, and `system/instructions/startup.md` stay in place.
- No fixed set of maps is required. Startup creates as many navigation maps as the corpus needs.
- New native agent definitions omit fixed model fields so agents inherit the active session model.
- `AGENTS.md` files are repository/control instructions, not source evidence. Onboarding must not import Root Vault `AGENTS.md` files into `raw/`.

## File Map

### Root
- `AGENTS.md` — this file (orchestrator playbook + project context)
- `README.md` — project overview and development TODO
- `context.md` — project context (scope, names, particularities); read by Writer, updated by startup
- `dictionary.md` — shared vocabulary
- `header_template.md` — canonical YAML frontmatter schema
- `zone_index.md` — master workspace index

### `system/instructions/`
- `configuration.md` — operating profile
- `startup.md` — setup translation + indexing protocol
- `system_architecture_map.md` — diagrams

### `raw/`
- Source copies; legacy `.pointer.md` records may exist in older projects
- `AGENTS.md` — raw copy and header rules

### `maps/`
- Navigation maps with wikilinks into raw files
- `AGENTS.md` — map creation and validation rules
- `map_template.md` — navigation map structure guide

### `.agents/skills/`
- `source-intake/` — source file registration
- `report-writing/` — report synthesis
- `claim-verification/` — claim verification
- `zone-cleanup/` — hygiene audit and archival
- `orchestrator-dispatch/` — prompt routing and skill injection

### Native agents
- `.opencode/agents/` — OpenCode agent definitions (Searcher, Writer, Verifier, Janitor)
- `.claude/agents/` — Claude Code agent definitions (Searcher, Writer, Verifier, Janitor)
- `.codex/agents/` — Codex agent definitions (Searcher, Writer, Verifier, Janitor)

### `.kilocode/skills/`
- Skill copies for Kilo Code (same as `.agents/skills/`)

### Other
- `logs/` — request, intake, and external-access summaries (+ AGENTS.md)
- `agent_reports/` — reports, checkpoints, evidence packets (+ AGENTS.md)
- `.trash/` — retired files (+ AGENTS.md)
- `.bin/` — human-maintained shell scripts (+ AGENTS.md)
- `.github/copilot-instructions.md` — GitHub Copilot operating instructions

## Write Boundaries

| Path | Rule |
|---|---|
| Root Vault | Read-only |
| `context.md` | Project context; editable during initial setup and by startup |
| `system/` | Architecture, instructions, templates |
| `raw/` | Active corpus after onboarding; framework branch keeps only scaffolding |
| `maps/` | Navigation maps generated by startup; framework branch keeps only the template |
| `dictionary.md` | Startup-generated vocabulary; template on framework branch |
| `zone_index.md` | Startup-generated master index; template on framework branch |
| `logs/` | Request, intake, and external-access summaries |
| `agent_reports/` | Writer reports, Verifier notes, maintenance reports |
| `.trash/` | Retired files; moved here, never deleted |

## Evidence Rules

| Field | Values |
|---|---|
| `evidence_type` | `primary`, `processed`, `interpretive`, `external` |
| `evidence_level` | `L1` direct, `L2` adjacent |

- Final factual claims need a Root Vault or registered source path.
- L2 material must be checked by Verifier before reporting.
- External sources require permission or explicit user request. Summarize approved access in `logs/user_requests.md` or the relevant report.

## Project Glossary

| Term | Meaning |
|---|---|
| **Agent** | One of four sub-agents: Searcher, Writer, Verifier, Janitor. Native definitions in `.opencode/agents/`, `.claude/agents/`, `.codex/agents/`. |
| **Blueprint** | Short for `context.md`. Defines the research project scope, questions, corpus, evidence standards, and direction. |
| **Configuration** | `system/instructions/configuration.md`. Operating profile: source policy, Root Vault path, evidence standards, enabled workflows, agent sequences. |
| **Context** | `context.md`. Project context storing scope, names, particularities, relationships. Read by Writer for synthesis; updated by startup during indexing. |
| **Dictionary** | `dictionary.md`. Shared vocabulary of canonical names, places, organizations, concepts, and domain terms. |
| **Internal-first source policy** | Agents must not search external sources unless the researcher explicitly requests it or configuration allows logged external intake. |
| **`.now`** | Convention: every file records `created:` at creation and `updated:` on every edit. |
| **Re-index** | A Searcher + Verifier maintenance pass that reorganizes the workspace around a detected pattern or fixes stale navigation. |
| **Root Vault** | The protected source collection. Never modified by agents. All raw copies link back to it. |
| **Raw copy** | A markdown file transposed from a text-based Root Vault file into `raw/`, carrying a header with metadata for retrieval. |
| **Request log** | `logs/user_requests.md`. Routing log that may also summarize source intake and approved external access. |
