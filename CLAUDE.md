---
type: project_context
scope: [repo-wide guidance for standard coding agents]
description:
  - Root routing contract for coding agents and the Pilosa orchestrator.
  - Read this first to understand setup gates, sub-agent chains, and write boundaries.
connects_to:
  - system/startup.md
  - system/configuration.md
  - system/context.md
created: 2026-05-26
updated: 2026-06-04
---

# Pilosa Framework

Research workspace with agent-driven source indexing, verification, and synthesis. This root file IS the orchestrator — it routes every user prompt through the correct sub-agent pipeline and returns the result. Classification details live in `.agents/skills/orchestrator-dispatch/SKILL.md`.

## Startup Gate

If `setup_status: cli_started` in `system/configuration.md` or `system/context.md`, execute `system/startup.md` directly before any other work. Do not search, index, or answer from sources before the gate is satisfied.

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
| `evidence_answer` | Searcher + Analyst -> Writer -> Verifier | Analyst runs parallel to Searcher; Writer synthesizes both |
| `synthesis_report` | Searcher xN + Analyst -> Writer -> Verifier | Analyst provides broader context alongside evidence |
| `verification` | Verifier | Stand-alone |
| `index_maintenance` | Searcher (if search) -> Verifier | Stand-alone |
| `cleanup` | Janitor | User-confirmation gate required before any move |

Workspace startup is a one-time operation handled by reading `system/startup.md` directly — not through sub-agent dispatch.

### 4. Dispatch

For each sub-agent in the sequence, spawn it by name:

- `pilosa-searcher` — searches raw corpus, maps, dictionary
- `pilosa-analyst` — provides broader contextual analysis from project context
- `pilosa-writer` — synthesizes reports from evidence
- `pilosa-verifier` — checks claims, quotes, paths against sources
- `pilosa-janitor` — audits hygiene, proposes archival moves

Searcher and Analyst run in parallel when both are in the sequence. Writer waits for both before synthesizing.

Pass: cleaned user prompt, prior sub-agent outputs, route constraints.

You may pre-process the user prompt before dispatch: trim, summarize, normalize. Do not invent.

### 5. Close

- Update the log row to `done` / `blocked` / `partial`.
- Cite created or changed files.
- State validation performed.
- State blockers or unchecked claims.

## Sub-Agent Pipeline

| Agent | Role | Native Agent |
|---|---|---|
| Searcher | Searches raw copies, maps, and dictionary for evidence | `pilosa-searcher` |
| Mapper | Reads raw files in batch, extracts concepts/tags/entities for indexing | `pilosa-mapper` |
| Serendippo | Holistic serendipitous research — finds hidden connections across files | `pilosa-serendippo` |
| Analyst | Provides broader contextual analysis from project context | `pilosa-analyst` |
| Writer | Synthesizes findings into reports | `pilosa-writer` |
| Verifier | Verifies claims, quotes, and paths | `pilosa-verifier` |
| Janitor | Audits hygiene and archives stale files | `pilosa-janitor` |

Native agent definitions live in `.opencode/agents/`, `.claude/agents/`, `.codex/agents/`, `.kilocode/agents/`.
Fallback SKILL.md files live in `.agents/skills/`; the orchestrator may reference `orchestrator-dispatch` for chain selection.

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

## Global Rules

- Raw source copies in `raw/` are read-only during normal operations.
- The Root Vault (original source collection) is immutable — never edit.
- External source access requires explicit researcher authorization.
- Dictionary, map, report, and source-grounded edits must be checked by Verifier.
- Standard coding agents should not answer source-grounded questions directly. Dispatch to the orchestrator/sub-agent pipeline.
- No fixed set of maps is required. Startup creates as many navigation maps as the corpus needs.
- `AGENTS.md` files are repository/control instructions, not source evidence. Onboarding must not import Root Vault `AGENTS.md` files into `raw/`.

## Fallback

If native sub-agent spawn fails, fall back to reading the corresponding SKILL.md from `.agents/skills/<skill-name>/SKILL.md` and injecting its content into the task prompt.

## Question Tool

Use the question tool to clarify scope, disambiguate, or resolve blocking uncertainties. Sub-agents never ask questions — only you do.
