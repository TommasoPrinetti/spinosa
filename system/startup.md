---
type: startup_protocol
role: setup_and_indexing_protocol
purpose: [translate the source material into a searchable, header-indexed workspace]
description:
  - Startup protocol executed directly by the orchestrator after onboarding.
  - Agents use it to build dictionary, maps, validation checks, and startup reports.
scope: [initial setup only]
connects_to:
  - AGENTS.md
created: 2026-05-28
updated: 2026-06-04
---

# startup.md — Setup Translation and Indexing Protocol

This is the **protocol document** that defines what to do and how to do it. The **orchestrator** reads this file and executes the steps.

Use this file when the user asks to **start the workspace** or when setup files still contain placeholders.

Startup is the only authority that can mark setup complete. `.bin/check-startup.sh` is a developer-facing validation helper, not a separate user-facing setup path.

## Context

The CLI onboarding script has already transposed all the relevant files into the`raw` folder.  scanned the corpus, asked for explicit consent, copied accepted text-like files into [[raw/]], skipped images, video, audio, and `AGENTS.md` control files. 

## Mission 

Your job is to:

1. **Build the master dictionary and enrich the blueprint from corpus evidence**
2. **Read raw copies in batches and extract concepts, themes, and entities**
3. **Write concept-indexed maps** that help future LLMs find relevant files by meaning, not just filename
4. **Tag files with brief thematic markers** for search optimization
5. **Cross-exercise synthesis** — identify themes that appear across multiple exercises
6. **Run startup validation and retrieval tests**

The protocol runs in two phases: **Phase 1 (Setup Translation)** and **Phase 2 (Indexing, Mapping, Validation)**. The CLI handles raw record writing; you handle translation, dictionary anchoring, maps, validation, and recovery notes.

GPT: Use `set_goal` to achieve your mission.

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

# Phase 1 — Setup Translation

## 1.1 Inspect Setup Draft

Read [[context]] and [[configuration]]. Identify filled fields, placeholders, and missing data.

Create a todo list with the CLI's todo/task tool if available. Minimum todo items:

- inspect setup draft,
- verify source location,
- synthesize blueprint/config,
- build dictionary from corpus evidence,
- read raw copies and extract concepts,
- write concept-indexed maps,
- cross-exercise synthesis,
- validate retrieval paths.

## 1.2 Translate Setup Draft

Treat CLI-generated answers as a **setup draft**, not as questions to repeat. Translate the draft into a usable research configuration:

- preserve the project title,
- preserve the project description if provided; otherwise write `not provided during fast setup` and continue,
- register helpful artifact URLs or file paths if provided,
- infer a tentative source universe, vocabulary, methods, outputs, unresolved ambiguities, and indexing target from the description, artifacts, and active raw corpus when available,
- keep inferred fields explicitly marked as inferred when useful.

Use shell/file tools to confirm the source location exists and is treated as **read-only**. Do not read source files directly for normal indexing when the corresponding raw copy exists.

## 1.3 Fill Blueprint and Configuration

- Fill [[context]] (project title, project description status, helpful artifact URLs or file paths status, source location, evidence standards, external source policy).
- Fill [[configuration]] (`root_vault_path`, `root_vault_mode`, `source_policy`, `external_sources_allowed`, `preferred_llm_cli`, `claim_standard`, `l2_policy`).
- Keep `setup_status: cli_started` until mapping and retrieval tests have passed. Replace it with `setup_status: workspace_started` in both files only at the end of Phase 2.

## 1.4 Audit the Translation

Before moving on, confirm:

- every project detail from the CLI draft is preserved or intentionally summarized,
- every artifact URL or file path is listed,
- every source policy and protected path is reflected in configuration,
- inferred scope, source universe, vocabulary, methods, outputs, and initial indexing target are present where useful,
- anything not translated is listed as deferred with a reason.

## 1.5 Question Gating

Do not ask follow-up questions before Phase 2 unless:

- the project title, source location, or preferred LLM CLI is absent,
- the source location cannot be located,
- external URL access needs permission because the user provided URLs and policy is not already `yes`, or
- a risky assumption blocks immediate indexing.

Missing project description and missing helpful artifact URLs do not block Phase 2.

---

# Phase 2 — Indexing, Mapping, Validation

## 2.1 Survey Active Corpus And Source Coverage

Survey [[raw/]] as the active working corpus, then compare against the source location for skipped media and coverage gaps. For each raw directory:

1. List all files and subdirectories (skip `.DS_Store`, `AGENTS.md`, system files, empty dirs)
2. Note copied text-like file types (`.md`, `.txt`, `.csv`, `.json`, etc.), count per type, approximate date range
3. Read a sample of raw copies to characterize the folder's content accurately
4. Record: source types, modality, names, dates, topics, keywords, gaps

Separately account for unsupported files and skipped media that remain only at the source location. Do not create `.pointer.md` records for them during startup. Record media counts, extensions, and processing gaps in `workspace_index.md` and the startup report as source media coverage.

## 2.2 Log Source Intake

Record the source batch or external-access decision in `logs/user_requests.md` when traceability is needed. Use route `source_intake` or `external_access` and include the retained output or reason.

## 2.3 Build Master Dictionary And Blueprint Anchors

### Step 1: Count total files

Before spawning any sub-agents, count all files in raw/:

```
find raw/ -name "*.md" -not -name "AGENTS.md" -not -name "INDEX.md" -not -name "REPO_GUIDE.md" | wc -l
```

Record this number as `TOTAL_FILES` in `workspace_index.md` under "Extraction Progress". Every subsequent step checks against this number.

### Step 2: Spawn batches until all files are read

Split raw copies into batches of 10-15 files. Spawn **pilosa-mapper** sub-agents. Each batch reads files and extracts:

1. **Names** — people, roles, named entities. Merge variants into canonical forms.
2. **Places** — geographic locations, sites, regions. Merge variants.
3. **Organizations** — institutions, groups, agencies. Merge abbreviations.
4. **Explicit source terms** — terms visibly present in the source text. Record source language and source files.
5. **Inferred concepts** — domain-specific ideas, theories, frameworks inferred from multiple source terms. Mark as inferred.
6. **Domain terms** — specialized vocabulary, acronyms, jargon used in the sources.
7. **Uncertain terms and metadata** — unresolved people, dates, places, or terms needing review.
8. **Machine artifacts** — ASR speaker labels, diarization labels, OCR noise, conversion residue, timestamps.

**Multilingual rule:** Keywords must appear in the language they were found in. If a source is in French, French keywords are recorded. If in English, English keywords. If a concept appears in multiple languages, list all language variants as aliases.

After each batch completes:
1. Merge batch results into the master dictionary
2. Update `workspace_index.md` "Extraction Progress" section
3. Append processed file paths to `agent_reports/extraction_checkpoint.md`

**Arrival metric:** `files_read == TOTAL_FILES`. Continue spawning batches until every file has been read by at least one sub-agent.

### Step 3: Finalize dictionary

Write [[dictionary]] with accumulated canonical forms, aliases, explicit source terms, inferred concepts, uncertain terms, machine artifacts, languages, and source file references.

### Step 4: Enrich context

Use accumulated evidence to enrich [[context]]:

- **Methods**: Observe what the raw copies actually contain. Infer the research methods.
- **Source universe**: List the actual source types found, their languages, and approximate date ranges.
- **Research vocabulary**: Extract key actors, institutions, places, and concepts that appear repeatedly.
- **Likely output needs**: Based on the corpus structure, infer what the researcher will need.

## 2.4 Read Raw Copies And Extract Concepts

**This is the core step that makes maps useful.** Use **pilosa-mapper** sub-agents to read file bodies and extract actual content.

### Step 1: Check progress from dictionary pass

Read `agent_reports/extraction_checkpoint.md` to see which files have already been read. If the dictionary pass (2.3) already read all files, reuse those extraction packets. If not, continue with new batches.

### Step 2: Spawn batches until all files have concept packets

Split raw copies into batches of 10-15 files. For each batch, spawn a pilosa-mapper with this prompt:

```
Read these 10-15 raw copy files. For EACH file, extract:
1. **Core concepts** (2-5): The main ideas discussed in this file. Use the dictionary for canonical terms. Examples: "value attribution", "professional judgment", "epistemic authority", "AI trust", "fairness assessment", "prompting techniques"
2. **Thematic tags** (2-5): Brief search-optimized labels. Examples: "ethics", "professional-use", "student-reflection", "methodology", "critique", "comparison"
3. **Key entities**: People, organizations, places mentioned (use dictionary canonical forms)
4. **Cross-exercise connections**: Does this file reference or relate to content in other exercises?

Return a structured packet for each file:
- File path
- Source type (interview/worksheet/transcription)
- Language
- Core concepts (list)
- Thematic tags (list)
- Key entities (list)
- One-sentence summary
- Cross-exercise connections (if any)
```

### Step 3: Accumulate packets

After each batch completes:
1. Append extraction packets to `agent_reports/extraction_checkpoint.md`
2. Update `workspace_index.md` "Extraction Progress" section
3. Track: `files_extracted / TOTAL_FILES`

**Arrival metric:** `files_extracted == TOTAL_FILES`. Continue spawning batches until every file has an extraction packet in the checkpoint file.

### Step 4: Merge into concept index

After all batches complete, merge extraction packets into a **concept index** — a master list of all concepts found across the corpus, with file references. Write this to `agent_reports/concept_index_accumulated.md` as input for map writing.

## 2.5 Write Concept-Indexed Maps

Use **pilosa-writer** sub-agents to create maps from the concept index. The maps are the primary navigation layer for backsearching.

### Input

Read `agent_reports/concept_index_accumulated.md` (from step 2.4) and `agent_reports/extraction_checkpoint.md` for the full list of files and their extraction packets.

### Required Maps

1. **`maps/concept_index.md`** — The master concept index. Each concept gets a section with:
   - Definition (1-2 sentences)
   - Files where it appears (with wikilinks)
   - Which exercises contain it
   - Which cohorts contain it
   - Related concepts

2. **`maps/thematic_tags.md`** — Files organized by thematic tag. Each tag gets a section listing all files with that tag.

3. **`maps/cross_exercise_synthesis.md`** — Themes that appear across 3+ exercises. For each cross-exercise theme:
   - Theme name and definition
   - Which exercises contain it
   - How the theme evolves across exercises
   - Key files for each exercise

4. **`maps/entity_index.md`** — People, organizations, places with file references.

5. **`maps/corpus_structure.md`** — Files organized by exercise and cohort (for structural navigation).

### Map Format

Each map uses this format:

```markdown
## [Concept Name]

[1-2 sentence definition]

**Exercises:** Ex3, Ex5, Ex9
**Cohorts:** C1, C2, C3

| File | Exercise | Cohort | Thematic Tags | Summary |
|---|---|---|---|---|
| [[raw/path/to/file.md\|filename]] | Ex3 | C1 | ethics, reflection | One-sentence summary |
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

## 2.6 Cross-Exercise Synthesis

**Dedicated step.** After all concept extraction is complete, run a synthesis pass:

1. Identify concepts that appear in 3+ exercises
2. Map how these concepts evolve across exercises (e.g., "professional usefulness" appears in Ex3 as initial assessment, in Ex9 as formal judgment, in Ex17 as final reflection)
3. Identify exercise-specific concepts (concepts unique to one exercise)
4. Write `maps/cross_exercise_synthesis.md` with the results

This map is critical for longitudinal analysis — it shows how themes develop across the curriculum.

## 2.7 Serendipitous Connection Discovery

**Dedicated step.** After cross-exercise synthesis is complete, spawn **pilosa-serendippo** to find hidden connections that batch processing misses.

### Purpose

The mapper agent reads files in structured batches — efficient but linear. The serendipa agent roams freely, following threads and finding connections that emerge from holistic reading, not just metadata extraction.

### When to Run

- After mapper has processed all files (2.4) and cross-exercise synthesis is written (2.6)
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

## 2.8 Record Ambiguities

After reading the source files and building the dictionary, record ambiguities without stopping startup. Record these cases in the dictionary, maps, workspace map, or startup report as `unresolved` / `needs_review`:

1. **Name collisions** — If "Maria" appears in 3 sources and identity is unclear, keep distinct surface forms or mark the canonical entry `unresolved`.
2. **Place ambiguity** — If "the village" or "the coast" is unclear, preserve the source phrase as a keyword.
3. **Unclear concepts** — If a domain term has no obvious definition, include the term with a brief source-grounded note.
4. **Missing metadata** — If a source has no date, author, or context, omit that header field or mark the file `needs_review`.
5. **Source relationships** — If two sources seem to contradict each other, record the contrast as a gap rather than resolving it.

Only pause for orchestrator/user input when an ambiguity prevents valid indexing. Otherwise continue and list unresolved items in the startup report.

## 2.9 Update Master Workspace Map

Update [[workspace_index]] with:

- Raw copy coverage (how many copied text files, by type),
- Skipped media coverage (how many uncovered source media files, by media type),
- Central navigation maps created,
- Dictionary status (canonical names, places, organizations, concepts),
- Non-text media noted as skipped / uncovered,
- Known gaps.

Coverage counts must be exact.

## 2.10 Startup Validation

Before reporting startup complete, run validation.

Map validation:
- concept_index.md has concepts with file references
- thematic_tags.md has tags with file lists
- cross_exercise_synthesis.md has themes spanning 3+ exercises
- entity_index.md has entities with file references
- All wikilinks resolve to existing files

Retrieval tests:

1. **Concept retrieval** — grep a concept name in maps/ and confirm it links to raw files
2. **Thematic retrieval** — grep a thematic tag and confirm it returns relevant files
3. **Cross-exercise retrieval** — find a concept in cross_exercise_synthesis.md and confirm it links to files across exercises
4. **Entity retrieval** — grep a person/org name and confirm it links to relevant files
5. **Map navigation** — open concept_index.md, follow a link to a raw file, confirm it exists
6. **Unresolved metadata retrieval** — grep `needs_review` or `unresolved` and confirm it is findable

Startup is complete **only if** all applicable retrieval tests pass.

After validation passes, replace `setup_status: cli_started` with `setup_status: workspace_started` in [[context]] and [[configuration]].

## 2.11 Idempotency And Recovery

Onboarding rerun behavior:
- skip existing raw text copies,
- skip `AGENTS.md` control files,
- leave legacy raw folder files untouched,
- overwrite blueprint/config only when the user confirms overwrite or passes `--force`.

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
- Dictionary building: pilosa-mapper reads batches of 10-15 files, extracts terms
- Concept extraction: pilosa-mapper reads batches of 10-15 files, extracts concepts and themes
- Map writing: pilosa-writer synthesizes concept index into maps
- Startup owns merge, conflict resolution, and validation; sub-agents never set `setup_status: workspace_started`.

## 2.12 Progress Tracking And Checkpointing

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
| Dictionary (2.3) | `files_read == total_files` | checkpoint file |
| Concept extraction (2.4) | `files_extracted == total_files` | checkpoint file |
| Map writing (2.5) | Every file in checkpoint appears in ≥1 map | grep file paths in maps/ |
| Cross-exercise (2.6) | Themes identified for all concepts in 3+ exercises | concept_index.md sections |

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
