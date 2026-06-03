---
type: "raw_copy"
source: "raw/REPO_GUIDE.md"
source_type: "repository_guide"
text_type: "md"
language: "en"
organizations: ["Artificial Inquiries", "EL2MP"]
topics: ["REPO_GUIDE.md", "reference document", "prompting and instruction design", "evaluation, judgment, and evidence"]
keywords: ["llm", "ai", "prompt", "vademecum", "judgment", "evidence"]
concepts: ["[[Control, Alignment, and Obstacles]]", "[[Evaluation, Judgment, and Evidence]]", "[[LLM Representation and Relationships]]", "[[Prompting and Instruction Design]]", "[[Tasks, Conversations, and Comparative Practice]]", "[[Vademecum Reflection and Exemplary Work]]"]
explicit_source_terms: ["llm", "ai", "prompt", "vademecum", "judgment", "evidence", "fairness", "task"]
inferred_concepts: ["control, alignment, and obstacles", "evaluation, judgment, and evidence", "llm representation and relationships"]
metadata_uncertainty: ["date_missing"]
generated_by: "startup_agent"
generated_at: "2026-06-03"
processing_status: "copied_text_headered"
created: "2026-06-03"
updated: "2026-06-03"
---

# Repository Guide — EL2MP Protocol Obsidian Vault

## Overview

This vault is a tidied version of a multimodal archive of the **EL2MP** research project. It contains scanned worksheet pages from student sessions, OCR'd into Markdown. Each `.md` file represents one physical scan page from a student's vademecum (workbook).

## File Naming Convention

```
COHORT{N}_{EX}_{STUDENT}_PAGE{M}.md
```

- `COHORT1` — initial cohort (Sep 2024 – Feb 2025, EN/FR)
- `COHORT2` — second cohort (2025, FR mainly)
- `COHORT3` — third cohort (Jun 2025, EN mainly)
- `EX{N}` — exercise number as it appears in the **new** vademecum numbering
- `STUDENT` — anonymised first name
- `PAGE{M}` — original scan page number
- Suffixes like `(2)` indicate duplicate page numbers from the same student

## Header / Footer Format

Every page has two key markers extracted from the OCR:

### Header (line 1)
```
# Ex{N} - {Title}
```
The header uses the vademecum exercise number **at time of the session** — which may differ from both the folder name and the new numbering.

### Footer (last line)
Three cohort-specific patterns:

| Cohort | Pattern | Example |
|--------|---------|---------|
| **Cohort 1** (Sep 2024 – Feb 2025) | `ARTIFICIAL INQUIRIES / {MONTH YEAR} / EX{N}` | `ARTIFICIAL INQUIRIES / SEPTEMBER 2024 / EX02` |
| **Cohort 2** (FR, 2025) | `ARTIFICIAL INQUIRIES / QUALIFYING • EX{N}` or `ARTIFICIAL INQUIRIES [{CODE}] / {MONTH YEAR} / EX{N}` | `ARTIFICIAL INQUIRIES / QUALIFYING • EX03` / `ARTIFICIAL INQUIRIES [QP80] / MARCH 2025 / EX04` |
| **Cohort 3** (Jun 2025) | `ARTIFICIAL INQUIRIES / JUNE 2025 / {BLOCK} • EX{N} PAGE {M}` | `ARTIFICIAL INQUIRIES / JUNE 2025 / QUALIFYING • EX3B PAGE 20` |

### Supplementary pages
Some files (grids, drawing boards, diagrams) have no footer — the scan page was a blank template or answer grid. These are listed in `no_footer_files.txt`.

## Exercise Numbering Misalignment

The **folder names** follow the **new** vademecum numbering. The **headers** inside files often use the **old** vademecum numbering (the one in use during the session). Below is the translation table.

### Block structure

```
OLD VADEMECUM                    NEW VADEMECUM
────────────────────────────────────────────────
Cover                            Cover
Initialization block             Building block
Qualifying block                 Qualifying block
Benchmarking block               Benchmarking block
```

### Detailed mapping

| OLD VADEMECUM | NEW VADEMECUM | FOLDER |
|---|---|---|
| Cover | Cover | — |
| Initialization block | Building block | — |
| Brief 01 Starter Pack | *no equivalent* | — |
| *no equivalent* | Welcome to your vademecum | — |
| Brief 02 Becoming co-inquirers | Becoming a Co-Inquirer | — |
| *no equivalent* | About the EL2MP Project | — |
| **Qualifying block** | **Qualifying block** | — |
| *no equivalent* | Intro | — |
| **Exercise 1** – Breaking the Ice | **Ex 1** – Draw It Like You See It | `Ex1-draw-it-like-you-see-it` |
| **Exercise 2** – Taking stock | **Ex 3** – Taking stock | `Ex3-taking-stock` |
| *no equivalent* | 3a – Rough Impressions | `Ex3-taking-stock` |
| *replaces old format* | 3b – Rolling the Dice | `Ex3-taking-stock` |
| *(first part) no equivalent* | 3c – The Story Your LLM Tells (first part) | `Ex3-taking-stock` |
| **Ex 3a** – Memorable interactions | **Ex 4** – Memorable Conversations (first part) | `Ex4-memorable-conversations` |
| **Ex 3b** – Open Q&A | 3c – The Story Your LLM Tells (second part) | `Ex3-taking-stock` |
| **Exercise 4** – Finding tasks for the machine | **Ex 2** – Harvesting tasks | `Ex2-harvesting-tasks` |
| All of Ex4 focused on this | 2b – All the things you could do | `Ex2-harvesting-tasks` |
| **Exercise 5** – A thought experiment | **Ex 5** – Subtracting the machine | `Ex5-subtracting-the-machine` |
| Ex 5a – Substraction | 5a – A thought experiment | `Ex5-subtracting-the-machine` |
| Ex 5b – digital ? | *no equivalent* | — |
| Ex 5c – Building a lexicon (merged into 5a) | 5a – A thought experiment | `Ex5-subtracting-the-machine` |
| Ex 5d – Confronting perspectives | 5b – What remains after subtraction | `Ex5-subtracting-the-machine` |
| **Benchmarking block** | **Benchmarking block** | — |
| *no equivalent* | Intro | — |
| *no equivalent* | 6a – Business and/or pleasure? | — |
| **Ex 6** – Top and flop | Ex 4 – Memorable Conversations (last §) | `Ex4-memorable-conversations` |
| **Exercise 7** – All the things we do | 2a – All the things you do | `Ex2-harvesting-tasks` |
| Ex 7a – Choosing your core four | 6b – Choosing your core four | `Ex6-design-your-ai-test` |
| Ex 7b – What's on the line? | 6c – What's on the line | `Ex6-design-your-ai-test` |
| *no equivalent* | 7a – Writing instructions | `Ex7-setting-up-the-test` |
| *no equivalent* | 7b – Choosing the models | `Ex7-setting-up-the-test` |
| *no equivalent* | **Ex 8** – Gathering evidence | `Ex8-gathering-evidence` |
| **Ex 8** – A human at the AI trial | *no equivalent* | — |
| **Ex 9** – Judgment day | **Ex 9** | `Ex9-judgment-day` |
| Ex 9 – Judgment day, weighing the evidence | 9a – Weighing the evidence | `Ex9-judgment-day` |
| Ex 9 – Judgment day, the verdict is in | 9b – The verdict is in | `Ex9-judgment-day` |
| Ex 9a – Revisiting the ruling, professional usefulness | 9c – Revisiting the ruling (first part) | `Ex9-judgment-day` |
| Ex 9b – Revisiting the ruling, fairness assessment | 9c – Revisiting the ruling (second part) | `Ex9-judgment-day` |
| Ex 9c – The Final ruling | 9c – Revisiting the ruling (last part) | `Ex9-judgment-day` |
| **Ex 10** | **Ex 10** | `Ex10-the-art-of-the-prompt` |
| **Ex 11** | **Ex 11** | `Ex11-tracking-shifts` |
| *no equivalent* | **Ex 12** | `Ex12-choosing-an-Exemplary-piece-of-work` |
| **Ex 13** – Imitation Game | **Ex 14** – Imitation Game | `Ex14-the-imitation-game` |
| **Ex 14** – Mapping | **Ex 13** – Mapping | `Ex13-setting-up-the-Example` |
| **Ex 15** – Dependency | **Ex 15** – Dependency | `Ex15-anatomy-of-an-Exemplary-work` |
| **Ex 16** – Obstacles | **Ex 16** – Obstacles | `Ex16-obstacles-dead-ends-highways` |
| **Ex 17** – Resolution | **Ex 17** – Resolution | `Ex17-charting-your-path` |
| **Ex 18** – Distilling | **Ex 18** – Distilling | `Ex18-distilling-the-vademecum` |

## Key Rules for Working With Files

1. **Header takes priority over folder name** for determining which exercise a file belongs to semantically
2. **Footer format depends on cohort** (see table above)
3. **Supplementary pages** (grids, blank diagrams, "+" signs) may lack a footer — this is intentional
4. Some files have page numbers in the footer (`PAGE N`), some don't — Cohort 1/2 often omit them
5. Some files have `---` appended to the footer from the OCR extraction marker — this is a parsing artifact
6. Files with `(2)` suffix in the name are duplicates where the same page number exists for the same student
7. **PAGE number in filename ≠ vademecum page number.** The `PAGE{N}` in filenames is a leftover from the original PDF splitting — it does not correspond to the real page numbers found in footers (`PAGE N` in Cohort 3 footers). E.g. `COHORT1_EX10_LEA_PAGE38.md` has filename page 38 but footer pages 91-92.
8. **A3 / wide-format pages** sometimes have two footers — the scan was horizontal (two worksheet halves per sheet). In such cases, keep the first header and the last footer, merge the content into a single file.
