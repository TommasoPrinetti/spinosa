# Agents & Pipeline

Spinosa routes every prompt through one of two paths:
- `fast_path` for direct operational answers
- `non-fast-path` for orchestrated artifact-based work

For every `non-fast-path` request, the orchestrator writes a goal artifact first, freezes the chain, and then dispatches agents sequentially file-to-file. This page shows the current user-facing model.

## The agents at a glance

| Agent | Job | When it runs |
|---|---|---|
| **Mapper** | Builds navigation maps during initial setup | Startup only |
| **Searcher** | Finds relevant passages in your documents | In non-fast-path chains that need evidence |
| **Analyst** | Adds broader context and alternative angles | When the frozen chain explicitly includes it |
| **Serendippo** | Finds hidden connections across documents | When the frozen chain explicitly includes it |
| **Writer** | Composes a user-facing answer report | Only when the chain needs a report |
| **Verifier** | Checks substantive claims against original files | When claims, citations, or quotes need truth-checking |
| **Janitor** | Audits workspace health and cleans stale files | On cleanup routes |
| **Evaluator** | Audits the completed non-fast-path route | After the Phase A terminal artifact reaches its checking state |
| **Evolver** | Applies tightly scoped framework follow-up edits | Only when the Evaluator recommends an edit |

## Routing model

Not every question uses agents. The orchestrator now uses a two-way split:

| Route | What happens |
|---|---|
| `fast_path` | The question is answered directly without a goal artifact or Phase A chain |
| `non-fast-path` | The orchestrator writes a goal artifact, freezes the chain, then dispatches agents sequentially |

## Typical non-fast-path shapes

The chain is chosen per request and frozen once the goal artifact is written.

| Request shape | Typical chain |
|---|---|
| Evidence-grounded answer | Goal Artifact → Searcher → Writer → Verifier |
| Evidence-grounded answer with broader context | Goal Artifact → Searcher → Analyst → Writer → Verifier |
| Hidden-connection exploration | Goal Artifact → Searcher → Serendippo → Writer → Verifier |
| Re-indexing or extraction maintenance | Goal Artifact → Mapper → Searcher → Writer → Verifier |
| Cleanup audit | Goal Artifact → Janitor |

Repeated agents are allowed when the goal artifact declares them up front. The orchestrator does not append, skip, or parallelize Phase A steps after freezing the chain.

## What each agent does

### Searcher

The Searcher is the evidence hunter. It:
1. Checks the dictionary for the right search terms
2. Reads navigation maps to find which files are relevant
3. Searches your document folder for matching passages
4. Writes an evidence packet with quotes, file paths, and confidence levels

**What it produces:** `agent_reports/evidence_packet.md` — a file with evidence quotes organized by source.

### Analyst

The Analyst does not search files directly. It:
1. Reads your project context and the dictionary
2. Reads any earlier artifacts the frozen chain produced
3. Suggests broader themes, missing angles, and alternative framings
4. Flags what a search-only approach might miss

**What it produces:** A contextual analysis packet that later steps read by file path.

### Serendippo

The Serendippo agent roams freely through your documents looking for unexpected connections:
- A concept that appears differently across document groups
- A participant whose perspective changes over time
- Similar responses from different groups on the same topic
- Ideas expressed differently in different languages

**What it produces:** A serendipity report with discovered connections and proposed map updates.

### Writer

The Writer creates a user-facing answer report when the frozen chain calls for one. It:
1. Reads the prior artifacts named in the goal file
2. Incorporates evidence and any broader context
3. Numbers the report sequentially (`00_first-report.md`, `01_followup.md`)
4. Adds a navigation dashboard showing how the answer was built

**What it produces:** A numbered report in `agent_reports/` with Answer, Evidence, Analysis, Limitations, and Sources sections.

### Verifier

The Verifier is the quality gate. It:
1. Reads the substantive artifact that needs checking
2. For each claim, finds the original source file when source grounding is required
3. Compares the quote or claim against the original text
4. Marks each claim: verified, corrected, unsupported, contradicted, or unresolved
5. Updates the artifact status when a status block exists

**What it produces:** The same artifact with updated verification state — usually `✓ verified`, `⚠ corrections`, or `✗ failed`.

### Mapper

The Mapper runs during initial setup (startup). It:
1. Reads files in batches of 10-15
2. Extracts a summary, key passages, concept signals, and connections for each
3. Writes navigation maps: a structural overview, per-group maps, and cross-cutting theme maps

**What it produces:** Maps in the `maps/` folder and extraction packets in `agent_reports/`.

### Janitor

The Janitor audits workspace health:
1. Scans for stale files and broken links
2. Proposes cleanup moves to `.trash/`
3. Writes a cleanup artifact
4. Presents a report you must confirm before any file is moved

**What it produces:** A hygiene report with a health score gauge and proposed moves.

### Evaluator

The Evaluator runs after every non-fast-path route finishes Phase A. It:
1. Reads the original prompt, goal artifact, frozen chain, and produced files
2. Audits the route as a process
3. Decides whether the framework needs a tightly scoped follow-up edit

**What it produces:** A route audit report with either `no_edit` or `edit_recommended`.

### Evolver

The Evolver runs only when the Evaluator recommends an edit. It:
1. Reads the audit report
2. Applies the smallest safe control-file or behavior-doc change
3. Leaves the current answer unchanged and affects only future requests

**What it produces:** A narrowly scoped evolution report and any justified framework edits.

## How agents hand off work

Agents don't pass content to each other directly. On non-fast-path routes, the orchestrator writes the goal artifact first, then agents write files and pass file paths:

```
Orchestrator writes goal artifact
          │
          ▼
Phase A agent writes artifact A
          │
          ▼
Phase A agent writes artifact B
          │
          ▼
Writer writes report when needed
          │
          ▼
Verifier checks substantive artifact when needed
          │
          ▼
Evaluator audits the route
          │
          ▼
Evolver runs only if an edit is recommended
```

Process files such as evidence packets and extraction batches are moved to `.trash/` after the route completes. Final reports and Phase B audit artifacts stay in `agent_reports/`.

## Session metrics

Every agent logs one compact row to `logs/session_metrics.tsv` when it finishes work. This includes counts of files read, maps accessed, and reports written. No content, no secrets — just operational numbers for tracking.

## Skills (fallback mode)

If the orchestrator can't dispatch a native agent, it reads a fallback skill file — a SKILL.md containing the same instructions in a self-contained format. Skills mirror the agents they back up and live in `.agents/skills/`.
