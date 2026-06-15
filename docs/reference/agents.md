# Agents & Pipeline

Spinosa uses 7 specialized sub-agents. When you ask a question, the orchestrator selects a sequence of agents to handle it. This page shows who does what and in what order.

## The agents at a glance

| Agent | Job | When it runs |
|---|---|---|
| **Mapper** | Builds navigation maps during initial setup | Startup only |
| **Searcher** | Finds relevant passages in your documents | Every question |
| **Analyst** | Provides broader context and alternative angles | Alongside Searcher |
| **Serendippo** | Finds hidden connections across documents | After Searcher + Analyst |
| **Writer** | Composes a structured report from the evidence | After search is complete |
| **Verifier** | Checks every claim against the original files | After writing |
| **Janitor** | Audits workspace health and cleans stale files | On request |

## Pipeline: the sequence by question type

Not every question uses every agent. The orchestrator picks the right sequence:

| Type of question | Agents used |
|---|---|
| "What exists in my corpus?" or "How do I..." (fast path) | None — answered directly |
| "Find documents about X" | Searcher → Verifier |
| "What does the corpus say about X?" (evidence answer) | Searcher + Analyst → Serendippo → Writer → Verifier |
| "Give me a structured comparison of A vs B" | Searcher × multiple + Analyst → Serendippo → Writer → Verifier |
| "Check this quote: is it accurate?" | Verifier only |
| "Clean up my workspace" | Janitor only (requires your confirmation) |
| "Re-index the corpus" | Mapper → Verifier |
| "Find hidden connections" | Serendippo only |

Searcher and Analyst run at the same time (parallel). Writer waits for both to finish.

## What each agent does

### Searcher

The Searcher is the evidence hunter. It:
1. Checks the dictionary for the right search terms
2. Reads navigation maps to find which files are relevant
3. Searches your document folder for matching passages
4. Writes an evidence packet with quotes, file paths, and confidence levels

**What it produces:** `agent_reports/evidence_packet.md` — a file with evidence quotes organized by source.

### Analyst

The Analyst runs alongside the Searcher but doesn't search files directly. It:
1. Reads your project context and the dictionary
2. Suggests broader themes, missing angles, and alternative framings
3. Flags what a search-only approach might miss

**What it produces:** A contextual analysis note that the Writer incorporates into the report.

### Serendippo

The Serendippo agent roams freely through your documents looking for unexpected connections:
- A concept that appears differently across document groups
- A participant whose perspective changes over time
- Similar responses from different groups on the same topic
- Ideas expressed differently in different languages

**What it produces:** A serendipity report with discovered connections and proposed map updates.

### Writer

The Writer takes the evidence and context and composes a structured report. It:
1. Reads the evidence packet from the Searcher
2. Incorporates the Analyst's broader context
3. Numbers the report sequentially (`00_first-report.md`, `01_followup.md`)
4. Adds a navigation dashboard showing how the answer was built

**What it produces:** A numbered report in `agent_reports/` with Answer, Evidence, Analysis, Limitations, and Sources sections.

### Verifier

The Verifier is the quality gate. It:
1. For each claim in the report, finds the original source file
2. Compares the quote against the original text
3. Marks each claim: verified, corrected, unsupported, contradicted, or unresolved
4. Updates the report status

**What it produces:** The same report with updated status — `✓ verified`, `⚠ corrections`, or `✗ failed`.

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
3. Presents a report you must confirm before any file is moved

**What it produces:** A hygiene report with a health score gauge and proposed moves.

## How agents hand off work

Agents don't pass content to each other directly — they write files and pass file paths:

```
Searcher writes evidence_packet.md  ──┐
                                      ├──► Writer reads both ──► writes report
Analyst writes context note ──────────┘                            │
                                                                   ▼
                                                            Verifier checks report
                                                                   │
                                                                   ▼
                                                            Final verified report
```

Process files (evidence packets, extraction batches) are moved to `.trash/` after the report is verified. Only final reports stay in `agent_reports/`.

## Session metrics

Every agent logs one compact row to `logs/session_metrics.tsv` when it finishes work. This includes counts of files read, maps accessed, and reports written. No content, no secrets — just operational numbers for tracking.

## Skills (fallback mode)

If the orchestrator can't dispatch a native agent, it reads a fallback skill file — a SKILL.md containing the same instructions in a self-contained format. Skills mirror the agents they back up and live in `.agents/skills/`.
