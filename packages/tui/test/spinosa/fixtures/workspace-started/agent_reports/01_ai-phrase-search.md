# AI Phrase Search — Verified Negative Result

## TL;DR

The workspace contains **no phrases related to AI**. A full-corpus search for `ai`, `artificial intelligence`, `machine learning`, `neural`, `llm`, and `model` returned only three incidental `ai` substrings inside metadata or meta-artifact text, not corpus content.

## What was searched

| Path | Files | Result |
|------|-------|--------|
| `raw/` | 1 (`sample-a.md`) | no match |
| `maps/` | 1 (`corpus_overview.md`) | no match |
| `system/` | 3 (`workspace_index.md`, `context.md`, `configuration.md`) | no match |

Coverage: 100% of approved non-meta paths. `workspace_index.md` confirms 2/2 corpus files read, status `complete`.

## Patterns tested

- `(?i)\bai\b` (word-boundary `ai`, excluding suffixes like `-lida` and substrings like `Remaining`, `chain`, `main`)
- `(?i)artificial intelligence`
- `(?i)machine learning`
- `(?i)neural`
- `(?i)llm`
- `(?i)model`

## Hits, accounted for

| File | Snippet | Why not a real hit |
|------|---------|--------------------|
| `system/workspace_index.md:16` | `Remaining: 0` | `ai` is a substring of `Remaining` |
| `system/configuration.md:3` | `preferred_llm_cli: opencode` | config key naming the host CLI, not AI content |
| `agent_reports/g_20260701-fixture.md:17` | `## Planned Chain` | meta-artifact, not corpus |
| `agent_reports/g_20260702-174add2d.md` | prompt echo, success criteria, `Planned Chain` | meta-artifact, not corpus |

## Why this is trustworthy

- Workspace explicitly self-describes as a fixture: `system/context.md` reads *"Fixture research workspace for automated TUI tests."*
- Corpus files contain only stubs (`"Sample A — Fixture corpus file A."`, `"Fixture navigation hub."`).
- The search used word-boundary and full-phrase patterns to avoid false positives.

## Where to look next (if a real answer is needed)

- Replace or extend `raw/` with topical corpus files and re-run the search.
- This evidence packet (`agent_reports/evidence_packet_20260702-174add2d.md`) lists every path scanned and is the canonical record.

## Sources

- `agent_reports/evidence_packet_20260702-174add2d.md`
- `agent_reports/analysis_20260702-174add2d.md`
- `system/workspace_index.md`
- `system/configuration.md`
- `system/context.md`
- `raw/sample-a.md`
- `maps/corpus_overview.md`
