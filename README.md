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

Spinosa runs a chain of sub-agents (searcher, analyst, writer, verifier) to produce reports from your corpus. **No cloud, no uploads.** All document processing happens on your machine. (The LLM tool you open the workspace with may use its own API key.)

## Features

- **Multi-format import** — PDFs, Word docs, images (OCR), CSVs, Markdown — all converted to `.md`
- **Sub-agent pipeline** — dedicated agents for search, analysis, writing, and verification
- **Source-grounded reports** — every claim links back to a source file
- **Offline-first** — all conversion and OCR runs locally
- **Cross-platform** — macOS and Linux, bash 3.2+
- **No lock-in** — works with OpenCode, Claude Code, or Codex CLI

## Prerequisites

- macOS or Linux
- An LLM CLI tool ([OpenCode](https://opencode.ai) recommended; [Claude Code](https://docs.anthropic.com) and [Codex CLI](https://github.com/openai/codex) also work)

## Quick start

### 1. Prepare your corpus

A corpus is the folder with your research materials (PDFs, Word docs, images, notes, CSVs). Gather everything in one place.

### 2. Install

```bash
curl -fsSL https://github.com/TommasoPrinetti/spinosa/releases/latest/download/install.sh | bash
```

### 3. Create the workspace

```bash
spinosa new
```

### 4. Follow the interactive onboarding

`spinosa new` walks you through pointing to your corpus and naming the project. It converts your files, builds navigation maps, and sets up agents.

When onboarding finishes, the CLI prints a startup prompt.
Copy and run it to open your workspace with your LLM tool. Then ask your questions.

## Architecture

Spinosa is a two-layer system:

```
Your corpus  ──►  raw/ (converted to .md)  ──►  maps/ (navigation index)
                                                      │
                                                      ▼
  You  ◄──  agent_reports/  ◄──  writer  ◄──  searcher + analyst
                                        └──  verifier
```

| Agent | Role |
|---|---|
| **Searcher** | Finds evidence in raw files and maps |
| **Analyst** | Provides broader context and alternative framings |
| **Writer** | Synthesises findings into reports |
| **Verifier** | Checks claims and quotes against source files |

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

System documentation: [`system/startup.md`](system/startup.md), [`system/configuration.md`](system/configuration.md), [`system/dictionary.md`](system/dictionary.md), [`system/workspace_index.md`](system/workspace_index.md).

## Commands

| Command | What it does |
|---|---|
| `spinosa new` | Create a workspace from your corpus folder |
| `spinosa prepare <ws>` | Re-run setup on an existing workspace |
| `spinosa update <ws>` | Update workspace framework files |
| `spinosa upgrade` | Upgrade the CLI to the latest release |
| `spinosa check <ws>` | Validate workspace structure |
| `spinosa health` | Check system status |
| `spinosa sync` | Sync agent and skill definitions |
| `spinosa uninstall` | Remove Spinosa from your system |

## Upgrading

```bash
spinosa upgrade
```

See [CHANGELOG.md](CHANGELOG.md) for release history.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

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
