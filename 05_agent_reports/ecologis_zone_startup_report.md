---
type: report
created: 2026-06-03
updated: 2026-06-03
status: pass_with_corrections
---

# Ecologis Zone Startup Report

## Answer
The Ecologis Zone startup was completed against the active raw corpus. The Zone now has a dictionary, raw-copy headers for markdown sources, central maps, concept maps, exact live coverage counts, and a first-pass retrieval layer built from `raw/`.

## Evidence
> **Unknown archive maintainer**, *Vault Index — EL2MP Protocol Obsidian Vault* (undated, raw corpus)
>
> "All `.md` files now carry YAML front matter (`cohort`, `student`, `page`, `parent_exercise`, `scan_exercise`, `title` for worksheets; `exercise`, `cohort`, `date`, `participant`, `language`, etc. for transcriptions). Cohort 4 (Ministère) appears in Ex0 only. Not all cohorts appear in all exercises — always check the table below."
>
> Source: `raw/INDEX.md`

> **Unknown archive maintainer**, *Repository Guide — EL2MP Protocol Obsidian Vault* (undated, raw corpus)
>
> "This vault is a tidied version of a multimodal archive of the **EL2MP** research project. It contains scanned worksheet pages from student sessions, OCR'd into Markdown. Each `.md` file represents one physical scan page from a student's vademecum (workbook)."
>
> Source: `raw/REPO_GUIDE.md`

- Live startup survey counted `928` markdown raw copies, `1` copied processing log, `32` diarization JSON sidecars, and `1241` pointer-only media records under `raw/`.
- Live startup survey created `27` navigation maps, including `6` concept maps.
- The generated zone index records `854` files with date-related uncertainty and `2` unresolved identity variants.

## Analysis
The active corpus describes a semester-scale inquiry into LLM use, judgment, prompting, exemplary work, and reflection across cohorts. The generated maps split retrieval by exercise folder, participant, unresolved metadata, and concept family so future agents can choose narrower entry points before opening raw files.

The startup pass also surfaced two structural caveats. First, many worksheet pages expose only month-level dates from footers rather than exact day precision. Second, `raw/INDEX.md` is itself a source document whose legacy counts no longer match the live raw corpus snapshot, so `zone_index.md` is now the authoritative coverage ledger for the Zone.

## Limitations
- JSON diarization sidecars remain linked in maps but do not receive markdown YAML headers.
- Cohort 4 pre-session interview filenames still contain `XX` date placeholders.
- Report status updated after local verification against the live filesystem, `raw/INDEX.md`, `raw/REPO_GUIDE.md`, and `.bin/check-startup.sh`.
