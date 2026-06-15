# Tour — Your First Ride Through Spinosa

This walkthrough takes you from zero to your first verified report. No technical background needed. Each chapter shows you what happens and what you'll see.

---

## Chapter 1: Install and point at your documents

Spinosa needs two things: the software itself, and a folder with your documents.

```bash
# One command installs everything
curl -fsSL https://github.com/TommasoPrinetti/spinosa/releases/latest/download/install.sh | bash

# Create a workspace from your document folder
spinosa new
```

**What you'll see:**
- The CLI asks you to pick your document folder (your corpus)
- It asks what to call the project
- It scans your folder and shows a summary: "12 PDFs, 3 Word docs, 5 images for OCR"

**What just happened:**
- Spinosa copied your files into a `raw/` folder
- PDFs and Word docs were converted to plain text (`.md` files)
- Images went through OCR (optical character recognition) to extract any text
- A configuration file was created with your project name and document location

When onboarding finishes, the CLI prints a startup prompt — a long command that begins with your LLM tool's name (like `opencode --prompt "..."`, `gemini -i "..."`, `qwen -i "..."`, or `claude "..."`). This command opens your workspace and starts the indexing process.

---

## Chapter 2: Startup — the automatic setup

Copy the startup prompt and run it. This tells your AI tool to index everything.

**What happens (5-30 minutes depending on corpus size):**

```
Phase 1: The agent checks that onboarding finished correctly.
Phase 2: The agent reads every file in raw/ and builds:
         - A dictionary of names, places, organizations, and key terms
         - Navigation maps — a table of contents showing what's in each group of files
         - A workspace index tracking what's been processed
Phase 3: Validation — the agent spot-checks quotes against original files
         and confirms every file appears in at least one navigation map.
```

**What you'll see at the end:**

```
┌─ Startup Status ───────────────────────────────────────────────┐
│ Extract  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  25/25 files                        │
│ Maps     ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  8 created                          │
│ Dict     ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  142 terms                          │
│ Valid    ✓ passed                                                │
└─────────────────────────────────────────────────────────────────┘
```

The bars show progress: full bars = done. The green checkmark means everything passed.

Your workspace is now ready. You can start asking questions.

---

## Chapter 3: Ask a question

You ask questions in plain language, the same way you'd ask a research assistant. The workspace has a startup report in `agent_reports/` that summarizes the indexing — from there, just ask.

**Example query:**
> "What did the Normandy interviews say about coastal erosion?"

**What happens behind the scenes — step by step:**

```
Your question
     │
     ▼
1. LOG — the orchestrator logs your request
     │
     ▼
2. CLASSIFY — it decides what kind of question this is
   ("evidence_answer" — grounded in sources)
     │
     ▼
3. SEARCHER — reads the navigation maps to find
   which files mention "coastal erosion" and "Normandy",
   then opens those files and extracts relevant passages
     │
     ▼
4. ANALYST — reads the project context to see if
   "sea level rise" or "shoreline management" are
   related concepts worth mentioning
     │
     ▼
5. SERENDIPPO — roams through files looking for
   hidden connections, like a link between erosion
   and local farming practices
     │
     ▼
6. WRITER — takes everything and composes a report:
   answer + evidence quotes + analysis + limitations
     │
     ▼
7. VERIFIER — opens each source file and checks
   every quote is accurate. Updates report status.
     │
     ▼
8. DELIVERY — your verified report appears in agent_reports/
```

**Total time:** A few minutes for most questions. Longer for complex synthesis requests.

---

## Chapter 4: Read your report

Every answer comes back as a markdown report in `agent_reports/`. Here's what you'll see, section by section.

### Navigation dashboard

At the top of every report, a small dashboard shows how the answer was built:

```
┌─ Corpus Navigation ──────────────────────────────────────────────┐
│ Maps   ▓▓▓▓▓▓░░░░░░░░░░  6 consulted                            │
│ Raw    ▓▓▓▓▓▓▓▓▓▓░░░░░░  45 scanned · 12 read                   │
│ Source ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  18 cited                               │
│ Status ✓ verified                                                 │
└─────────────────────────────────────────────────────────────────┘
```

- **Maps:** how many navigation maps the searcher consulted (more = broader search)
- **Raw:** how many files were scanned vs actually read in full
- **Source:** how many sources were cited in the final report
- **Status:** `○ pending` → `✓ verified` (passed checks) / `⚠ corrections` (minor fixes) / `✗ failed` (needs review)

### Answer

A short, direct answer to your question.

### Evidence

Quotes from your source files. Each quote includes:
- The file path (so you can find the original)
- The passage itself, verbatim
- A confidence level: **high**, **medium**, or **low**

> For the complete evidence set, see `agent_reports/evidence_appendix.md`

If there are many sources, the report shows the top ones and links to a full appendix.

### Analysis

Interpretation and patterns that the writer identified. This section is labeled clearly to separate it from the raw evidence — the facts are in Evidence, the meaning is in Analysis.

### Limitations

What the report doesn't cover, confidence gaps, missing sources. Every report is honest about its limits.

### Sources

A clean list of every file path referenced.

### Verification badge

After you receive the report, the verifier updates its status. You can check the Navigation Dashboard to see:
- `✓ verified` — all claims checked against source files, all accurate
- `⚠ corrections` — minor fixes were applied, report is still reliable
- `✗ failed` — some claims couldn't be verified; don't use as-is

---

## Chapter 5: What to do next

**Ask follow-up questions.** Dig deeper into specific sources or themes. The workspace remembers previous work.

**Add more documents.** Have new interviews or reports? Run the source intake workflow — Spinosa converts and indexes them, then updates the navigation maps.

**Explore with Obsidian (optional).** Spinosa uses Obsidian wikilinks (`[[filename]]`) in its navigation maps. If you open the workspace in Obsidian, you get a visual graph of how your documents connect — useful for discovering relationships the agents found.

**Keep your workspace healthy.** Over time, files can get stale. The Janitor agent audits your workspace and proposes cleanup. Review its reports periodically.

**Need help?** Check the [FAQ](FAQ.md) or the [Glossary](GLOSSARY.md) for plain-English explanations of any term.
