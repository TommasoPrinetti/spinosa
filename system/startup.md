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

Startup is the only authority that can mark setup complete. `.bin/check-startup.sh` is a developer-facing validation helper, not a separate user-facing setup path.

## What Onboarding Already Did

The CLI onboarding script (`bash .bin/onboard.sh`) has already:

- Collected project name, source location, and preferred LLM CLI
- Scanned the source corpus and copied accepted files into `raw/` (text, native-readable, PDFs)
- Skipped images, video, audio, and `AGENTS.md` control files
- Written `context.md` and `configuration.md` with `setup_status: cli_started`

**Startup does not repeat onboarding.** Startup takes the raw corpus and builds the workspace content: dictionary, concept index, maps, and validation.

## Mission

Your job is to:

1. **Verify onboarding completed** — confirm setup files exist and source location is valid
2. **Build the master dictionary** from corpus evidence
3. **Extract concepts, themes, and entities** from raw files
4. **Write concept-indexed maps** that help future LLMs find relevant files by meaning, not just filename
5. **Cross-exercise synthesis** — identify themes that appear across multiple exercises
6. **Run startup validation and retrieval tests**

## Non-Negotiable

- **Do not edit `raw/`, maps, dictionary, logs, or system files.**
- Treat `raw/` as the active working corpus after onboarding.
- Copy PDFs as-is when onboarding accepted them. Do not create pointer records for images, audio, or video; account for skipped media as uncovered source media.
- Treat every `AGENTS.md` file as repository/control instructions, not corpus evidence.
- Use the dictionary for consistent terminology across all outputs.
- Preserve generated-file provenance on maps and reports.
- Use Obsidian wikilinks for internal map references to raw copies, dictionaries, and maps.
- Put retrieval-critical terms in **YAML frontmatter** because fast grep starts there.
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

If the user already ran `bash .bin/onboard.sh`, treat its answers as the **setup draft** and complete startup without repeating those questions. Project description and helpful artifact URLs are optional context. If absent, record them as `not provided during fast setup` and infer the working scope from the active raw corpus during indexing. External source policy defaults to `no`.

---

# Phase 1 — Verify Onboarding

Quick verification that onboarding completed correctly. This phase should take under a minute.

## 1.1 Confirm Setup Files Exist

Read [[context]] and [[configuration]]. Check:

- `context.md` exists and has `setup_status: cli_started`
- `configuration.md` exists with `source_location` filled (not `[path]`)
- Source location directory exists on disk
- No blocking placeholders remain (`[path]`, `[project name]`)

## 1.2 Check For Blocking Missing Info

Do not ask follow-up questions before Phase 2 unless:

- the project title, source location, or preferred LLM CLI is absent,
- the source location cannot be located,
- external URL access needs permission because the user provided URLs and policy is not already `yes`, or
- a risky assumption blocks immediate indexing.

Missing project description and missing helpful artifact URLs do not block Phase 2.

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

Separately account for unsupported files and skipped media that remain only at the source location. Do not create `.pointer.md` records for them during startup. Record media counts, extensions, and processing gaps in `workspace_index.md` and the startup report as source media coverage.

## 2.2 Log Source Intake

Record the source batch or external-access decision in `logs/user_requests.md` when traceability is needed. Use route `source_intake` or `external_access` and include the retained output or reason.

## 2.3 Build Dictionary And Extract Concepts

**This is the core step.** One pass over the corpus that builds both the dictionary and the concept index simultaneously. No duplicate reading.

### Step 1: Spawn batches until all files are read

Split raw copies into batches of 10-15 files. Spawn **pilosa-mapper** sub-agents. Each batch reads files and extracts:

**For the dictionary:**

1. **Names** — people, roles, named entities. Merge variants into canonical forms.
2. **Places** — geographic locations, sites, regions. Merge variants.
3. **Organizations** — institutions, groups, agencies. Merge abbreviations.
4. **Explicit source terms** — terms visibly present in the source text. Record source language and source files.
5. **Inferred concepts** — domain-specific ideas, theories, frameworks inferred from multiple source terms. Mark as inferred.
6. **Domain terms** — specialized vocabulary, acronyms, jargon used in the sources.
7. **Uncertain terms and metadata** — unresolved people, dates, places, or terms needing review.
8. **Machine artifacts** — ASR speaker labels, diarization labels, OCR noise, conversion residue, timestamps.

**For concept extraction (same pass):**

9. **Core concepts** (2-5 per file): The main ideas discussed. Use the dictionary for canonical terms.
10. **Thematic tags** (2-5 per file): Brief search-optimized labels.
11. **Key entities**: People, organizations, places mentioned (use dictionary canonical forms).
12. **Cross-exercise connections**: Does this file reference or relate to content in other files?

**Multilingual rule:** Keywords must appear in the language they were found in. If a source is in French, French keywords are recorded. If in English, English keywords. If a concept appears in multiple languages, list all language variants as aliases.

### Step 2: Accumulate results

After each batch completes:
1. Merge dictionary terms into the master dictionary
2. Append extraction packets to `agent_reports/extraction_checkpoint.md`
3. Update `workspace_index.md` "Extraction Progress" section
4. Track: `files_read / TOTAL_FILES`

**Arrival metric:** `files_read == TOTAL_FILES`. Continue spawning batches until every file has been read by at least one sub-agent.

### Step 3: Finalize dictionary

Write [[dictionary]] with accumulated canonical forms, aliases, explicit source terms, inferred concepts, uncertain terms, machine artifacts, languages, and source file references.

### Step 4: Enrich context

Use accumulated evidence to enrich [[context]]:

- **Methods**: Observe what the raw copies actually contain. Infer the research methods.
- **Source universe**: List the actual source types found, their languages, and approximate date ranges.
- **Research vocabulary**: Extract key actors, institutions, places, and concepts that appear repeatedly.
- **Likely output needs**: Based on the corpus structure, infer what the researcher will need.

### Step 5: Merge into concept index

After all batches complete, merge extraction packets into a **concept index** — a master list of all concepts found across the corpus, with file references. Write this to `agent_reports/concept_index_accumulated.md` as input for map writing.

## 2.4 Write Concept-Indexed Maps

Use **pilosa-writer** sub-agents to create maps from the concept index. The maps are the primary navigation layer for backsearching.

### Input

Read `agent_reports/concept_index_accumulated.md` (from step 2.3) and `agent_reports/extraction_checkpoint.md` for the full list of files and their extraction packets.

### Required Maps

1. **`maps/concept_index.md`** — The master concept index. Each concept gets a section with:
   - Definition (1-2 sentences)
   - Files where it appears (with wikilinks)
   - Related concepts

2. **`maps/thematic_tags.md`** — Files organized by thematic tag. Each tag gets a section listing all files with that tag.

3. **`maps/cross_exercise_synthesis.md`** — Themes that appear across multiple files. For each cross-file theme:
   - Theme name and definition
   - How the theme manifests across files
   - Key files for each manifestation

4. **`maps/entity_index.md`** — People, organizations, places with file references.

5. **`maps/corpus_structure.md`** — Files organized by their structure (exercise, cohort, date, or other grouping).

### Map Format

Maps use a flexible format adapted to the corpus structure. Each map entry must include:

```markdown
## [Concept Name]

[1-2 sentence definition]

| File | Tags | Summary |
|---|---|---|
| [[raw/path/to/file.md\|filename]] | ethics, reflection | One-sentence summary |
```

If the corpus has exercise/cohort structure, add those columns:

```
| File | Exercise | Cohort | Tags | Summary |
```

### Arrival Metric

**Every file in `agent_reports/extraction_checkpoint.md` must appear in at least one map.** After writing all maps, verify:

```
Files in checkpoint: N
Files in concept_index.md: M1
Files in thematic_tags.md: M2
Files in corpus_structure.md: M3
```

If any file is missing from all maps, the maps are incomplete. Fix before proceeding.

### Map Quality

Maps start as `map_quality: machine_generated`. After Verifier review, update to `map_quality: checked` or `map_quality: human_reviewed`.

## 2.5 Cross-Exercise Synthesis

**Dedicated step.** After all concept extraction is complete, run a synthesis pass:

1. Identify concepts that appear in multiple files
2. Map how these concepts evolve across files
3. Identify file-specific concepts (concepts unique to one file)
4. Write `maps/cross_exercise_synthesis.md` with the results

This map is critical for longitudinal analysis — it shows how themes develop across the corpus.

## 2.6 Serendipitous Connection Discovery

**Dedicated step.** After cross-exercise synthesis is complete, spawn **pilosa-serendippo** to find hidden connections that batch processing misses.

### Purpose

The mapper agent reads files in structured batches — efficient but linear. The serendipa agent roams freely, following threads and finding connections that emerge from holistic reading, not just metadata extraction.

### When to Run

- After mapper has processed all files (2.3) and cross-exercise synthesis is written (2.5)
- Maps exist and have initial concept coverage
- Serendipa can use existing maps as a starting point

### How It Works

1. Spawn pilosa-serendippo with access to maps/ and raw/
2. It reads existing maps to identify under-connected concepts
3. It roams through raw files, following threads and finding connections
4. It writes a serendipity report to `agent_reports/serendipity_report.md`
5. It proposes map updates (new cross-references, pattern documentation)

### Arrival Metric

Serendipa runs until the orchestrator signals completion or the researcher intervenes. There is no fixed endpoint — this is an open-ended discovery process.

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
- Central navigation maps created,
- Dictionary status (canonical names, places, organizations, concepts),
- Non-text media noted as skipped / uncovered,
- Known gaps.

Coverage counts must be exact.

## 2.9 Validate

Before reporting startup complete, run validation.

Map validation:
- concept_index.md has concepts with file references
- thematic_tags.md has tags with file lists
- cross_exercise_synthesis.md has themes spanning multiple files
- entity_index.md has entities with file references
- All wikilinks resolve to existing files

Retrieval tests:

1. **Concept retrieval** — grep a concept name in maps/ and confirm it links to raw files
2. **Thematic retrieval** — grep a thematic tag and confirm it returns relevant files
3. **Cross-exercise retrieval** — find a concept in cross_exercise_synthesis.md and confirm it links to files across the corpus
4. **Entity retrieval** — grep a person/org name and confirm it links to relevant files
5. **Map navigation** — open concept_index.md, follow a link to a raw file, confirm it exists
6. **Unresolved metadata retrieval** — grep `needs_review` or `unresolved` and confirm it is findable

Startup is complete **only if** all applicable retrieval tests pass.

After validation passes, replace `setup_status: cli_started` with `setup_status: workspace_started` in [[context]] and [[configuration]].

## 2.10 Idempotency And Recovery

Startup rerun behavior:
- skip valid dictionary entries unless repair is needed,
- update maps when raw files or dictionary entries changed,
- preserve `map_quality: checked` and `map_quality: human_reviewed` unless the user explicitly asks to regenerate,
- preserve concept extraction results from previous runs.

Recovery behavior:
- write phase progress in the startup report or a checkpoint in [[agent_reports/]] when startup stops partially,
- resume from the first incomplete phase,
- keep `setup_status: cli_started` until validation passes.

Sub-agent delegation:
- Dictionary + concept extraction: pilosa-mapper reads batches of 10-15 files, extracts terms and concepts in one pass
- Map writing: pilosa-writer synthesizes concept index into maps
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
| Dictionary + extraction (2.3) | `files_read == total_files` | checkpoint file |
| Map writing (2.4) | Every file in checkpoint appears in ≥1 map | grep file paths in maps/ |
| Cross-exercise (2.5) | Themes identified for all concepts in multiple files | concept_index.md sections |

---

# Startup Output

Write one startup report in [[agent_reports/]] with the following fields:

- configuration status,
- Source location verified,
- raw copy coverage,
- skipped media coverage,
- maps created,
- dictionary size (names, places, organizations, concepts),
- concept index size (number of concepts, files covered),
- thematic tag count,
- cross-exercise themes identified,
- validation and retrieval test results,
- remaining non-text files at source location,
- recommended next actions.
