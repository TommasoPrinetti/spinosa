---
type: "raw_copy"
source: "/Users/tommasoprinetti/Library/CloudStorage/GoogleDrive-tommaso.prinetti@sciencespo.fr/.shortcut-targets-by-id/1P14RD4yjJ7e6dP5xt71IVDEtfZiQuukc/EL2MP/EVOLUTION - ROOTVAULT/AGENTS.md"
source_type: "vault_agent_guide"
text_type: "md"
language: "en"
organizations: ["EL2MP"]
topics: ["AGENTS.md", "reference document", "prompting and instruction design", "evaluation, judgment, and evidence"]
keywords: ["llm", "ai", "prompt", "vademecum", "evidence", "bias"]
concepts: ["[[Evaluation, Judgment, and Evidence]]", "[[LLM Representation and Relationships]]", "[[Prompting and Instruction Design]]", "[[Tasks, Conversations, and Comparative Practice]]", "[[Vademecum Reflection and Exemplary Work]]"]
explicit_source_terms: ["llm", "ai", "prompt", "vademecum", "evidence", "bias", "task", "conversation"]
inferred_concepts: ["evaluation, judgment, and evidence", "llm representation and relationships", "prompting and instruction design"]
metadata_uncertainty: ["date_missing"]
generated_by: "startup_agent"
generated_at: "2026-06-03"
processing_status: "copied_text_headered"
created: "2026-06-03"
updated: "2026-06-03"
---

# AGENTS.md — LLM Schema for the EL2MP Protocol Vault

> Adapted from Andrej Karpathy's [LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f).
> This file was stress-tested by a swarm of adversarial LLM personas (see §Adversarial Swarm Report).

---

## Core Principle

This vault is a **complete, immutable archive** of the EL2MP research project. It does not change. The LLM's job is to read, understand, and navigate it as a living wiki — treating the vault's own structure, naming conventions, and cross-references as the knowledge base. The LLM does not write to the vault; it reads from it, synthesizes from it, and answers questions about it. The human explores; the LLM connects.

---

## 1. Single-Layer Architecture

```
vault/
├── Ex0-Pre-sessions-interviews/
│   ├── Markdowns/   COHORT{1,2,3,4}/
│   ├── Scan_images/ COHORT{1,2,3,4}/
│   ├── Audio/       COHORT{1,2,3,4}/
│   └── Videos/      COHORT{1,2,3,4}/
├── Ex1-draw-it-like-you-see-it/
│   └── ... (same structure)
├── Ex2-harvesting-tasks/
│   └── ...
├── Ex18-distilling-the-vademecum/
├── INDEX.md           ← Vault catalog: counts per exercise, naming conventions
├── REPO_GUIDE.md      ← Full conventions: headers, footers, numbering translation
└── AGENTS.md          ← THIS FILE
```

There is no separate `wiki/` directory. The vault **is** the wiki. Every `Ex{N}-{title}/` folder is both the raw source and the browsable knowledge unit. Navigation starts from `INDEX.md` and `REPO_GUIDE.md`, then drills into exercises, cohorts, students.

Every `.md` file carries **YAML front matter** with structured metadata:
- **OCR worksheets** (`Markdowns/`): `cohort`, `student`, `page`, `parent_exercise` (folder), `scan_exercise` (from header), `title`
- **Transcriptions** (`Transcriptions/`): `exercise`, `cohort`, `date`, `participant`, `duration`, `language`, `asr_model`, `speakers_detected`, `processed`

### Immutability Rule
**Never modify any file in this vault.** The LLM reads only. If synthesis is needed (comparison, analysis, presentation), the LLM creates ephemeral output in the conversation or in `/tmp/` — never inside the vault.

---

## 2. Vault Conventions

### Folder Structure
Every exercise folder follows:
```
Ex{N}-{title}/
├── Markdowns/   COHORT{1,2,3,4}/   OCR'd worksheet text
├── Scan_images/ COHORT{1,2,3,4}/   Original scan files (jpg/png)
├── Audio/       COHORT{1,2,3,4}/   Session recordings (mp3)
└── Videos/      COHORT{1,2,3,4}/   Session recordings (mp4)
```

Cohort 4 (Ministère) appears in Ex0 only. Not all cohorts appear in all exercises — always check `INDEX.md`.

### File Naming

| Type | Pattern | Example |
|---|---|---|
| Markdowns | `COHORT{N}_EX{N}_{STUDENT}_PAGE{M}.md` | `COHORT1_EX10_LEA_PAGE38.md` |
| Scans | Same as markdowns, `.jpg` extension | `COHORT1_EX10_LEA_PAGE38.jpg` |
| Audio | `COHORT{N}_{YYYY}_{MM}_{DD}_EX{NUM}_{suffix}.mp3` | `COHORT3_2025_10_09_EX1.mp3` |
| Video | `COHORT{N}_{YYYY}_{MM}_{DD}_EX{NUM}_{suffix}.mp4` | `COHORT3_2025_10_09_EX1.mp4` |

### Numbering Misalignment
Folders use **new** vademecum numbering. Headers in markdown files use **old** numbering for Cohorts 1–2, **new** for Cohort 3. See `REPO_GUIDE.md` §Exercise Numbering Misalignment for the full translation table. Key shifts:

| Old | New | Folder |
|---|---|---|
| Ex2 | Ex3 | `Ex3-taking-stock` |
| Ex4 | Ex2 | `Ex2-harvesting-tasks` |
| Ex13 | Ex14 | `Ex14-the-imitation-game` |
| Ex14 | Ex13 | `Ex13-setting-up-the-Example` |

### Key Rules for Reading
- **Header** in the markdown file takes priority over folder name for semantic exercise identification
- **Footer** format depends on cohort (3 patterns — see `REPO_GUIDE.md`)
- `PAGE{N}` in filenames ≠ vademecum page number (it's a PDF-split artifact)
- Files with `(2)` suffix are duplicate page numbers from the same student
- Ex7 and Ex8 are empty (no data collected yet)

#### Adversarial Review #1 — The Archivist
> **"The vault mixes three kinds of data: text (already structured), scans (images needing OCR), and recordings (needing transcription). An LLM asked to 'read the vault' needs different strategies for each."**
>
> **Accepted.** The LLM must classify sources by type before attempting to extract information. Added read strategies below.

---

## 3. Operations

### 3a. Navigate

**Trigger:** Any query or task.

**Flow:**
1. **Read `INDEX.md`** — get the overview: which exercises exist, which cohorts appear where, file counts
2. **Read `REPO_GUIDE.md`** — understand numbering, header/footer conventions, naming rules
3. **Locate relevant folders** — based on the query, drill into specific `Ex{N}-{title}/` subdirectories
4. **Map old-to-new numbering** — when searching by exercise, use the translation table from REPO_GUIDE.md

### 3b. Read & Extract

**Trigger:** Reading a specific source file.

**Strategy by type:**

| Source type | Read strategy |
|---|---|---|
| **Markdown** (`.md`) | Read directly. YAML front matter provides structured metadata (cohort, exercise, student). Header tells you the exercise, footer tells you the cohort/date. Content is student worksheet text or transcript. |
| **Scan image** (`.jpg`/`.png`) | First check if corresponding `.md` exists. If not, describe the image visually. Never modify. |
| **Audio** (`.mp3`/`.wav`) | Transcribe first (use available STT). Extract metadata from filename: `COHORT{N}_{YYYY}_{MM}_{DD}_EX{NUM}` gives cohort, date, exercise. |
| **Video** (`.mp4`/`.mov`) | Same as audio + visual description of the session context. |

### 3c. Query

**Trigger:** Human asks a question.

**Flow:**
1. **Navigate** — read `INDEX.md` and `REPO_GUIDE.md` to locate relevant exercises and cohorts
2. **Read** — drill into the relevant markdowns, scan images, audio transcripts
3. **Synthesize** — connect findings across exercises, cohorts, time periods
4. **Cite** — use the file path and naming convention to reference sources clearly

**Answer types:**
- Direct answers ("what did Clara write in Ex9?")
- Cross-cohort comparisons ("how did Cohort 1 vs Cohort 3 answer Ex5?")
- Longitudinal trends ("did attitudes toward AI shift across the semester?")
- Timeline reconstructions ("what happened in session X?")
- Concept tracing ("how does the word 'prompt' appear across exercises?")

### 3d. Analyze (ephemeral output)

**Trigger:** Human asks for synthesis, comparison, or presentation.

**Rules:**
- Output goes to conversation or `/tmp/` — never inside the vault
- Formats: markdown, Marp slides, comparison tables, charts (matplotlib), CSV data extracts
- Each analysis should cite its sources with vault paths

#### Adversarial Review #2 — The Ethnographer
> **"The vault is filled with human voices — students reflecting on their own learning. An LLM that only 'extracts data' misses the narrative. The most valuable answers will trace how individual students change across exercises."**
>
> **Accepted.** Added a longitudinal reading strategy: for any query about a student, read their pages chronologically across exercises to surface shifts in thinking.

#### Adversarial Review #3 — The Ethicist
> **"Student names are pseudonymized but still identifiable within the research team. The LLM must not reconstruct dossiers or aggregate personal details across sources in a way that feels invasive."**
>
> **Accepted.** When answering questions about individual students, the LLM should focus on their exercise responses and learning trajectory — not compile a personality profile. Flag any query that asks for personal judgement ("what kind of person is X?").

---

## 4. Cross-Reference Map

This vault can be navigated along multiple axes:

| Axis | How to traverse |
|---|---|
| **By cohort** | Each cohort appears across multiple exercises. Filter `Audio/COHORT{N}`, `Markdowns/COHORT{N}`, etc. |
| **By student** | A student's name appears in markdowns, audio, and video filenames across exercises. Trace them chronologically. |
| **By exercise** | Each `Ex{N}` folder contains all cohorts that did that exercise. Read markdowns per cohort, then compare. |
| **By time** | Audio/video filenames encode dates (`YYYY_MM_DD`). Sort to reconstruct the session timeline. |
| **By concept** | Search markdown content for keywords (e.g. "prompt", "bias", "trust"). Track how usage changes by exercise and cohort. |

---

## 5. Tools

- **Obsidian** — browse the vault, graph view for connections, search

---

## 6. LLM Realm — the writable research layer

The sibling folder `EVOLUTION - LLM REALM/` (at the same level as this vault) is the **writable research map**. It contains:
- Agent role definitions and skills (Cicero, Varro, Lucrezio, Tacito)
- Exercise maps, concept indexes, evidence fragments
- User Blueprint and research tendencies
- Question logs and structured research needs
- Mailbox for agent-to-researcher leads
- Agent reports and maintenance logs

**Relationship between the two vaults:**
| This vault (`EVOLUTION - ROOTVAULT`) | `EVOLUTION - LLM REALM/` |
|---|---|
| Immutable source of truth | Writable synthetic map |
| Raw archive (scans, markdowns, audio, video) | Indexed, LLM-ready metadata and fragments |
| Read-only for agents | Read/write for agents |
| Modified only by the researcher | Maintained by agents (Cicero, Varro, Lucrezio, Tacito) |

**Rule for agents:** Read from this vault for source truth. Write to `EVOLUTION - LLM REALM/` for indexes, logs, and agent output. See `EVOLUTION - LLM REALM/AGENTS.md` for full permissions.
