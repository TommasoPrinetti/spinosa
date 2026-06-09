<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/Banner-dithered.jpg">
    <img src="assets/Banner-dithered.jpg" alt="Pilosa Framework" width="100%">
  </picture>
</p>

# Pilosa

A CLI tool that takes a folder of source files and turns it into a searchable knowledge map for multi-agent research workflows.

## What it does

1. Copies and converts your source files into a workspace — every file becomes `.md`
2. Converts Office docs, PDFs, images, and more to searchable Markdown via built-in MarkItDown + RapidOCR
3. Generates YAML headers for each file
4. Creates navigation maps with wikilinks between files
5. Provides an orchestrator (`AGENTS.md`) that routes questions to specialist sub-agents

The original source folder is never modified. The workspace is self-contained. All conversion runs 100% locally — no cloud, no API keys.

## Install

```bash
curl -fsSL https://github.com/TommasoPrinetti/pilosa/releases/download/v0.4.12/install.sh | bash
```

This installs the pinned stable version (`0.4.7`) to `~/.pilosa/`. A bundled Python handles pip packages at install time. No system Python, npm, or Go required. Requires bash and internet access for first install.

For custom versions or options, download the script first:

```bash
curl -fsSL https://github.com/TommasoPrinetti/pilosa/releases/download/v0.4.12/install.sh -o install-pilosa.sh
bash install-pilosa.sh --help
```

## Quick start

> **Note:** The CLI setup works fine on its own, but actually using the workspace requires one of these LLM CLIs:
> - **[Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview)** — Anthropic's CLI agent
> - **[Codex](https://github.com/openai/codex)** — OpenAI's CLI agent
> - **[OpenCode](https://opencode.ai)** — open-source CLI agent
>
> Install one before you proceed.

### 1. Install

```bash
curl -fsSL https://github.com/TommasoPrinetti/pilosa/releases/download/v0.4.12/install.sh | bash
```

### 2. Create a workspace

From the dashboard, select **New workspace** and provide your source folder. Or run:

```bash
pilosa new /path/to/source/folder
```

This runs the onboarding flow:
- Scans the source folder for file types (PDFs, images, Office docs, Markdown, etc.)
- Converts Office docs, HTML, CSV, JSON, and text-based PDFs to Markdown via bundled MarkItDown (fully local)
- OCRs scanned PDFs and images to Markdown via bundled RapidOCR (ONNX, fully local)
- Copies a startup prompt to your clipboard
- Offers to open your LLM CLI in a new terminal tab

### 3. Run the startup workflow

Point your LLM CLI (Claude Code, Codex, OpenCode, etc.) at the workspace folder and paste the prompt. The LLM will:

1. Read project context and build a dictionary from `raw/`
2. Generate YAML headers for every raw file
3. Create navigation maps in `maps/` with wikilinks
4. Validate headers and map links
5. Write a startup report to `agent_reports/`

### 4. Ask questions

After startup, ask research questions normally. The orchestrator routes them through sub-agents.

## Dashboard

Run `pilosa` without arguments to open the interactive dashboard:

```bash
pilosa
```

Available options:

| Option | Description |
|--------|-------------|
| New workspace | Create a new workspace and run onboarding |
| Onboard workspace | Run onboarding on an existing workspace |
| Update workspace | Update workspace framework files |
| Check workspace | Validate workspace integrity |
| Sync agents | Sync agent and skill mirrors |
| Upgrade Pilosa | Upgrade to latest release |
| System health | Check system health and environment |
| Uninstall | Remove Pilosa from this system |
| Help | Show help information |

## Commands

### `pilosa new [directory]`

Create a new workspace and run onboarding. If no directory is given, you are prompted for the path.

```bash
pilosa new /path/to/source
```

Flags: `--gum`, `--no-gum`, `--no-color`, `--help`

### `pilosa onboard [workspace]`

Re-run onboarding on an existing workspace.

```bash
pilosa onboard /path/to/workspace
```

### `pilosa update [workspace]`

Update workspace framework files. Shows a plan and asks for confirmation.

```bash
pilosa update /path/to/workspace
pilosa update  # if inside a workspace
```

Flags: `--version X.Y.Z`, `--dry-run`, `--yes`, `--help`

### `pilosa upgrade`

Upgrade the Pilosa CLI to the latest release.

```bash
pilosa upgrade
pilosa upgrade --yes
```

### `pilosa check [workspace]`

Validate workspace integrity. Checks required files, source location, and map coverage.

```bash
pilosa check /path/to/workspace
pilosa check  # if inside a workspace
```

### `pilosa sync`

Regenerate vendor-specific agent mirrors and sync skills from canonical sources.

```bash
pilosa sync
```

### `pilosa health`

Check system health and environment.

```bash
pilosa health
```

### `pilosa uninstall`

Remove Pilosa from your system. Does not affect research workspaces.

```bash
pilosa uninstall
pilosa uninstall --yes
```

## Security

- The installer uses a **pinned stable version**, not `latest`
- SHA-256 checksums are verified for the framework tarball and vendor binaries
- Minimum release age can be enforced with `--min-days`
- Verify-only mode audits an existing install without reinstalling

## Workspace structure

```
workspace/
├── AGENTS.md                    Orchestrator routing contract
├── .bin/
│   ├── pilosa                    CLI entry point
│   └── lib/
│       └── metrics.sh            Metric helpers
├── .agents/                     Canonical agent and skill source
│   ├── agents/
│   └── skills/
├── .opencode/                   Generated mirror for OpenCode
├── .claude/                     Generated mirror for Claude
├── .codex/                      Generated mirror for Codex
├── CLAUDE.md                    Generated mirror of AGENTS.md
├── system/                      Architecture and configuration
│   ├── context.md
│   ├── configuration.md
│   ├── startup.md
│   ├── dictionary.md
│   ├── yaml_header_template.md
│   └── workspace_index.md
├── raw/                         Working corpus (copies of source files)
├── maps/                        Navigation maps with wikilinks
├── logs/                        Request and intake logs
├── agent_reports/               Sub-agent output
└── .trash/                      Retired files
```

## Rules

- Do not edit `raw/`, maps, dictionary, logs, or system files directly
- `connects_to` lists in YAML frontmatter stay at 3-5 entries
- File retirement goes to `.trash/`, not `rm`

---

## Development

### Clone and build

```bash
git clone https://github.com/TommasoPrinetti/pilosa.git
cd pilosa
```

### Branch strategy

- **`main`** - stable framework, tagged releases only
- **`dev`** - active development
- **`<name>`** - project workspace branch (from `dev`)

```bash
git checkout -b my-project dev
git push -u origin my-project
```

### Sync agents

```bash
pilosa sync
```

### Tests

```bash
bash tests/test_cli.sh
```

### Packaging a release

```bash
bash .bin/package-release.sh 0.4.7
```

### Publishing a release

```bash
bash .bin/publish-release.sh 0.4.7
```

Requires `gh` CLI and a clean working tree.

### Contributing

- Framework changes go to `dev` or a feature branch off `dev`
- Keep `.bin/` scripts pure bash, zero deps
