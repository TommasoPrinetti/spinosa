<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/Banner_Spinosa_new.png">
    <img src="assets/Banner_Spinosa_new.png" alt="Spinosa Framework" width="100%">
  </picture>
</p>

# Spinosa

A CLI tool that turns a folder of source files into a searchable knowledge map
for multi-agent research workflows. Everything runs locally — no cloud, no API keys.

## Your starting point: a corpus

You have a folder of research materials. That's your **corpus** — PDFs, Office docs,
images, notes, CSV exports, audio, anything.

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

Spinosa copies your corpus into a **workspace**, converts everything to searchable
Markdown (Office docs via MarkItDown, scanned PDFs and images via RapidOCR OCR),
and builds navigation maps with cross-file wikilinks. The original corpus is never modified.

## Install

```bash
curl -fsSL https://github.com/TommasoPrinetti/spinosa/releases/latest/download/install.sh | bash
```

Zero dependencies. Bundled Python handles pip packages at install time.

## Quick start

```bash
# 1. Create a workspace from your corpus
spinosa new /path/to/corpus

# 2. Open the workspace with your LLM CLI
cd /path/to/corpus-spinosa
opencode        # or: claude, codex
```

The startup prompt tells the LLM what to do — index the corpus, build navigation maps,
validate the workspace, and write a startup report.

## Workspace

```
workspace/
├── AGENTS.md          Router that directs questions to specialist agents
├── raw/               Imported files, all converted to .md
├── maps/              Navigation maps with wikilinks
├── system/            Context, config, dictionary, index
├── agent_reports/     Output from agents
├── .agents/           Agent and skill definitions
└── .spinosa/          Framework metadata
```

## Commands

| Command | What it does |
|---|---|
| `spinosa new <corpus>` | Create a workspace and run setup |
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
