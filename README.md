
<p align="center">
  <img src="assets/logo.jpg" alt="Pilosa">
</p>

# Pilosa

Pilosa turns a folder of source material into a searchable, header-indexed, multi-agent-readable knowledge map. After onboarding, the source location remains the immutable original and `raw/` becomes the active working corpus. A thin orchestrator (`AGENTS.md`) routes every prompt through specialist sub-agents or executes the startup workflow directly.

## Install

One command. Zero dependencies.

```bash
curl -fsSL https://github.com/TommasoPrinetti/pilosa/releases/download/v0.3.0/install.sh | bash
```

This installs the **pinned stable version** (`0.3.0`). No npm, no Python, no Go — fully autonomous.

For options (specific version, security flags, etc.), download first:

```bash
curl -fsSL https://github.com/TommasoPrinetti/pilosa/releases/download/v0.3.0/install.sh -o install-pilosa.sh
bash install-pilosa.sh --version 0.3.0
bash install-pilosa.sh --min-days 7
bash install-pilosa.sh --verify-only
```

## Quick Start

### 1. Create a workspace

```bash
pilosa new /path/to/my-research
```

This runs the full onboarding flow:
- **Corpus selection** — point to your source folder (PDFs, notes, markdown, etc.)
- **Workspace creation** — a sibling folder `<name>-pilosa/` is created next to your corpus
- **Corpus scan** — counts files by type, shows byte totals
- **Batch import** — multi-select picker lets you choose which file types to import
- **PDF handling** — imported as plain-text Markdown when `pdftotext` is available
- **CLI handoff** — copies a startup prompt to your clipboard for your LLM CLI

### 2. Paste the prompt into your LLM CLI

Open Claude Code, Codex, OpenCode, or whichever CLI you picked, point it at the workspace folder, and paste the prompt. The LLM will:

1. Read project context and build the master dictionary from `raw/`
2. Generate YAML headers for every raw file
3. Create detailed Obsidian-wikilink maps in `maps/`
4. Validate headers, map links, and run retrieval tests
5. Write a startup report to `agent_reports/`

After that, ask research questions normally. The orchestrator routes them through the right sub-agents.

### 3. Explore your workspace

Open the workspace folder in Obsidian to browse the knowledge graph. Maps contain wikilinks (`[[raw/filename]]`) that connect everything into a navigable graph.

## Dashboard

Run `pilosa` without arguments to open the interactive dashboard:

```
 pilosa
```

The dashboard detects your environment and shows:
- **Workspace status** — project name, setup status, framework version
- **Discovered workspaces** — all registered workspaces on your system
- **Detected LLM CLIs** — Claude Code, Codex, OpenCode, etc.

Select an option with arrow keys and Enter:

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

## Commands Reference

### `pilosa new [directory]`

Create a new workspace and run the full onboarding flow.

```bash
pilosa new /path/to/my-research
```

If no directory is given, you are prompted for the corpus path. The workspace is created as a sibling folder.

**Flags:**
- `--gum` — use interactive Gum prompts (if installed)
- `--no-gum` — use plain shell prompts (default)
- `--no-color` — disable colored output
- `--help` — show usage

### `pilosa onboard [workspace]`

Re-run onboarding on an existing workspace. Skips workspace creation and goes straight to source selection, corpus scan, and startup handoff.

```bash
pilosa onboard /path/to/workspace
```

**Flags:** same as `pilosa new`

### `pilosa update [workspace]`

Update workspace framework files. Shows an update plan and asks for confirmation before writing.

```bash
pilosa update /path/to/workspace
pilosa update  # if inside a workspace
```

The update separates clean replacements, forced replacements, locally modified files, new files, and retired-file cleanup.

**Flags:**
- `--version X.Y.Z` — target framework version (default: latest)
- `--dry-run` — show what would change without writing
- `--yes` — apply without confirmation
- `--help` — show usage

### `pilosa upgrade`

Upgrade the Pilosa CLI to the latest release. Shows release notes and asks for confirmation.

```bash
pilosa upgrade
pilosa upgrade --yes  # skip confirmation
```

### `pilosa check [workspace]`

Validate workspace integrity. Checks required files, detects leftover placeholders, validates source location, and checks map coverage.

```bash
pilosa check /path/to/workspace
pilosa check  # if inside a workspace
```

Fails with a detailed report if any required file is missing, a placeholder remains, setup status is incomplete, or the source location is invalid.

### `pilosa sync`

Regenerate vendor-specific agent mirrors and sync skills from canonical sources.

```bash
pilosa sync
```

Rebuilds `.opencode/agents/`, `.claude/agents/`, all skill mirrors, and updates `CLAUDE.md` with provenance fields.

### `pilosa health`

Check system health and environment.

```bash
pilosa health
```

Reports framework installation status, available LLM CLIs, pdftotext availability, and discovered workspaces.

### `pilosa uninstall`

Remove Pilosa from your system. Does not affect any research workspaces.

```bash
pilosa uninstall
pilosa uninstall --yes  # skip confirmation
```

Removes `~/.pilosa/` (framework + binary) and the `~/.local/bin/pilosa` shim.

## Security Model

Pilosa is designed with supply-chain paranoia in mind. Zero npm, Python, Java, Go, or Homebrew dependencies in the core install.

### Version pinning

The installer uses a **pinned stable version** (not `latest`). This prevents a compromised fresh release from auto-installing on every `curl | sh` run.

### Checksum verification

Every release includes two layers of checksums:

1. **Framework tarball**: SHA-256 of `pilosa-framework-<version>.tar.gz` is verified against `checksums.txt` before unpacking.
2. **Vendor binaries**: Each platform-specific Gum and pdf2md binary has an embedded SHA-256 manifest in `metadata/vendor-checksums.txt`. The installer verifies the copied binary against this manifest after installation.

A mismatch aborts the install with an error.

### Minimum release age

Reject releases that are too fresh. This gives the community time to detect a compromised upload.

```bash
bash install-pilosa.sh --min-days 7
```

### Verify-only mode

Audit an existing installation without reinstalling:

```bash
bash install-pilosa.sh --verify-only
```

### What we download

| Asset | Source | Verified |
|-------|--------|----------|
| Framework tarball | GitHub releases | SHA-256 against `checksums.txt` |
| Gum binary | charmbracelet/gum releases | SHA-256 against embedded manifest |
| pdf2md binary | fjacquet/pdf2md releases | SHA-256 against embedded manifest |

## Workspace Structure

```
workspace/
├── AGENTS.md                    Project context for standard coding agents
├── .bin/
│   ├── pilosa                    CLI entry point
│   └── lib/
│       └── metrics.sh            Unicode metric helpers
├── .agents/                     Canonical agent and skill source
│   ├── agents/                  Canonical native agent definitions (.md)
│   └── skills/                  Canonical portable workflow skills
├── .opencode/
│   ├── agents/                  Generated mirror of canonical agents
│   └── skills/                  Generated mirror of canonical skills
├── .claude/
│   ├── agents/                  Generated mirror of canonical agents
│   └── skills/                  Generated mirror of canonical skills
├── .codex/
│   ├── agents/                  Tracked TOML expansion of canonical agents
│   └── skills/                  Generated mirror of canonical skills
├── CLAUDE.md                    Generated mirror of AGENTS.md (with provenance)
├── system/                      Architecture, context, configuration, templates
│   ├── context.md               Project context (scope, names, particularities)
│   ├── configuration.md         Operating profile
│   ├── startup.md               Setup translation + indexing protocol
│   ├── dictionary.md            Shared vocabulary (built at startup)
│   ├── yaml_header_template.md  YAML frontmatter schema
│   └── workspace_index.md       Master workspace index (built at startup)
├── raw/                         Active working corpus: unchanged source copies
├── maps/                        Navigation maps with Obsidian wikilinks
├── logs/                        Request, intake, and external-access summaries
├── agent_reports/               Writer / Verifier reports
└── .trash/                      Retired files
```

## The Orchestrator

Read `AGENTS.md` for the full routing contract. Briefly:

- **Classifies** every prompt into one of several classes (`fast_path`, `clarify_search`, `find_material`, `evidence_answer`, `synthesis_report`, `verification`, `index_maintenance`, `cleanup`).
- **Chooses a sub-agent sequence** for non-fast-path prompts — never answers them directly.
- **Owns the question tool** — sub-agents execute; they never ask.
- **Pre-processes** the user prompt (trim, summarize, normalize) before dispatch.
- **Logs every request** in `logs/user_requests.md`.

## Hard Rules

- Do not edit `raw/`, maps, dictionary, logs, or system files.
- `connects_to` lists in YAML frontmatter stay at 3–5 load-bearing entries.
- File retirement goes to `.trash/`, not `rm`.

---

## Dev Setup

For contributors who want to work on the Pilosa framework itself.

### Clone the repo

```bash
git clone https://github.com/TommasoPrinetti/pilosa.git
cd pilosa
```

### Branch strategy

- **`main`** — stable framework, tagged releases only
- **`dev`** — active development branch
- **`<project-name>`** — your research workspace branch (branched from `dev`)

```bash
git checkout -b my-project-name dev
git push -u origin my-project-name
```

Onboarding rewrites `system/configuration.md` and `system/context.md` and prepares a working copy of your source files inside the workspace. Keeping that on a project branch lets you re-onboard, re-index, or wipe the project without touching the framework.

### Sync agents

After pulling changes, sync the agent mirrors:

```bash
bash .bin/pilosa sync
```

Or use the installed CLI:

```bash
pilosa sync
```

### Run tests

```bash
bash tests/test_cli.sh
```

### Packaging a release

```bash
bash .bin/package-release.sh 0.3.0
```

Creates `dist/v0.3.0/` with the framework tarball, installer, and checksums.

### Publishing a release

```bash
bash .bin/publish-release.sh 0.3.0
```

Requires `gh` CLI and a clean working tree. Creates a GitHub release with the archive, installer, and checksums.

### Contributing

- Framework changes go to `dev` (or a feature branch off `dev`), not to your project branch.
- Keep `.bin/` scripts pure bash, zero deps.
- All output must be reports — no inline chat responses apart from saying what you've done.

## Development Checklist

### Knowledge / Context System
- [ ] Improve token and context management strategy (no quota or budget system yet)

### Sub-Agent System
- [ ] Verify whether sub-agents were already called (no call log yet)
- [ ] Allow agents to call many sub-agents dynamically (current dispatcher is fixed-shape)

### Reporting & Output
- [ ] Enable direct extraction from raw copies into reports (no pipe from raw copies to Writer)

### UX / Interaction Design
- [ ] Create different "attitudes" / interaction modes for orchestration (single mode today)

### Infrastructure
- [ ] Explore scalable indexing architecture (current indexing is O(files) per startup)
- [ ] Continuous source sync (today: one-shot copy at onboarding, re-run to refresh)

### Open Questions
- [ ] How should token/context budgeting work long term?
- [ ] What is the optimal orchestration strategy for sub-agents?
- [ ] How much process visibility should remain in final reports?
- [ ] How should the system balance exploration vs execution?
- [ ] How should agent "attitudes" be modeled technically?
- [ ] How should the log/report rotation policy be tuned once real data accumulates?
