---
type: startup_protocol
role: setup_and_indexing_protocol
purpose: [translate the protected Root Vault into a searchable, header-indexed LLM Zone]
scope: [initial setup only]
connects_to:
  - AGENTS.md
created: 2026-05-28
updated: 2026-06-02
---

# STARTUP.md — Setup Translation and Indexing Protocol

This is the **protocol document** that defines what to do and how to do it. The **orchestrator** reads this file and executes the steps.

Use this file when the user asks to **start the Zone** or when setup files still contain placeholders.

Startup is the only authority that can mark setup complete. `.bin/check-startup.sh` is a developer-facing validation helper, not a separate user-facing setup path.

## Mission

Translate the protected Root Vault into the first usable **LLM Zone**: a searchable, header-indexed collection of raw copies with a shared dictionary for consistent terminology. After CLI onboarding, the Root Vault is the immutable original source and [[raw/]] is the active working corpus for normal source-grounded work.

The CLI onboarding script has already collected project name and Root Vault path, scanned the corpus, asked for explicit consent, copied accepted text-like files unchanged from the Root Vault into [[raw/]], and collected the preferred LLM CLI for handoff. Your job is to:

1. **Build the master dictionary and enrich the blueprint from corpus evidence**
2. **Generate YAML headers** for every raw copy
3. **Create the central map folder** at `maps/`
4. **Write detailed Obsidian-wikilink maps** that guide future LLMs into raw files
5. **Build concept maps** from repeated themes
6. **Update the master zone map**
7. **Run startup validation and retrieval tests**

The protocol runs in two phases: **Phase 1 (Setup Translation)** and **Phase 2 (Anchoring, Mapping, Validation)**. The CLI handles raw record writing; you handle translation, dictionary anchoring, central maps, validation, and recovery notes.

## Non-Negotiable

- **Never edit, rename, reorganize, or delete Root Vault files.**
- Treat Root Vault files as protected originals after onboarding; use [[raw/]] as the active working corpus for dictionary building, headers, maps, and normal retrieval.
- Do not copy binary files (PDFs, images, audio, video) into the Zone — use generated **source pointer** records in [[raw/]] and account for them in the zone index as **pointer-only**.
- Use the dictionary for consistent terminology across all headers.
- Preserve generated-file provenance (`generated_by`, `generated_at`, source path, and `processing_status`) on raw copy headers, source pointer records, central maps, concept maps, and zone reports.
- Use Obsidian wikilinks for internal map references to raw copies, pointer records, dictionaries, concept maps, and other maps.
- Put retrieval-critical terms in **YAML frontmatter** because fast grep starts there.
- Put interpretation and context in the body.
- Do not ask questions directly. Produce a Disambiguation Brief only for blocking ambiguity.
- Treat machine artifacts as findable noise until verified; never promote ASR, diarization, OCR, or conversion artifacts into canonical dictionary entries without source support.

## Required Startup Inputs

Mandatory initial reads:

1. `AGENTS.md`
2. [[CONFIGURATION]]
3. [[INFORMATIONS]]
4. [[HEADER_TEMPLATE]]

On-demand reads:
- [[SYSTEM_ARCHITECTURE_MAP]] only when architecture context is needed.

If the user already ran `bash .bin/onboard.sh`, treat its answers as the **setup draft** and complete startup without repeating those questions. Project description and helpful artifact URLs are optional context. If absent, record them as `not provided during fast setup` and infer the working scope from the active raw corpus during indexing. External source policy defaults to `no`; only ask through the orchestrator if user-provided URLs require fetching or the user requests external source access.

---

# Phase 1 — Setup Translation

## 1.1 Inspect Setup Draft

Read [[INFORMATIONS]] and [[CONFIGURATION]]. Identify filled fields, placeholders, and missing data.

Create a short todo list with the CLI's todo/task tool if available. **Mandatory** when the tool exists. Minimum todo items:

- inspect setup draft,
- verify Root Vault,
- synthesize blueprint/config,
- build dictionary and blueprint anchors,
- generate raw copy headers,
- create central navigation maps,
- build concept maps,
- validate headers and retrieval paths.

## 1.2 Translate Setup Draft

Treat CLI-generated answers as a **setup draft**, not as questions to repeat. Translate the draft into a usable research configuration:

- preserve the project title,
- preserve the project description if provided; otherwise write `not provided during fast setup` and continue,
- register helpful artifact URLs or file paths if provided; otherwise write `none provided during fast setup`,
- infer a tentative source universe, vocabulary, methods, outputs, unresolved ambiguities, and indexing target from the description, artifacts, and active raw corpus when available, and from [[raw/]] alone when description/artifacts are absent,
- keep inferred fields explicitly marked as inferred when useful.

Use shell/file tools to confirm the Root Vault path exists and is treated as **read-only**. Do not read Root Vault text directly for normal indexing when the corresponding raw copy exists; use the Root Vault only to verify protected paths and account for pointer-only or unsupported source files.

If artifact URLs are present, use web/MCP/browser tools **only** when `external_sources_allowed` is set to `yes`. If the policy is `no`, record URLs but do not fetch them.

## 1.3 Fill Blueprint and Configuration

- Fill [[INFORMATIONS]] (project title, project description status, helpful artifact URLs or file paths status, Root Vault path, evidence standards, external source policy).
- Fill [[CONFIGURATION]] (`root_vault_path`, `root_vault_mode`, `source_policy`, `external_sources_allowed`, `preferred_llm_cli`, `claim_standard`, `l2_policy`).
- Keep `setup_status: cli_started` until mapping, header validation, and retrieval tests have passed. Replace it with `setup_status: zone_started` in both files only at the end of Phase 2.

## 1.4 Audit the Translation

Before moving on, confirm:

- every project detail from the CLI draft is preserved or intentionally summarized,
- every artifact URL or file path is listed,
- every source policy and protected path is reflected in configuration,
- inferred scope, source universe, vocabulary, methods, outputs, and initial indexing target are present where useful,
- anything not translated is listed as deferred with a reason.

## 1.5 Question Gating

Do not ask follow-up questions before Phase 2 unless:

- the project title, Root Vault path, or preferred LLM CLI is absent,
- the Root Vault path cannot be located,
- external URL access needs permission because the user provided URLs and policy is not already `yes`, or
- a risky assumption blocks immediate indexing.

Missing project description and missing helpful artifact URLs do not block Phase 2. Treat them as absent context and use the corpus survey, dictionary, and central maps to derive the initial project description and artifact status.

The user's `start the Zone` prompt is already permission to run initial indexing.

---

# Phase 2 — Anchoring, Mapping, Validation

## 2.1 Survey Active Corpus And Root Vault Pointers

Survey [[raw/]] as the active working corpus, then compare against the Root Vault for pointer-only media and coverage gaps. For each raw directory:

1. List all files and subdirectories (skip `.DS_Store`, system files, empty dirs)
2. Note copied text-like file types (`.md`, `.txt`, `.csv`, `.json`, etc.), count per type, approximate date range
3. Read raw copies and source pointer records to characterize the folder's content accurately
4. Record: source types, modality, names, dates, topics, keywords, machine-readability, gaps

Separately account for binary or unsupported files that remain only in the Root Vault (PDFs, images, audio, video, unknown files). They should have `type: source_pointer` records in [[raw/]] with original path, media type, extension, size, processing status, and OCR/ASR/transcription/image-analysis status. They remain pointer-only until a later processing pass creates a text artifact.

## 2.2 Log Source Intake

Register the source batch in [[source_intake_log]]. If any sources are external, also log them in [[external_queries]]. This creates a traceable record of what was intake and when.

## 2.3 Build Master Dictionary And Blueprint Anchors

Read every text-based raw copy in [[raw/]]. Extract:

1. **Names** — people, roles, named entities. Merge variants into canonical forms (e.g., "Alice", "A. Tufano", "Alice Tufano" → canonical: "Alice Tufano"). Record the language of each term.
2. **Places** — geographic locations, sites, regions. Merge variants (e.g., "Pacific", "Pacific Islands", "Oceania" → canonical: "Pacific Islands"). Record the language.
3. **Organizations** — institutions, groups, agencies. Merge abbreviations (e.g., "WWF", "World Wildlife Fund" → canonical: "World Wildlife Fund"). Record the language.
4. **Explicit source terms** — terms visibly present in the source text. Record source language and source files.
5. **Inferred concepts** — domain-specific ideas, theories, frameworks inferred from multiple source terms. Mark as inferred and map to concept map entries only when source support is clear.
6. **Domain terms** — specialized vocabulary, acronyms, jargon used in the sources. Define each. Record the language.
7. **Uncertain terms and metadata** — unresolved people, dates, places, or terms needing review.
8. **Machine artifacts** — ASR speaker labels, diarization labels, OCR noise, conversion residue, timestamps, file-system artifacts, or obvious transcription errors.

**Multilingual rule:** Keywords must appear in the language they were found in. If a source is in French, French keywords are recorded. If in English, English keywords. If a concept appears in multiple languages, list all language variants as aliases so grep finds any form.

Example:
```markdown
| Canonical form | Language | Aliases | Source files |
|---|---|---|---|
| adaptation | fr | adapção (pt), adaptation (en) | interview_01.md |
| coral reef | en | récif corallien (fr), recife de coral (pt) | fieldnote_03.md |
```

Write [[dictionary]] with canonical forms, aliases, explicit source terms, inferred concepts, uncertain terms, machine artifacts, languages, and source file references. Every term that appears in more than one source file **MUST** have an alias entry so grep finds any variant in any language.

Use this same pass to enrich [[INFORMATIONS]] from raw corpus evidence:
- methods,
- source universe,
- recurring vocabulary,
- likely output needs,
- unresolved ambiguities.

Keep missing project description as absent if no reliable corpus-level description can be inferred. Do not block startup for it.

Noise quarantine:
- Put ASR speaker labels such as `SPEAKER_00`, diarization fragments, OCR hallucinations, timestamps, and conversion residue in `machine_artifacts`.
- Put plausible but unverified people, places, or concepts in `uncertain_terms`.
- Do not add machine artifacts to canonical people, organizations, places, or concepts unless Verifier or source context verifies them.

## 2.4 Generate Raw Copy Headers

For every raw copy file in [[raw/]], generate a YAML header using the dictionary. Skip `*.pointer.md` records; they are source pointers, not raw copies. The raw copy header must contain:

```yaml
---
type: raw_copy
source: "/absolute/path/to/root_vault/[relative-path]/[filename]"
source_type: interview | fieldnote | article | report | dataset | ...
text_type: md | txt | rtf | csv | json | ...
language: en | fr | pt | es | ...
date: "YYYY-MM-DD or YYYY-MM-DD"
people: ["canonical name from dictionary"]
places: ["canonical place from dictionary"]
organizations: ["canonical org from dictionary"]
topics: ["topic1", "topic2"]
keywords: ["keyword1", "keyword2", "keyword3"]
concepts: ["[[Concept Name]]"]
explicit_source_terms: ["surface term from source"]
inferred_concepts: ["inferred concept label"]
canonical_aliases: ["alias from dictionary"]
uncertain_terms: ["term needing review"]
machine_artifacts: ["SPEAKER_00", "ocr_noise"]
metadata_uncertainty: ["date_missing", "identity_ambiguous"]
related_sources: ["other_file.md"]
generated_by: startup_agent
generated_at: "YYYY-MM-DD"
processing_status: copied_text_headered
created: "YYYY-MM-DD"
updated: "YYYY-MM-DD"
---
```

Rules:
- Use canonical forms from the dictionary — **never invent new variants**.
- `people`, `places`, `organizations` **MUST** use dictionary canonical names.
- `keywords` should include both canonical terms and common aliases (so grep finds any form).
- `explicit_source_terms` are words or phrases actually present in the source.
- `inferred_concepts` are derived from evidence and must remain separate from explicit source terms.
- `canonical_aliases` lists dictionary aliases used for retrieval.
- `uncertain_terms`, `machine_artifacts`, and `metadata_uncertainty` quarantine noisy or incomplete metadata.
- `concepts` link to relevant concept entries in the navigation maps.
- `related_sources` lists other raw copies that share topics or concepts.
- `generated_by`, `generated_at`, and `processing_status` make generated headers traceable.
- Omit fields that have no value — do not write `people: []`.

Write the header at the top of each raw copy file. The body (original content) stays **unchanged**.

## 2.5 Create Central Navigation Maps

Create `maps/`. This is the canonical LLM navigation layer.

Create as many navigation maps as needed to cover all files in [[raw/]]. Each map should address a distinct retrieval concern — corpus structure, concepts, entities, source types, unresolved items, or any other organizing axis that helps future LLMs navigate the material. There is no fixed set of required maps; create what serves the corpus.

Start with `00_map_overview.md` as the entry point. It should explain which map to read for each retrieval goal.

Every internal map reference must use Obsidian wikilinks:

```markdown
[[raw/interviews/interview_01__txt|interview_01.txt]]
[[raw/reports/report_01__pdf.pointer|report_01.pdf pointer]]
[[folder_map]]
```

Do not use bare internal paths in map bodies except where an absolute Root Vault source path is required for provenance.

Each map file must include the header schema from [[HEADER_TEMPLATE]] (`type: navigation_map`):

```yaml
---
type: navigation_map
role: [descriptive role, e.g. folder_map, concept_map, entity_map]
purpose: [guide future LLM retrieval into the raw corpus]
scope: raw/
connects_to:
  - raw/
  - dictionary.md
map_quality: machine_generated | checked | human_reviewed
description_depth: retrieval_oriented
wikilink_policy: obsidian_wikilinks_required
generated_by: startup_agent
generated_at: YYYY-MM-DD
processing_status: machine_generated
created: YYYY-MM-DD
updated: YYYY-MM-DD
---
```

Each map entry for a raw copy or pointer record should include:
- wikilink to the raw copy or pointer record,
- original Root Vault source path when available,
- retrieval summary (3–6 sentences for normal files, 2–4 paragraphs for large/dense files),
- key topics, entities, and concepts present,
- useful search terms,
- metadata caveats,
- map quality / review status.

For recurring concepts appearing in 3+ raw copies, create a concept-focused map that links each concept to its source files with definitions, aliases, confidence, and Verifier status. Use [[dictionary]] to identify cross-cutting concepts.

## 2.6 Record Ambiguities

After reading the source files and building the dictionary, record ambiguities without stopping startup. The first startup pass should produce a usable retrieval layer even when metadata is incomplete.

Record these cases in the dictionary, central maps, zone map, or startup report as `unresolved` / `needs_review`:

1. **Name collisions** — If "Maria" appears in 3 sources and identity is unclear, keep distinct surface forms or mark the canonical entry `unresolved`.
2. **Place ambiguity** — If "the village" or "the coast" is unclear, preserve the source phrase as a keyword and mark the place field `needs_review` or omit it.
3. **Unclear concepts** — If a domain term has no obvious definition, include the term with a brief source-grounded note and mark the definition `needs_review`.
4. **Missing metadata** — If a source has no date, author, or context, omit that header field or mark the file `needs_review` in the relevant map and source entry.
5. **Cross-language ambiguity** — If concepts in different languages may not fully align, list variants as aliases only when source context supports it; otherwise keep separate entries.
6. **Source relationships** — If two sources seem to contradict each other, record the contrast as a gap rather than resolving it.

Only pause for orchestrator/user input when an ambiguity prevents a valid raw copy path, prevents writing a valid YAML header, or prevents validation from running. Otherwise continue and list unresolved items in the startup report.

Do not guess or over-merge. A conservative unresolved entry is better than a wrong canonical term.

## 2.7 Update Master Zone Map

Update [[zone_index]] with:

- Root Vault path,
- Raw copy coverage (how many copied text files, by type),
- Source pointer coverage (how many pointer-only media records, by media type),
- Central navigation maps created,
- Dictionary status (canonical names, places, organizations, concepts),
- Concept maps created,
- Non-text files noted as pointer-only,
- Known gaps.

Coverage counts must be exact:
- copied text count,
- pointer-only media count,
- files with valid headers,
- central maps created,
- concept maps created and map quality status,
- unresolved dates,
- unresolved people or identities.

## 2.8 Startup Validation

Before reporting startup complete, run validation. `.bin/check-startup.sh` may be used as a developer helper, but Startup remains responsible for judging completion.

Header validation:
- required YAML fields exist for `raw_copy`, `source_pointer`, `navigation_map`, and concept map files,
- `source` paths point to existing files where expected,
- array fields are arrays, not comma-separated strings,
- generated files have `generated_by`, `generated_at`, and `processing_status`,
- malformed frontmatter is fixed or reported before `zone_started`.

Retrieval tests:

1. **Keyword retrieval** — grep one dictionary keyword in [[raw/]] and confirm it reaches a raw copy header/body.
2. **Person retrieval** — if any person exists, grep canonical name or alias and confirm dictionary/header agreement.
3. **Concept retrieval** — if any concept exists, confirm a concept map links back to raw copies.
4. **Map navigation** — open [[00_map_overview]], follow at least one link to a specialized map, then follow at least one raw-copy or pointer-record wikilink to an existing file.
5. **Dictionary alias lookup** — grep at least one alias and confirm it resolves to a canonical dictionary row.
6. **Unresolved metadata retrieval** — if unresolved metadata exists, grep `needs_review`, `unresolved`, `metadata_uncertainty`, or `uncertain_terms` and confirm it is findable.

Startup is complete **only if** required headers are valid and every applicable retrieval test passes. If a test is not applicable because no such entity exists, record `not_applicable` with the reason in the startup report.

After validation passes, replace `setup_status: cli_started` with `setup_status: zone_started` in [[INFORMATIONS]] and [[CONFIGURATION]].

## 2.9 Idempotency And Recovery

Onboarding rerun behavior:
- skip existing raw text copies,
- skip existing source pointer records,
- leave legacy raw folder `index.md` files untouched,
- overwrite blueprint/config only when the user confirms overwrite or passes `--force`,
- never overwrite user-edited generated files in [[raw/]].

Startup rerun behavior:
- skip valid raw copy headers unless repair is needed,
- update central maps when raw files, pointer records, dictionary entries, or concept maps changed,
- update dictionary rows by merging evidence, not replacing user-reviewed rows,
- preserve `map_quality: checked` and `map_quality: human_reviewed` unless the user explicitly asks to regenerate.

Recovery behavior:
- write phase progress in the startup report or a checkpoint in [[05_agent_reports/]] when startup stops partially,
- resume from the first incomplete phase,
- repair missing headers, central maps, pointer records, dictionary rows, or concept maps without rerunning onboarding,
- keep `setup_status: cli_started` until validation passes.

Header worker delegation:
- Header assignment may be delegated only after the dictionary has a stable first pass.
- Batch size: 10 to 25 raw copies per worker, adjusted downward for long files.
- Handoff format: list raw paths, dictionary path, header schema path, required output fields, known unresolved terms, and a strict instruction to leave raw bodies unchanged.
- Startup owns merge, conflict resolution, and validation; workers never set `setup_status: zone_started`.

---
# Startup Output

Write one startup report in [[05_agent_reports/]] with the following fields:

- configuration status,
- Root Vault path verified,
- raw copy coverage,
- pointer-only source coverage,
- central maps created,
- dictionary size (names, places, organizations, concepts),
- files with valid headers,
- unresolved dates,
- unresolved people or identities,
- files created,
- concept maps created,
- validation and retrieval test results,
- remaining non-text files in Root Vault,
- recommended next actions.
