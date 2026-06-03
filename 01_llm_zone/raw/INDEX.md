---
type: "raw_copy"
source: "/Users/tommasoprinetti/Library/CloudStorage/GoogleDrive-tommaso.prinetti@sciencespo.fr/.shortcut-targets-by-id/1P14RD4yjJ7e6dP5xt71IVDEtfZiQuukc/EL2MP/EVOLUTION - ROOTVAULT/INDEX.md"
source_type: "vault_index"
text_type: "md"
language: "en"
organizations: ["EL2MP"]
topics: ["INDEX.md", "reference document", "prompting and instruction design", "evaluation, judgment, and evidence"]
keywords: ["llm", "ai", "prompt", "vademecum", "judgment", "evidence"]
concepts: ["[[Control, Alignment, and Obstacles]]", "[[Evaluation, Judgment, and Evidence]]", "[[LLM Representation and Relationships]]", "[[Prompting and Instruction Design]]", "[[Tasks, Conversations, and Comparative Practice]]", "[[Vademecum Reflection and Exemplary Work]]"]
explicit_source_terms: ["llm", "ai", "prompt", "vademecum", "judgment", "evidence", "task", "conversation"]
inferred_concepts: ["control, alignment, and obstacles", "evaluation, judgment, and evidence", "llm representation and relationships"]
metadata_uncertainty: ["date_missing"]
generated_by: "startup_agent"
generated_at: "2026-06-03"
processing_status: "copied_text_headered"
created: "2026-06-03"
updated: "2026-06-03"
---

# Vault Index — EL2MP Protocol Obsidian Vault

## Overview

| Metric | Count |
|---|---|---|
| Markdown files | 845 |
| Scan images (jpg/png) | 839 |
| Session photographs (jpg) | 265 |
| Audio recordings (mp3/wav) | 84 |
| Videos (mp4/mov) | 54 |
| Exercise folders | 19 |
| Cohorts | 4 (1–4) |

All `.md` files now carry YAML front matter (`cohort`, `student`, `page`, `parent_exercise`, `scan_exercise`, `title` for worksheets; `exercise`, `cohort`, `date`, `participant`, `language`, etc. for transcriptions).

## Folder Structure

Every exercise folder follows this structure:

```
Ex{N}-{title}/
├── Markdowns/   COHORT{1,2,3,4}/   OCR'd worksheet text with YAML front matter
├── Scan_images/ COHORT{1,2,3,4}/   Original scan files (jpg/png)
├── Audio/       COHORT{1,2,3,4}/   Session recordings (mp3)
└── Videos/      COHORT{1,2,3,4}/   Session recordings (mp4)
```

Cohort 4 (Ministère) appears in Ex0 only. Not all cohorts appear in all exercises — always check the table below.

## Exercise Breakdown

| # | Folder | .md | Scan img | Photo | Audio | Video | Cohorts |
|---|---|---|---|---|---|---|---|
| 0 | `Ex0-Pre-sessions-interviews` | 0 | 0 | 0 | 25 | 0 | 1,2,3,4 |
| 1 | `Ex1-draw-it-like-you-see-it` | 21 | 21 | 51 | 4 | 2 | 1,2,3 |
| 2 | `Ex2-harvesting-tasks` | 65 | 65 | 0 | 2 | 2 | 1,2,3 |
| 3 | `Ex3-taking-stock` | 166 | 166 | 6 | 3 | 4 | 1,2,3 |
| 4 | `Ex4-memorable-conversations` | 39 | 39 | 26 | 2 | 1 | 1,2,3 |
| 5 | `Ex5-subtracting-the-machine` | 94 | 94 | 0 | 2 | 5 | 1,2,3 |
| 6 | `Ex6-design-your-ai-test` | 116 | 116 | 21 | 2 | 4 | 1,2,3 |
| 7 | `Ex7-setting-up-the-test` | 0 | 0 | 0 | 0 | 0 | — |
| 8 | `Ex8-gathering-evidence` | 0 | 0 | 0 | 0 | 0 | — |
| 9 | `Ex9-judgment-day` | 74 | 74 | 54 | 23 | 10 | 1,2,3 |
| 10 | `Ex10-the-art-of-the-prompt` | 44 | 44 | 15 | 4 | 3 | 1,3 |
| 11 | `Ex11-tracking-shifts` | 3 | 3 | 0 | 1 | 2 | 1,3 |
| 12 | `Ex12-choosing-an-Exemplary-piece-of-work` | 5 | 5 | 0 | 0 | 0 | 1,3 |
| 13 | `Ex13-setting-up-the-Example` | 34 | 34 | 17 | 2 | 2 | 1,3 |
| 14 | `Ex14-the-imitation-game` | 22 | 22 | 0 | 1 | 0 | 1,3 |
| 15 | `Ex15-anatomy-of-an-Exemplary-work` | 21 | 21 | 16 | 2 | 3 | 1,3 |
| 16 | `Ex16-obstacles-dead-ends-highways` | 58 | 58 | 0 | 2 | 4 | 1,3 |
| 17 | `Ex17-charting-your-path` | 45 | 45 | 16 | 2 | 4 | 1,3 |
| 18 | `Ex18-distilling-the-vademecum` | 32 | 32 | 43 | 7 | 6 | 1 |

## File Naming

### Markdowns & Scan Images
```
COHORT{N}_EX{N}_{STUDENT}_PAGE{M}.md
COHORT{N}_EX{N}_{STUDENT}_PAGE{M}.jpg
```
- `N` = cohort number (1–4)
- `EX{N}` = exercise number (new vademecum numbering)
- `STUDENT` = anonymised first name (e.g. CLARA, LEA)
- `PAGE{M}` = original scan page number (not the vademecum page number)

### Audio
```
COHORT{N}_{YYYY}_{MM}_{DD}_EX{NUM}_{suffix}.mp3
```

### Videos
```
COHORT{N}_{YYYY}_{MM}_{DD}_EX{NUM}_{suffix}.mp4
```

## Numbering Shift (Old ↔ New)

Cohorts 1–2 use **old vademecum numbering** in headers/footers.
Cohort 3 uses **new vademecum numbering**.

YAML front matter captures both: `scan_exercise` (from the file header, old numbering for C1-2) and `parent_exercise` (from the folder, new numbering).

Key misalignments (see `REPO_GUIDE.md` for full table):

| Old | New | Folder |
|---|---|---|
| Ex2 | Ex3 | `Ex3-taking-stock` |
| Ex4 | Ex2 | `Ex2-harvesting-tasks` |
| Ex6 | Ex4 | `Ex4-memorable-conversations` |
| Ex7b/7d | Ex6 | `Ex6-design-your-ai-test` |
| Ex13 | Ex14 | `Ex14-the-imitation-game` |
| Ex14 | Ex13 | `Ex13-setting-up-the-Example` |

## Reference Files

| File | Description |
|---|---|
| `REPO_GUIDE.md` | Full conventions, header/footer formats, numbering translation |
| `AGENTS.md` | LLM schema for reading and navigating the vault |
