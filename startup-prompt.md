# Index This Workspace

Read `raw/`, build the master dictionary, extract content-grounded fragments, write navigation maps, and validate everything. One-time indexing pass. After this, the workspace is ready for search and retrieval.

## Context: what onboarding already did

- Collected project name and preferred LLM CLI
- Imported accepted files into `raw/` (text, native-readable, PDFs)
- Wrote `system/context.md` and `system/configuration.md` with `setup_status: cli_started`

Do not repeat onboarding. Startup takes the raw corpus and builds the workspace content.

## Routing rules for this session

- **Route split:** every request is `fast_path` (direct answer, no sub-agents) or `non-fast-path` (sub-agent orchestration). Workspace indexing is `non-fast-path`.
- **Sub-agents required.** Never do a sub-agent's work inline. Spawn them for extraction, map writing, serendipity discovery, verification, and evaluation.
- **Every non-fast-path chain ends with verifier + evaluator.** Both mandatory.
- For the full routing contract (fast-path handling, adaptive loop, session metrics), read `AGENTS.md` for non-indexing requests.

## Gate: do not stop until ALL of

- `setup_status` is `workspace_started` in both `system/context.md` and `system/configuration.md`
- `system/dictionary.md` contains the master dictionary
- `system/workspace_index.md` records total raw files, extraction coverage, maps, and known gaps
- `maps/` contains the navigation maps needed to retrieve the corpus
- `agent_reports/` contains a startup report with validation and retrieval-test results
- Every non-skipped raw file is accounted for, or the startup report names the blocker

## Hard rules

- **Do not edit `raw/`.** Startup may write maps, dictionary, workspace index, context, configuration, and startup reports.
- Treat `raw/` as the active working corpus.
- PDFs were converted by onboarding (MarkItDown for text-based, RapidOCR for scanned). Account for skipped media (audio, video) as uncovered.
- Treat every `AGENTS.md` file as control instructions, not corpus evidence.
- Use the dictionary for consistent terminology.
- Preserve generated-file provenance on maps and reports.
- Use Obsidian wikilinks for internal map references to raw copies, dictionaries, and maps.
- Put retrieval-critical terms in **YAML frontmatter** (fast grep starts there). Put interpretation and context in the body.
- Do not ask questions. Produce a Disambiguation Brief only for blocking ambiguity.
- Treat machine artifacts as findable noise until verified.
- External source policy: `no`. Only enable if the user explicitly requests it.
- Project description and artifact URLs: optional. If absent, infer from the raw corpus during mapping.

---

## Phase 1: Verify Onboarding

Under 1 minute.

### 1.1 Confirm setup files

Read `system/context.md` and `system/configuration.md`. Check:

- `context.md` exists with `setup_status: cli_started`
- `configuration.md` exists with `active_corpus_path: raw/`
- `raw/` exists
- No blocking placeholders (`[path]`, `[project name]`)

---

## Phase 2: Index, Map, Validate

### 2.1 Survey the corpus

Survey `raw/`. For each directory:

1. List files and subdirectories (skip `.DS_Store`, `AGENTS.md`, system files, empty dirs)
2. Note file types (`.md`, `.txt`, `.csv`, `.json`, etc.), count per type, approximate date range
3. Read a sample to characterize the folder's content
4. Record: source types, modality, names, dates, topics, gaps, `converter_engine`, `original_format`

Count **all** files in raw/:

```
find raw/ -type f -not -name ".DS_Store" -not -name "AGENTS.md" -not -name "INDEX.md" -not -name "REPO_GUIDE.md" -not -name ".gitkeep" | wc -l
```

Record the count as `TOTAL_FILES` in `workspace_index.md` under "Extraction Progress". Every subsequent step checks against this number.

Account for skipped media from onboarding/import summaries only.

### 2.2 Build dictionary and extract content-grounded fragments

**One pass over the corpus.** Build both the dictionary and extraction packets. No duplicate reading.

#### Step 1: List and batch all files

Survey all files in `raw/` (skip `.DS_Store`, `AGENTS.md`, system files, empty dirs). Record total as `TOTAL_FILES` in `workspace_index.md`. Split into batches of 20–25, grouped by parent directory. Assign each batch a unique `batch_id` (`batch_001`, `batch_002`, ...). Write the batch list to `agent_reports/extraction_batch_list.md`.

Keep each batch under the sub-agent's context window (~30K–60K tokens). Reduce size for dense files (PDFs, long transcripts).

#### Step 2: Spawn all mappers in parallel

Spawn **all** `spinosa-mapper` sub-agents in a **single message** — one per batch. Do not spawn sequentially. Do not wait for one to finish before spawning the next.

```spinosa-subagent
agent: spinosa-mapper
batch_id: batch_001
input: agent_reports/extraction_batch_list.md
output: agent_reports/extraction_batch_001.md
```

```spinosa-subagent
agent: spinosa-mapper
batch_id: batch_002
input: agent_reports/extraction_batch_list.md
output: agent_reports/extraction_batch_002.md
```

Each mapper reads its assigned files and extracts:

**For the dictionary:**
1. **Names** — people, roles, named entities. Merge variants into canonical forms.
2. **Places** — geographic locations, sites, regions. Merge variants.
3. **Organizations** — institutions, groups, agencies. Merge abbreviations.
4. **Explicit source terms** — terms visibly present in the source text. Record source language and source files.
5. **Inferred concepts** — domain-specific ideas, theories, frameworks inferred from multiple source terms. Mark as inferred.
6. **Domain terms** — specialized vocabulary, acronyms, jargon.
7. **Uncertain terms and metadata** — unresolved people, dates, places, or terms needing review.

**For content-grounded extraction (same pass):**
1. **One-paragraph summary** (3-5 sentences): what the file is about, arguments, evidence. Content-grounded.
2. **Key passages** (2-5): short quotes or close paraphrases with wikilinks and line references: `[[raw/path/file]]` L12-L15.
3. **Concept signals** (2-5): recurring concepts. Use dictionary canonical terms.
4. **Obsidian tags** (3-5): hierarchical `#tags` from concept signals, source type, and natural group (e.g., `#concept/professional-judgment`, `#type/interview`, `#group/exercise-1`).
5. **Connections**: related files as wikilinks: `[[raw/path/related_file]]`.

**Language rule:** Summaries in the source document's language. French source → French summary. English source → English summary.

Each mapper writes to `agent_reports/extraction_batch_{batch_id}.md`. No shared state, no locks.

**Metrics checkpoint:** every mapper appends one row to `logs/session_metrics.tsv` after writing. After all mappers return, verify each expected `batch_id` has a metrics row. Missing rows are process warnings (name them in the startup report) but do not invalidate extraction content.

#### Step 3: Collect and merge

After all sub-agents return, read every `agent_reports/extraction_batch_*.md`:

1. Merge all dictionary terms into the master dictionary (dedup by canonical form, union source files)
2. Append all extraction packets to `agent_reports/extraction_checkpoint.md`
3. Update `workspace_index.md` "Extraction Progress": `files_read == TOTAL_FILES`

No per-batch accumulation loop. One merge pass.

**Extraction-batch validation:**
- Every batch has valid `type: extraction_batch` frontmatter, assigned `batch_id`, `files_processed`, and `created`.
- Every processed file has path, source type, language, summary, key passages with line references, concept signals, tags, and connections.
- Key passages quoting or closely paraphrasing a raw source use `[[raw/path/file]]` followed by `L<n>` or `L<n>-L<n>`.

#### Step 4: Write per-file summaries into YAML headers

After all batches complete, write a short `summary` into each raw file's YAML frontmatter. Read `system/yaml_header_template.md` for the canonical schema. Summary: 4 lines max, capture key areas and concepts.

Spawn a **summarizer sub-agent** for this batch work. Use a smaller/cheaper model when available. It reads each file, condenses the extraction summary to 4 lines, and writes the `summary` field directly into the YAML header.

#### Step 5: Finalize dictionary

Write `system/dictionary.md` with accumulated canonical forms, aliases, explicit source terms, inferred concepts, uncertain terms, machine artifacts, languages, and source file references.

#### Step 6: Enrich context

Use accumulated evidence to enrich `system/context.md`:

- **Methods**: Observe what the raw copies contain. Infer the research methods.
- **Source universe**: List source types found, their languages, approximate date ranges.
- **Research vocabulary**: Key actors, institutions, places, and concepts that appear repeatedly.

### 2.3 Write navigation maps

After all batches complete, write multi-level navigation maps from the extraction batches.

#### Input

Read `agent_reports/extraction_batch_*.md` (all batches) for per-file summaries, key passages, and concept signals.

#### Step 1: Find the structure

Identify the natural groups in the corpus. Do not assume exercises, cohorts, or any specific structure. Read per-file summaries and determine the organizing principle. It might be exercises, topics, time periods, participants, or something else.

**Edge cases:**
- **Flat corpus** (no folder structure, no obvious grouping): one group. Organizing principle: "flat corpus".
- **Monolithic corpus** (one or a few large files): sections, chapters, or logical divisions as groups.
- **Tiny corpus** (<10 files): one group is fine.
- **Single-topic corpus**: one group with the topic as the principle.

Record the identified groups and their organizing principle. If no natural groups emerge, create one group containing all files.

#### Step 2: Write structural overview

Write one map at `maps/` root (e.g., `maps/corpus_overview.md`). This is the Level 0 map and the **central hub** of the Obsidian graph.

MUST use wikilinks for every reference: wikilinks to group maps (`[[maps/group_name/group_map]]`), theme maps (`[[maps/themes/theme_name]]`), and key file pointers (`[[raw/path/file]]`).

MUST include Obsidian `#tags` after the H1 heading: `#hub` plus `#group/<name>` for every group.

For each natural group:
- 2-4 sentence description (synthesized from per-file summaries)
- File count
- Key file pointers as wikilinks (3-5 files that best represent the group)

#### Step 3: Write group maps

For each natural group identified in Step 1 (skip if only one group and the overview already covers it):

1. Create a subdirectory under `maps/` named for the organizing principle.
2. Write one map file per group.

Each group map contains:
- Obsidian `#tags` after H1: `#group/<name>` + `#concept/<concept>` per recurring concept
- H2 "What this group is about" — synthesized from reading files
- H2 "Recurring concepts" — patterns across files, with key passages
- Each concept: description + examples with wikilinks and line references: `[[raw/path/file]]` L12-L15 + quote or paraphrase
- Wikilink back to hub: `[[corpus_overview]]`

**If only one group:** Write the group map at `maps/corpus_overview.md` (no subdirectory). The overview and group map can be the same file for small/flat corpora.

#### Step 4: Write theme maps

Identify concepts recurring across multiple groups. For each cross-cutting theme:

1. Create a `maps/themes/` subdirectory.
2. Write one map file per theme.

Each theme map contains:
- Obsidian `#tags` after H1: `#theme/<name>` + `#concept/<concept>` per related concept
- H2 with theme name + definition
- H3 per group where the theme appears + key passages with wikilinks: `[[raw/path/file]]` L12-L15
- Wikilinks to relevant group maps: `[[maps/group_name/group_map]]`
- H2 "Trajectory" — how the theme evolves across groups

**If no cross-cutting themes emerge:** skip theme maps. Record in the startup report.

#### Step 5: Verify coverage

Every file in the extraction checkpoint must appear in at least one map. If a file is missing from all maps, add it.

#### Step 6: Spot-check accuracy

Pick 5 random key passages from across the maps. For each, verify the quoted text exists at the cited line reference in the raw file. Record results in the startup report.

### 2.4 Serendipitous connection discovery

After maps are written, spawn `spinosa-serendippo` to find hidden connections that batch processing misses.

1. Spawn `spinosa-serendippo` with access to `maps/` and `raw/`
2. It reads maps to find under-connected concepts
3. It roams raw files following threads
4. It writes a serendipity report to `agent_reports/serendipity_report.md`
5. It proposes map updates (new cross-references, pattern documentation)

Open-ended. Continue until the report indicates diminishing returns.

### 2.5 Record ambiguities

After reading source files and building the dictionary, record ambiguities. Do not stop startup. Record in the dictionary, maps, or startup report as `unresolved` / `needs_review`:

1. **Name collisions** — "Maria" appears in 3 sources and identity is unclear. Keep distinct surface forms or mark canonical entry `unresolved`.
2. **Place ambiguity** — "the village" or "the coast" is unclear. Preserve the source phrase as a keyword.
3. **Unclear concepts** — domain term with no obvious definition. Include with a source-grounded note.
4. **Missing metadata** — no date, author, or context. Omit that header or mark `needs_review`.
5. **Source relationships** — two sources seem to contradict. Record the contrast as a gap.

Only pause for input when an ambiguity prevents valid indexing. Otherwise continue and list unresolved items in the startup report.

### 2.6 Update workspace index

Update `system/workspace_index.md` with:

- Raw copy coverage (count by type)
- Skipped media coverage (uncovered source media, by type)
- Navigation maps created
- Dictionary status (canonical names, places, organizations, concepts)
- Known gaps

Coverage counts must be exact.

### 2.7 Validate

Before reporting startup complete, run validation.

**Map validation:**
- Structural overview exists at maps/ root (excluding AGENTS.md, map_template.md)
- At least one group map exists (may be the overview itself)
- Each group map has "What this group is about" section
- Each group map has "Recurring concepts" section with key passages
- Key passages include file paths and line references. Raw wikilinks followed by `L<n>` or `L<n>-L<n>`
- Theme maps exist for spanning concepts (skip if single group)
- All wikilinks resolve to existing files
- Hub map includes `#hub` tag + `#group/<name>` per group
- Group maps include `#group/<name>` tag
- Theme maps include `#theme/<name>` tag
- Transcript speaker mappings verified when diarization/ASR artifacts exist

**Retrieval tests:**
1. **Structural retrieval** — open corpus overview, find a group, confirm it links to raw files
2. **Group retrieval** — open a group map, find a concept with key passages, confirm file paths exist
3. **Theme retrieval** — open a theme map, find evidence across groups, confirm passages grounded (skip if no theme maps)
4. **Passage retrieval** — grep a quote from a map in raw/, confirm the line reference
5. **Cross-group retrieval** — find a theme spanning 3+ groups, confirm evidence from each (skip if no theme maps)
6. **Unresolved metadata retrieval** — grep `needs_review` or `unresolved`, confirm findable

Startup is complete **only if** all applicable retrieval tests pass.

Also run `.bin/check-startup.sh` — the canonical automated checker for startup structure, YAML shape, wikilink resolution, and key-passage line references.

After validation passes, replace `setup_status: cli_started` with `setup_status: workspace_started` in `system/context.md` and `system/configuration.md`.

Move process-only extraction batch files (`agent_reports/extraction_batch_*.md`, extraction appendices, intermediate checkpoints) to `.trash/`. Keep final startup report, dictionary, workspace index, and maps in place.

---

## Recovery (skip on fresh run)

### Idempotency

- Skip valid dictionary entries unless repair is needed.
- Overwrite all generated maps from the current extraction checkpoint.
- Preserve extraction results from previous runs.

### Recovery from interruption

1. Write phase progress in the startup report or checkpoint in `agent_reports/`
2. Resume from the first incomplete phase
3. Keep `setup_status: cli_started` until validation passes

### Resume on restart

1. Read `agent_reports/extraction_batch_list.md`
2. List `agent_reports/extraction_batch_*.md` to find completed batches
3. Re-spawn only missing batches (same `batch_id`, same file list)
4. Skip batches whose output file exists

### Startup report dashboard

Generate a Unicode distribution bars chart in the startup report header.

**Characters:** `▓` (filled) + `░` (empty) + `█` (accent/total)

**Rendering:**
```
bar_width = 16 characters
filled = round((value / total) * bar_width)
empty = bar_width - filled
bar = "▓" * filled + "░" * empty
```

**Metrics to display:**
```
Extract  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  925/925 files
Maps     ▓▓▓▓▓▓▓▓▓▓▓▓░░░░  15 created
Dict     ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░  342 terms
Links    ▓▓▓▓▓▓▓▓▓▓░░░░░░  280 wikilinks
```

**Dashboard format:**
```
┌─ Startup Status ───────────────────────────────────────────────┐
│ Extract  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  925/925 files                     │
│ Maps     ▓▓▓▓▓▓▓▓▓▓▓▓░░░░  15 created                         │
│ Dict     ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░  342 terms                          │
│ Links    ▓▓▓▓▓▓▓▓▓▓░░░░░░  280 wikilinks                      │
│ Valid    ✓ passed                                                │
└─────────────────────────────────────────────────────────────────┘
```

### Extraction checkpoint dashboard

Generate a Unicode progress bar in the extraction checkpoint.

**Characters:** `▓` (filled) + `░` (empty)

**Rendering:**
```
bar_width = 16 characters
filled = round((files_read / total_files) * bar_width)
empty = bar_width - filled
bar = "▓" * filled + "░" * empty
```

**Metrics to display:**
```
Files    ▓▓▓▓▓▓▓▓▓▓░░░░░░  450/925 (48%)
Batches  ▓▓▓▓▓▓░░░░░░░░░░  30/60 completed
Status   in_progress
```

**Dashboard format:**
```
┌─ Extraction Progress ───────────────────────────────────────────┐
│ Files    ▓▓▓▓▓▓▓▓▓▓░░░░░░  450/925 (48%)                       │
│ Batches  ▓▓▓▓▓▓░░░░░░░░░░  30/60 completed                     │
│ Status   in_progress                                             │
└─────────────────────────────────────────────────────────────────┘
```
