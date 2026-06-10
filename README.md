<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/Banner_Spinosa_new.png">
    <img src="assets/Banner_Spinosa_new.png" alt="Spinosa Framework" width="100%">
  </picture>
</p>

# Spinosa

Turn a folder of documents into a searchable workspace for AI research agents.
Everything runs on your machine — no cloud, no API keys, no data leaves your computer.

## How it works

```
You have a corpus folder  →  spinosa new  →  a workspace with maps + agents
                                          →  open with any LLM CLI
                                          →  ask questions, get grounded answers
```

## Install

```bash
curl -fsSL https://github.com/TommasoPrinetti/spinosa/releases/latest/download/install.sh | bash
```

Zero dependencies. Bundled Python + pip packages at install time.

## Quick start

### 1. Prepare your corpus

A corpus is just the folder with your research materials — PDFs, Word docs, images, notes, CSVs. Example:

```
corpus/
├── paper.pdf
├── interview.docx
├── field-notes.txt
├── data.csv
├── photos/
│   ├── site-visit-1.jpg
│   └── site-visit-2.png
└── references/
    └── literature-review.md
```

### 2. Create a workspace

```bash
spinosa new /path/to/your/corpus
```

This creates a **workspace** next to your corpus (named `your-corpus-name-spinosa`). Your original files are never modified — Spinosa copies everything and converts it to Markdown.

### 3. Open with your LLM CLI

```bash
cd /path/to/your/corpus-spinosa
opencode
```

Spinosa gives you a **startup prompt** to paste as your first message. It tells the LLM to index your workspace, build navigation maps, and get ready for your questions. From there, just ask.

> **Note:** You need an LLM CLI like [OpenCode](https://opencode.ai), [Claude Code](https://docs.anthropic.com), or [Codex CLI](https://github.com/openai/codex). Install one before you proceed.

## Workspace layout

```
workspace/
├── AGENTS.md          Points your LLM to specialist agents
├── raw/               Your documents, all as .md
├── maps/              Navigation links between files
├── system/            Context, dictionary, index
├── agent_reports/     Output from agents
├── .agents/           Agent definitions
└── .spinosa/          Framework metadata
```

## Commands

| Command | What it does |
|---|---|
| `spinosa new <corpus>` | Create a workspace from your corpus folder |
| `spinosa prepare <ws>` | Re-run setup on an existing workspace |
| `spinosa update <ws>` | Update workspace framework files |
| `spinosa upgrade` | Upgrade the CLI to the latest release |
| `spinosa check <ws>` | Validate workspace structure |
| `spinosa health` | Check system status |
| `spinosa sync` | Sync agent and skill definitions |
| `spinosa uninstall` | Remove Spinosa from your system |

## Development

```bash
git clone https://github.com/TommasoPrinetti/spinosa.git
cd spinosa
bash tests/test_cli.sh
```

- `main` — stable, tagged releases
- `dev` — active development
