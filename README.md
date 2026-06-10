<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/Banner_Spinosa_new.png">
    <img src="assets/Banner_Spinosa_new.png" alt="Spinosa Framework" width="100%">
  </picture>
</p>

# Spinosa

Spinosa is a CLI tool that prepares the soil for complex natural-language-corpus operations.
It starts from a corpus folder given, translates all the contents into .md files using @markItDown and @rapidOCR, in order to enable quick reading and data-ingestion for LLM agents. Once it has prepared the soil (workspace we call it) for the sequent agent, is sufficient to copy the prompt and execute in in your favourite local tool, we suggest using Opencode as it features a generous tier of free models, especially deepseek-v4-flash. Any other tools is supported, Codex, Claude Code, Kilocode, Gemini CLI, etc...

## 0. Installation

Open your terminal, launch this command and follow the onboarding procedure. Spinosa CLI will take care of all the technical aspects of tool-downloading and system preparation. Nothing leaves your computer, everything is local for now.

```bash
curl -fsSL https://github.com/TommasoPrinetti/spinosa/releases/latest/download/install.sh | bash
```

## 1. The corpus

Before starting spinosa, prepare your corpus folder.
A "Corpus folder" is a tidied up folder of all the data you need to serach for: books, article, interviews transcripts, PDFs, handwritten notes, .csv, .json, etc... That's your **corpus**. You will be asked to provide the folder path of your corpus when launchign spinosa new, this craetes a sibling folder, pre-processed where all the inputs have been tidied up into .md format.

Currently we're not supporting audio-transcription! (not yet)

This is how your' corpus folder could look like initially.

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


## Quick start

```bash
# 1. Create a workspace from your corpus
spinosa new

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
