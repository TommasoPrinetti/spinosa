---
type: startup_protocol
role: workspace_indexing_protocol
purpose: [build the dictionary, maps, and index from the raw corpus]
description:
  - Startup protocol executed directly by the orchestrator after onboarding.
  - Agents use it to build dictionary, maps, validation checks, and startup reports.
scope: [initial setup only]
connects_to:
  - AGENTS.md
created: 2026-05-28
updated: 2026-06-04
---

# startup.md — Workspace Indexing Protocol

This is the **protocol document** that defines what to do and how to do it. The **orchestrator** reads this file and executes the steps.
Use this file when the user asks to **start the workspace** or when setup files still contain placeholders.
Startup.md is the only authority that can mark setup complete. `.bin/check-startup.sh` is a developer-facing validation helper, not a separate user-facing setup path.

## What Onboarding Already Did

The CLI onboarding script (`bash .bin/onboard.sh`) has already:

- Collected project name, source location, and preferred LLM CLI
- Scanned the source corpus and copied accepted files into `raw/` (text, native-readable, PDFs)
- Populated partly `context.md` and `configuration.md` with `setup_status: cli_started`

**Startup does not repeat onboarding.** Startup takes the raw corpus and builds the workspace content: dictionary, content-grounded extraction packets, navigation maps, and validation.

## Mission

Your job is to:

1. **Verify onboarding completed** — confirm setup files exist and source location is valid
2. **Build the master dictionary** from corpus evidence
3. **Extract content-grounded fragments** from raw files
4. **Write multi-level navigation maps** that help future LLMs find relevant files by structure, concept, and key passage
5. **Cross-file synthesis** — identify theme threads that appear across groups
6. **Run startup validation and retrieval tests**

You can use `set_goal` function to pursue this mission.

## Non-Negotiable

- **Do not edit `raw/`.** Startup may write generated maps, dictionary, workspace index, context, configuration, and startup reports as part of setup.
- Treat `raw/` as the active working corpus after onboarding.
- Copy PDFs as-is when onboarding accepted them. Do not create pointer records for images, audio, or video; account for skipped media as uncovered source media.
- Treat every `AGENTS.md` file as repository/control instructions, not corpus evidence.
- Use the dictionary for consistent terminology across all outputs.
- Preserve generated-file provenance on maps and reports.
- Use Obsidian wikilinks for internal map references to raw copies, dictionaries, and maps.
- Put retrieval-critical terms in **YAML frontmatter** when useful because fast grep starts there.
- Put interpretation and context in the body.
- Do not ask questions directly. Produce a Disambiguation Brief only for blocking ambiguity.
- Treat machine artifacts as findable noise until verified.

## Required Startup Inputs

Mandatory initial reads:

1. `AGENTS.md`
2. [[configuration]]
3. [[context]]
4. [[header_template]]

On-demand reads:
- [[system_architecture_map]] only when architecture context is needed.

Project description and helpful artifact URLs are optional context. If absent, infer them from the working scope from the active raw corpus during mapping. External source policy defaults to `no`

---

# Phase 1 — Verify Onboarding

Quick verification that onboarding completed correctly. This phase should take under a minute.

## 1.1 Confirm Setup Files Exist

Read [[context]] and [[configuration]]. Check:

- `context.md` exists and has `setup_status: cli_started`
- `configuration.md` exists with `source_location` filled (not `[path]`)
- Source location directory exists on disk
- No blocking placeholders remain (`[path]`, `[project name]`)

---

# Phase 2 — Index, Map, Validate

## 2.1 Survey Active Corpus

Survey [[raw/]] as the active working corpus. For each raw directory:

1. List all files and subdirectories (skip `.DS_Store`, `AGENTS.md`, system files, empty dirs)
2. Note file types (`.md`, `.txt`, `.csv`, `.json`, etc.), count per type, approximate date range
3. Read a sample of raw copies to characterize the folder's content accurately
4. Record: source types, modality, names, dates, topics, keywords, gaps

Count **all** files in raw/ (not just `.md`):

```
find raw/ -type f -not -name ".DS_Store" -not -name "AGENTS.md" -not -name "INDEX.md" -not -name "REPO_GUIDE.md" -not -name ".gitkeep" | wc -l
```

Record this number as `TOTAL_FILES` in `workspace_index.md` under "Extraction Progress". Every subsequent step checks against this number.

Separately account for unsupported files and skipped media that remain only at the source location. Record media counts, extensions, and processing gaps in `workspace_index.md` and the startup report as source media coverage.

## 2.2 Build Dictionary And Extract Content-Grounded Fragments

**This is the core step.** One pass over the corpus that builds both the dictionary and extraction packets for navigation maps. No duplicate reading.

### Step 1: Spawn batches until all files are read

Split raw copies into batches and spawn `pilosa-mapper` sub-agents aggressively — as many as you can in parallel. Do not throttle. Spam sub-agents until every file is covered.

Each batch reads files and extracts:

**For the dictionary:**

1. **Names** — people, roles, named entities. Merge variants into canonical forms.
2. **Places** — geographic locations, sites, regions. Merge variants.
3. **Organizations** — institutions, groups, agencies. Merge abbreviations.
4. **Explicit source terms** — terms visibly present in the source text. Record source language and source files.
5. **Inferred concepts** — domain-specific ideas, theories, frameworks inferred from multiple source terms. Mark as inferred.
6. **Domain terms** — specialized vocabulary, acronyms, jargon used in the sources.
7. **Uncertain terms and metadata** — unresolved people, dates, places, or terms needing review.

**For content-grounded extraction (same pass):**

9. **One-paragraph summary** (3-5 sentences): what the file is about, what arguments it makes, what evidence it provides. Content-grounded — must reflect actual content.
10. **Key passages** (2-5): short quotes or close paraphrases with file path and line references.
11. **Concept signals** (2-5): which recurring concepts appear in this file. Use dictionary canonical terms.
12. **Connections**: which other files relate to the same concepts.

**Multilingual rule:** Keywords must appear in the language they were found in. If a source is in French, French keywords are recorded. If in English, English keywords. If a concept appears in multiple languages, list all language variants as aliases.

### Step 2: Accumulate results

After each batch completes:
1. Merge dictionary terms into the master dictionary
2. Append extraction packets to `agent_reports/extraction_checkpoint.md`
3. Update `workspace_index.md` "Extraction Progress" section
4. Track: `files_read / TOTAL_FILES`
5. Note which natural groups are emerging from the summaries

**Note**: sub-agents are preferred to write directly into .md files to keep their knowledge anchored.

**Arrival metric:** `files_read == TOTAL_FILES`. Continue spawning batches until every file has been read by at least one sub-agent.

### Step 3: Finalize dictionary

Write [[dictionary]] with accumulated canonical forms, aliases, explicit source terms, inferred concepts, uncertain terms, machine artifacts, languages, and source file references.

### Step 4: Enrich context

Use accumulated evidence to enrich [[context]]:

- **Methods**: Observe what the raw copies actually contain. Infer the research methods.
- **Source universe**: List the actual source types found, their languages, and approximate date ranges.
- **Research vocabulary**: Extract key actors, institutions, places, and concepts that appear repeatedly.

## 2.4 Write Navigation Maps

After all batches complete, write multi-level navigation maps from the extraction batches.

### Input

Read `agent_reports/extraction_batch_*.md` (all batches) for per-file summaries, key passages, and concept signals.

### Step 1: Understand the Structure

From accumulated extraction batches, identify the natural groups in the corpus. Do not assume exercises, cohorts, or any specific structure. Read the per-file summaries and determine what the organizing principle actually is. It might be exercises, topics, time periods, participants, or something else.

**Edge cases:**
- **Flat corpus** (no folder structure, no obvious grouping): treat all files as one group. The organizing principle is "flat corpus" or similar.
- **Monolithic corpus** (one large document or a few large files): treat sections, chapters, or logical divisions as groups.
- **Tiny corpus** (<10 files): one group is fine. Group maps may be thin — that's acceptable.
- **Single-topic corpus** (everything about one subject): one group with the topic as the organizing principle.

Record the identified groups and their organizing principle. This becomes the structural basis for all maps. If no natural groups emerge, create a single group containing all files.

### Step 2: Write Structural Overview

Write one map at the root of `maps/` (e.g., `maps/corpus_overview.md`). This is the Level 0 map.

For each natural group:
- 2-4 sentence description of what the group contains (synthesized from per-file summaries)
- File count
- Key file pointers (3-5 files that best represent the group)

### Step 3: Write Group Maps

For each natural group identified in Step 1 (skip this step if there is only one group and the structural overview already covers it adequately):

1. Create a subdirectory under `maps/` named for the organizing principle.
2. Write one map file per group.

**If there is only one group:** Write the group map at `maps/corpus_overview.md` directly (no subdirectory). The structural overview and the group map may be the same file for small or flat corpora.

Each group map contains:

- H2 "What this group is about" — synthesized understanding from reading files
- H2 "Recurring concepts" — patterns across files within the group, with key passages
- Each concept: description + examples with file path + line references + quote or paraphrase

### Step 4: Write Theme Maps

Identify concepts that recur across multiple groups. For each cross-cutting theme:

1. Create a subdirectory under `maps/` for themes.
2. Write one map file per theme.

**If no cross-cutting themes emerge** (single-topic corpus, flat corpus, or all files belong to one group): skip theme maps. The group map(s) already cover the entire corpus. Record in the startup report that no cross-cutting themes were found.

Each theme map contains:

- H2 with theme name + definition
- H3 per group where the theme appears + key passages
- H2 "Trajectory" — how the theme evolves across groups

### Step 5: Verify Coverage

Every file in the extraction checkpoint should appear in at least one map (group map or structural overview). If a file is missing from all maps, add it.

### Step 6: Spot-Check Accuracy

Pick 5 random key passages from across the maps. For each, verify that the quoted text exists at the cited line reference in the raw file. Record the spot-check result in the startup report.

### Arrival Metric

- One structural overview map at `maps/` root
- One subdirectory per organizing principle (skip if single group fits in the overview)
- One group map per natural group (or combined with overview for small/flat corpora)
- Theme maps for each cross-cutting concept (skip if no cross-cutting themes)
- Every file in extraction checkpoint appears in >=1 map
- Spot-check: >=4/5 passages verified accurate

## 2.5 Cross-File Synthesis

Cross-file synthesis is now part of Step 4 in section 2.4 (Write Theme Maps). Theme maps are the output of cross-file synthesis. If no cross-cutting themes emerge, cross-file synthesis is implicit in the group maps and serendipitous discovery.

## 2.6 Serendipitous Connection Discovery

**Dedicated step.** After maps are written (group maps and/or theme maps), spawn `pilosa-serendippo` to find hidden connections that batch processing misses.

### Purpose

The mapper agent reads files in structured batches — efficient but linear. The serendipa agent roams freely, following threads and finding connections that emerge from holistic reading, not just metadata extraction.

### When to Run

- After mapper has processed all files and maps are written (2.4 Steps 2-4)
- Maps exist and have initial navigation coverage
- `pilosa-serendippo` can use existing maps as a starting point

### How It Works

1. Spawn `pilosa-serendippo` with access to `maps/` (structural overview, group maps, theme maps) and `raw/`
2. It reads existing maps to identify under-connected concepts
3. It roams through raw files, following threads and finding connections
4. It writes a serendipity report to `agent_reports/serendipity_report.md`
5. It proposes map updates (new cross-references, pattern documentation)

### Arrival Metric

`pilosa-serendippo` runs until the orchestrator signals completion or the researcher intervenes. There is no fixed endpoint — this is an open-ended discovery process.

### Output

- `agent_reports/serendipity_report.md` — connections found, patterns identified, map updates proposed
- Updates to existing maps (new cross-references, pattern documentation)

## 2.7 Record Ambiguities

After reading the source files and building the dictionary, record ambiguities without stopping startup. Record these cases in the dictionary, maps, workspace map, or startup report as `unresolved` / `needs_review`:

1. **Name collisions** — If "Maria" appears in 3 sources and identity is unclear, keep distinct surface forms or mark the canonical entry `unresolved`.
2. **Place ambiguity** — If "the village" or "the coast" is unclear, preserve the source phrase as a keyword.
3. **Unclear concepts** — If a domain term has no obvious definition, include the term with a brief source-grounded note.
4. **Missing metadata** — If a source has no date, author, or context, omit that header field or mark the file `needs_review`.
5. **Source relationships** — If two sources seem to contradict each other, record the contrast as a gap rather than resolving it.

Only pause for orchestrator/user input when an ambiguity prevents valid indexing. Otherwise continue and list unresolved items in the startup report.

## 2.8 Update Workspace Index

Update [[workspace_index]] with:

- Raw copy coverage (how many copied files, by type),
- Skipped media coverage (how many uncovered source media files, by media type),
- Navigation maps created,
- Dictionary status (canonical names, places, organizations, concepts),
- Non-text media noted as skipped / uncovered,
- Known gaps.

Coverage counts must be exact.

## 2.9 Validate

Before reporting startup complete, run validation.

Map validation:
- Structural overview exists at maps/ root (excluding AGENTS.md, map_template.md)
- At least one group map exists (may be the overview itself for flat/small corpora)
- Each group map has "What this group is about" section
- Each group map has "Recurring concepts" section with key passages
- Key passages include file paths and line references
- Theme maps exist for concepts spanning multiple groups (skip check if single group)
- All wikilinks resolve to existing files

Retrieval tests:

1. **Structural retrieval** — open the corpus overview, find a group, confirm it links to raw files
2. **Group retrieval** — open a group map, find a concept with key passages, confirm file paths exist
3. **Theme retrieval** — open a theme map, find evidence across groups, confirm passages are grounded (skip if no theme maps)
4. **Passage retrieval** — grep a quote from a map in raw/, confirm the line reference is valid
5. **Cross-group retrieval** — find a theme spanning 3+ groups, confirm evidence from each (skip if no theme maps)
6. **Unresolved metadata retrieval** — grep `needs_review` or `unresolved` and confirm it is findable

Startup is complete **only if** all applicable retrieval tests pass.

After validation passes, replace `setup_status: cli_started` with `setup_status: workspace_started` in [[context]] and [[configuration]].

## 2.10 Idempotency And Recovery

Startup rerun behavior:
- skip valid dictionary entries unless repair is needed,
- overwrite all generated maps from the current extraction checkpoint,
- preserve extraction results from previous runs.

Recovery behavior:
- write phase progress in the startup report or a checkpoint in [[agent_reports/]] when startup stops partially,
- resume from the first incomplete phase,
- keep `setup_status: cli_started` until validation passes.

Sub-agent delegation:
- Dictionary + concept extraction: `pilosa-mapper` reads files in batches (spawned aggressively in parallel), extracts terms and content-grounded fragments in one pass
- Map writing: `pilosa-mapper` writes maps directly from extraction batches (structural overview, group maps, theme maps)
- Startup owns merge, conflict resolution, and validation; sub-agents never set `setup_status: workspace_started`.

## 2.11 Progress Tracking And Checkpointing

### Checkpoint File

Use `agent_reports/extraction_checkpoint.md` to track progress across sub-agent batches. This file survives restarts and enables resumption.

Format:

```markdown
---
type: extraction_checkpoint
total_files: 925
files_read: 0
last_updated: YYYY-MM-DD
---

# Extraction Checkpoint

## Processed Files

| File Path | Batch ID | Date Processed |
|---|---|---|
| raw/Ex0-.../CLARA.md | batch_001 | 2026-06-04 |
| raw/Ex0-.../FRANCOIS.md | batch_001 | 2026-06-04 |

## Extraction Packets

### Batch 001
[Structured extraction results from sub-agent]
```

### Progress Display

After each batch, update `workspace_index.md` "Extraction Progress" section:

```markdown
## Extraction Progress

- Total files: 925
- Files read: 150
- Remaining: 775
- Last batch: Ex0/COHORT2 (15 files)
- Status: in_progress
```

### Resume On Restart

If startup is interrupted:
1. Read `agent_reports/extraction_checkpoint.md`
2. Count `files_read` vs `total_files`
3. Resume spawning batches from where we stopped
4. Skip files already in the "Processed Files" table

### Arrival Metrics Summary

| Phase | Arrival Metric | How to Check |
|---|---|---|
| Dictionary + extraction (2.2) | `files_read == total_files` | checkpoint file |
| Structure identification (2.4 Step 1) | Natural groups identified from extraction (or single group for flat/small corpora) | extraction batches |
| Structural overview (2.4 Step 2) | One overview map at maps/ root | `ls maps/*.md` excluding AGENTS.md, map_template.md |
| Group maps (2.4 Step 3) | One .md per natural group (may equal overview for flat/small corpora) | `ls maps/<subdirectory>/*.md` or `maps/corpus_overview.md` |
| Theme maps (2.4 Step 4) | Theme .md for each cross-group concept (skip if no cross-cutting themes) | `ls maps/<subdirectory>/*.md` |
| Coverage (2.4 Step 5) | Every file in checkpoint appears in >=1 map | grep file paths in maps/ |
| Accuracy (2.4 Step 6) | >=4/5 spot-checked passages accurate | startup report |

---

# Startup Output

Write one startup report in [[agent_reports/]] with the following fields:

- configuration status,
- Source location verified,
- raw copy coverage,
- skipped media coverage,
- maps created,
- dictionary size (names, places, organizations, concepts),
- extraction coverage (files summarized, key passages captured, concept signals),
- cross-cutting themes identified,
- validation and retrieval test results,
- remaining non-text files at source location,
- recommended next actions.

## Startup Report Dashboard

Generate a Unicode distribution bars chart in the startup report header to show overall workspace status.

### Distribution Bars (Startup Report)

Compare multiple metrics side-by-side using distribution bars.

**Characters:** `▓` (filled) + `░` (empty) + `█` (accent/total)

**Rendering:**
```
bar_width = 16 characters
filled = round((value / total) * bar_width)
empty = bar_width - filled
bar = "▓" * filled + "░" * empty
```

**Metrics to Display:**
```
Extract  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  925/925 files
Maps     ▓▓▓▓▓▓▓▓▓▓▓▓░░░░  15 created
Dict     ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░  342 terms
Links    ▓▓▓▓▓▓▓▓▓▓░░░░░░  280 wikilinks
```

**Dashboard Format:**
```
┌─ Startup Status ───────────────────────────────────────────────┐
│ Extract  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  925/925 files                     │
│ Maps     ▓▓▓▓▓▓▓▓▓▓▓▓░░░░  15 created                         │
│ Dict     ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░  342 terms                          │
│ Links    ▓▓▓▓▓▓▓▓▓▓░░░░░░  280 wikilinks                      │
│ Valid    ✓ passed                                                │
└─────────────────────────────────────────────────────────────────┘
```

## Extraction Checkpoint Dashboard

Generate a Unicode progress bar in the extraction checkpoint to show batch completion status.

### Progress Bar (Extraction Checkpoint)

Linear completion tracking for file extraction progress.

**Characters:** `▓` (filled) + `░` (empty)

**Rendering:**
```
bar_width = 16 characters
filled = round((files_read / total_files) * bar_width)
empty = bar_width - filled
bar = "▓" * filled + "░" * empty
```

**Metrics to Display:**
```
Files    ▓▓▓▓▓▓▓▓▓▓░░░░░░  450/925 (48%)
Batches  ▓▓▓▓▓▓░░░░░░░░░░  30/60 completed
Status   in_progress
```

**Dashboard Format:**
```
┌─ Extraction Progress ───────────────────────────────────────────┐
│ Files    ▓▓▓▓▓▓▓▓▓▓░░░░░░  450/925 (48%)                       │
│ Batches  ▓▓▓▓▓▓░░░░░░░░░░  30/60 completed                     │
│ Status   in_progress                                             │
└─────────────────────────────────────────────────────────────────┘
```
