

```txt
██████╗ ██╗██╗      ██████╗ ███████╗ █████╗ 
██╔══██╗██║██║     ██╔═══██╗██╔════╝██╔══██╗
██████╔╝██║██║     ██║   ██║███████╗███████║
██╔═══╝ ██║██║     ██║   ██║╚════██║██╔══██║
██║     ██║███████╗╚██████╔╝███████║██║  ██║
╚═╝     ╚═╝╚══════╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝
```                                         

# Pilosa

Pilosa turns a folder of source material into a searchable, header-indexed, multi-agent-readable knowledge map. After onboarding, the source location remains the immutable original and `raw/` becomes the active working corpus for normal source search. A thin orchestrator (`AGENTS.md`) routes every prompt through specialist sub-agents (Searcher, Writer, Verifier, Janitor) or executes the startup workflow directly. **Verifier** is mandatory on every non-fast-path route. Sub-agents never ask questions — only the orchestrator does.

## Quick Start

### 1. Clone the repo

```bash
git clone https://github.com/TommasoPrinetti/pilosa.git
cd pilosa
```

### 2. Create your own branch

Each user/research project lives on its own branch. `main` is the framework. `dev` is the active development branch. Pick a name for your project and branch from `dev` (or from `main` if you want a clean framework only):

```bash
git checkout -b my-project-name
git push -u origin my-project-name
```

> Why a branch? Onboarding rewrites `system/configuration.md` and `system/context.md` and copies source files unchanged into `raw/`. Keeping that on a project branch lets you re-onboard, re-index, or wipe the project without touching the framework.

### 3. Create and onboard a workspace

The CLI creates a workspace, collects your project name and source location, scans the corpus, asks for consent before writing raw records, then asks which LLM CLI should receive the startup handoff. It copies markdown-convertible files into `raw/` with `.md` names, copies native-readable files unchanged, converts PDFs to Markdown when `pdf2md` is installed (otherwise copies as-is), and skips images, video, audio, and `AGENTS.md` control files. Startup then creates detailed Obsidian-wikilink maps in `maps/`. Optional context such as project description and artifact URLs can be inferred or added later.

```bash
pilosa new /path/to/workspace
```

What happens:
- Flow: workspace location → project name → source location → scan summary → consent → raw record writing → CLI handoff.
- Scan summary shows counts for text files, images, videos, audio files, PDFs, unknown files, ignored files, and byte totals by major class where available.
- Non-text media stays at the source location; images, video, audio, and `AGENTS.md` control files are skipped during onboarding.
- PDFs are converted to Markdown when `pdf2md` is installed; otherwise copied as-is.
- Startup creates `maps/` with map files that contain detailed retrieval summaries and Obsidian wikilinks into raw files.
- Gum is used for prompts when installed; plain shell prompts and numbered menus are used as fallback.
- A startup prompt is written to your clipboard and printed to the terminal.

Flags:
- `--numbered` — force the numbered CLI menu instead of the arrow-key picker
- `--no-color` — disable colored output
- `--no-gum` — use plain shell prompts
- `--help` — show usage

### 4. Paste the prompt into your LLM CLI

Open Claude Code, Codex, OpenCode, or whichever CLI you picked, point it at this folder, and paste the prompt. The LLM will:

1. Use the fast setup draft, treating project description and artifact URLs as optional. If they were not provided, it records that and infers working scope from the active raw corpus.
2. Update `system/configuration.md` and `system/context.md` from `setup_status: cli_started` → `workspace_started`.
3. Build the master dictionary from `raw/`, generate YAML headers for every raw copy, create detailed maps in `maps/`, build maps, validate headers and map links, and run retrieval tests.
4. Write a startup report to `agent_reports/`.

After that, ask research questions normally. The orchestrator will route them through the right sub-agents.

## Install

One command. Zero dependencies.

```bash
curl -fsSL https://github.com/TommasoPrinetti/pilosa/releases/download/v0.2.0/install.sh | bash
```

This installs the **pinned stable version** (`0.2.0`). No npm, no Python, no Go — fully autonomous.

For options (specific version, security flags, etc.), download first:

```bash
curl -fsSL https://github.com/TommasoPrinetti/pilosa/releases/download/v0.2.0/install.sh -o install-pilosa.sh
bash install-pilosa.sh --version 0.2.0
bash install-pilosa.sh --min-days 7
bash install-pilosa.sh --verify-only
```

## Security Model

Pilosa is designed with supply-chain paranoia in mind. There are zero npm, Python, Java, Go, or Homebrew dependencies in the core install.

### Version pinning

By default, the installer uses a **pinned stable version** (not `latest`). This prevents a compromised fresh release from auto-installing on every `curl | sh` run.

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

The check queries the GitHub API for the release date. If the API is unreachable and you specified `--min-days`, the install aborts.

### Verify-only mode

Audit an existing installation without reinstalling:

```bash
bash install-pilosa.sh --verify-only
```

This checks all installed vendor binaries against their embedded checksum manifest and reports status.

### What we download

| Asset | Source | Verified |
|-------|--------|----------|
| Framework tarball | GitHub releases | SHA-256 against `checksums.txt` |
| Gum binary | charmbracelet/gum releases | SHA-256 against embedded manifest |
| pdf2md binary | fjacquet/pdf2md releases | SHA-256 against embedded manifest |

All downloads use `curl -fsSL` (fail on error, follow redirects, silent).

## Re-onboarding an Existing Workspace

To re-run the onboarding flow on a workspace that was created but never indexed, or to start fresh:

```bash
pilosa onboard /path/to/existing/workspace
```

This skips the workspace creation step and goes straight to source selection, corpus scan, and startup handoff. The existing project name and framework files are preserved.

## Updating A Workspace

Run updates from inside a Pilosa workspace, or pass the workspace path explicitly:

```bash
pilosa update
pilosa update /path/to/workspace
```

Before writing, the CLI shows an update plan and asks for confirmation. It separates clean framework replacements, forced replacements, locally modified framework files, new framework files, recursive framework directory refreshes, and retired-file cleanup.

## Validating a Workspace

Check workspace integrity — verifies required files, detects leftover placeholders, validates source location, and checks map coverage:

```bash
pilosa check [/path/to/workspace]
```

Fails with a detailed report if any required file is missing, a placeholder remains, setup status is incomplete, or the source location is invalid.

## Syncing Agent and Skill Mirrors

Regenerate vendor-specific agent mirrors and sync skills from canonical sources (`pilosa sync` replaces the legacy `sync-agents.sh`):

```bash
pilosa sync
```

This rebuilds `.opencode/agents/`, `.claude/agents/`, all skill mirrors across `.opencode/skills/`, `.claude/skills/`, and `.codex/skills/`, and updates `CLAUDE.md` with provenance fields.

## Uninstalling

Remove Pilosa from your system (does not affect any research workspaces):

```bash
pilosa uninstall
```

This removes `~/.pilosa/` (framework + binary) and the `~/.local/bin/pilosa` shim. Add `--yes` to skip the confirmation prompt.

## How the workspace is Organized

```
pilosa/
├── AGENTS.md                    Project context for standard coding agents
├── README.md                    This file
├── .bin/
│   ├── AGENTS.md                 Guidance for .bin/ scripts
│   ├── pilosa                    CLI entry point (new, onboard, update, check, sync, uninstall, help)
│   ├── check-startup.sh          Legacy dev validator (superseded by pilosa check)
│   ├── sync-agents.sh            Legacy sync script (superseded by pilosa sync)
│   └── lib/
│       └── metrics.sh            Unicode metric helpers for reports and ledgers
├── .agents/                     Canonical agent and skill source
│   ├── agents/                  Canonical native agent definitions (.md)
│   └── skills/                  Canonical portable workflow skills (fallback)
│       ├── context-analysis/    Provide broader contextual analysis
│       ├── evidence-search/     Write-capable fallback for searcher evidence
│       ├── mapper-fallback/     Fallback for pilosa-mapper batch extraction
│       ├── serendippo-fallback/ Fallback for pilosa-serendippo roaming research
│       ├── source-intake/       Add source files to the workspace
│       ├── report-writing/      Write synthesis reports
│       ├── claim-verification/  Verify claims and quotes
│       ├── workspace-cleanup/   Audit and archive stale files
│       └── orchestrator-dispatch/ Route prompts through pipeline
├── .opencode/
│   ├── agents/                  Generated mirror of canonical agents
│   ├── skills/                  Generated mirror of canonical skills
│   └── package.json             OpenCode extension manifest
├── .claude/
│   ├── agents/                  Generated mirror of canonical agents
│   └── skills/                  Generated mirror of canonical skills
├── .codex/
│   ├── agents/                  Tracked TOML expansion of canonical agents
│   └── skills/                  Generated mirror of canonical skills
├── CLAUDE.md                    Generated mirror of AGENTS.md (with provenance)
├── .obsidian/                    Obsidian workspace config
│   ├── appearance.json          Theme and UI settings
│   └── snippets/
│       └── pilosa.css           Custom CSS snippet
├── system/                        Architecture, context, configuration, templates
│   ├── context.md                 Project context (scope, names, particularities)
│   ├── configuration.md           Operating profile
│   ├── startup.md                 Setup translation + indexing protocol
│   ├── dictionary.md              Shared vocabulary (built at startup)
│   ├── yaml_header_template.md    YAML frontmatter schema
│   ├── workspace_index.md         Master workspace index (built at startup)
│   └── system_architecture_map.md Diagrams
├── raw/                           Active working corpus: unchanged source copies
├── maps/                          Navigation maps with Obsidian wikilinks
├── logs/                          Request, intake, and external-access summaries (+ AGENTS.md)
├── agent_reports/                 Writer / Verifier reports (+ AGENTS.md)
└── .trash/                        Retired files (+ AGENTS.md)
```

## What the Orchestrator Does

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

## Contributing

- Framework changes go to `dev` (or a feature branch off `dev`), not to your project branch.
- Keep `.bin/` scripts pure bash, zero deps.

## Development Checklist

Framework improvements tracked openly:

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
