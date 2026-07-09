<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/Banner_Spinosa_new.png">
    <img src="assets/Banner_Spinosa_new.png" alt="Spinosa Framework" width="100%">
  </picture>
</p>

# Spinosa

[![License: PolyForm Noncommercial](https://img.shields.io/badge/license-PolyForm%20Noncommercial-blue)](LICENSE)
[![CI](https://github.com/TommasoPrinetti/spinosa/actions/workflows/ci.yml/badge.svg)](https://github.com/TommasoPrinetti/spinosa/actions)

Spinosa is a **local research framework** for AI coding agents. You give it a folder of PDFs, notes, transcripts, images, CSVs. It builds a workspace where agents can search, analyse, synthesise, and verify evidence from those sources. Every claim in a report traces back to a file you provided.

Spinosa routes questions through a goal-driven agent system. Operational questions can stay on `fast_path`; source-grounded work goes through an adaptive non-fast-path chain of artifacts and specialist agents. **No cloud, no uploads.** All document processing happens on your machine. (The LLM tool you open the workspace with may use its own API key.)

## Welcome

You have a folder of interviews, PDFs, field notes, reports. You need to find patterns, compare perspectives, and write evidence-backed answers. Spinosa turns those documents into a searchable workspace where AI agents find evidence, write reports, and verify every claim against your original files.

| You have... | Spinosa gives you... |
|---|---|
| 200 PDFs from field research | A searchable workspace where agents know every file |
| A question like "what did participants say about X?" | A report with direct quotes, source links, and confidence levels |
| Concerns about accuracy | Every claim checked against the original file by a dedicated verifier |
| New files later | Add them with one command and update the workspace |

## Features

- **Multi-format import** — PDFs, Word docs, spreadsheets, presentations, EPUB, HTML, ZIP, Outlook messages, structured data, audio formats supported by MarkItDown, images (OCR), CSVs, Markdown — all converted to `.md` where possible
- **Goal-driven orchestration** — non-fast-path work starts with a goal artifact, then adapts through sequential specialist agents
- **Source-grounded reports** — every claim links back to a source file
- **Offline-first** — all conversion and OCR runs locally
- **Cross-platform** — macOS and Linux, bash 3.2+
- **No lock-in** — works with OpenCode, Gemini CLI, Qwen Code, Claude Code, Codex CLI, or Kilo

## Prerequisites

- macOS or Linux
- An LLM CLI tool ([OpenCode](https://opencode.ai) recommended; [Gemini CLI](https://github.com/google-gemini/gemini-cli), [Qwen Code](https://github.com/QwenLM/qwen-code), [Claude Code](https://docs.anthropic.com), and [Codex CLI](https://github.com/openai/codex) also work)

## Quick Start

### 1. Prepare your corpus

A corpus is the folder with your research materials (PDFs, Word docs, images, notes, CSVs). Gather everything in one place.

### 2. Install

```bash
curl -fsSL https://github.com/TommasoPrinetti/spinosa/releases/download/stable/install.sh | bash
source ~/.zshrc   # macOS default; or: source ~/.spinosa/env.sh
```

**Beta channel** (GitHub prereleases — not stable):

```bash
curl -fsSL https://github.com/TommasoPrinetti/spinosa/releases/download/beta/install.sh | bash
spinosa upgrade --channel beta --yes
```

If you use bash, reload with `source ~/.bash_profile` (macOS) or `source ~/.bashrc` (Linux). A new terminal window also works.

### 3. Create the workspace

```bash
spinosa new
```

### 4. Follow the interactive onboarding

`spinosa new` walks you through pointing to your corpus and naming the project. It converts your files, builds navigation maps, and sets up agents.

When onboarding finishes, the CLI prints a startup prompt.
Copy and run it to open your workspace with your LLM tool. Then ask your questions.

## Tour

This is the full first-run flow from install to your first verified report.

### 1. Install and point at your documents

Spinosa needs the software itself and a folder with your documents.

```bash
curl -fsSL https://github.com/TommasoPrinetti/spinosa/releases/download/stable/install.sh | bash
source ~/.zshrc   # or: source ~/.spinosa/env.sh — needed after curl|bash
spinosa new
```

What you'll see:

- The CLI asks you to pick your document folder
- It asks what to call the project
- It scans your folder and shows a summary of what it found

What just happened:

- Spinosa copied your files into `raw/`
- PDFs and Office docs were converted to `.md`
- Images went through OCR to extract text
- A workspace configuration was created with your project name and source location

When onboarding finishes, the CLI prints a startup prompt that begins with your LLM tool's command. Run it to open the workspace and start indexing.

### 2. Startup and indexing

Running the startup prompt kicks off the automatic setup:

```text
Phase 1: Verify onboarding completed correctly
Phase 2: Read raw/ and build:
         - a dictionary of names, places, and key terms
         - navigation maps showing where topics live
         - a workspace index of processed files
Phase 3: Validate quotes and map coverage
```

Typical startup takes 5-30 minutes depending on corpus size. When it completes, your workspace is ready for questions.

### 3. Ask a question

Ask in plain language, for example:

> What did the Normandy interviews say about coastal erosion?

Behind the scenes, Spinosa routes the request through the right agent chain:

```text
question -> fast_path
         or
question -> non-fast-path -> goal artifact -> adaptive agent chain
         -> report and audit artifacts in agent_reports/
```

Most grounded questions finish in a few minutes. Larger synthesis requests take longer.

### 4. Read your report

Every answer comes back as a markdown report in `agent_reports/`.

Reports typically include:

- A short direct answer
- Evidence quotes with file paths and confidence levels
- Analysis that stays separate from the raw evidence
- Limitations and coverage gaps
- A source list
- A verification status such as `✓ verified`, `⚠ corrections`, or `✗ failed`

## How It Works

In plain English:

1. Spinosa copies your documents into `raw/`, converting them to text where needed.
2. It builds a dictionary and navigation maps so future searches know where to look.
3. You ask a question and the orchestrator dispatches specialized agents.
4. On non-fast-path work, it writes a goal artifact, dispatches one next agent, inspects the result, and adapts.
5. A writer composes a report when the chain needs one.
6. A verifier checks substantive claims back against the source files when needed.
7. An evaluator audits the route and may trigger a tightly scoped future-facing framework edit.

## Architecture

Spinosa is a two-layer system:

```
Your corpus  ──►  raw/ (converted to .md)  ──►  maps/ (navigation index)
                                                      │
                                                      ▼
  You  ◄──  agent_reports/
                  ▲
                  │
      evaluator ◄─ verifier ◄─ writer
                  ▲
                  │
         searcher / analyst / serendippo / mapper / janitor
                  ▲
                  │
            goal artifact
```

| Agent | Role |
|---|---|
| **Searcher** | Finds evidence in raw files and maps |
| **Analyst** | Adds broader context from prior artifacts and project context |
| **Writer** | Produces a user-facing report when the chain needs one |
| **Verifier** | Checks substantive claims and quotes against source files |
| **Evaluator** | Audits each non-fast-path route after the main chain completes |

See [`system/system_architecture_map.md`](system/system_architecture_map.md) for detailed diagrams.

## Workspace layout

```
workspace/
├── AGENTS.md          Points your LLM to specialist agents
├── raw/               Your documents, all as .md
├── maps/              Navigation links between files
├── system/            Context, dictionary, index, architecture
├── agent_reports/     Output from agents
├── .agents/           Agent definitions
└── .spinosa/          Framework metadata
```

System documentation: [`system/configuration.md`](system/configuration.md), [`system/dictionary.md`](system/dictionary.md), [`system/workspace_index.md`](system/workspace_index.md).

## Commands

| Command | What it does |
|---|---|
| `spinosa new` | Create a workspace from your corpus folder |
| `spinosa add` | Add new files or folders to an existing workspace |
| `spinosa upgrade` | Upgrade the **CLI** to the latest release |
| `spinosa update` | Sync **workspace** framework files to the installed CLI version |
| `spinosa doctor` | Health check: version skew, tools, cloud paths, Hermes drift |
| `spinosa uninstall` | Remove Spinosa from your system |

## Upgrading

Spinosa has two update steps:

```bash
spinosa upgrade              # 1. Global CLI (~/.spinosa/)
spinosa update --yes         # 2. Workspace framework files (run per workspace)
spinosa doctor               # 3. Verify everything aligns
```

After `spinosa update`, Hermes users should merge `.hermes/workspace.config.yaml` into `~/.hermes/config.yaml`.

See [CLI reference — Upgrade lifecycle](docs/reference/cli.md#upgrade-lifecycle).

## Next Steps

- Read the plain-English docs in [`docs/FAQ.md`](docs/FAQ.md) and [`docs/GLOSSARY.md`](docs/GLOSSARY.md)
- Dive into the technical reference in [`docs/reference/`](docs/reference/)
- Explore the system diagrams in [`system/system_architecture_map.md`](system/system_architecture_map.md)

## Contributing

See the repository contribution guide if present in your branch.

## License

[PolyForm Noncommercial 1.0.0](LICENSE). See the [license FAQ](https://polyformproject.org/licenses/noncommercial/1.0.0/) for permitted uses.

## Development

```bash
git clone https://github.com/TommasoPrinetti/spinosa.git
cd spinosa
bash tests/test_cli.sh
```

- `main`: stable, tagged releases
- `dev`: active development
