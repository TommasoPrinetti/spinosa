

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

### 3. Run the onboard script

The script collects your project name and source location, scans the corpus, asks for consent before writing raw records, then asks which LLM CLI should receive the startup handoff. It copies markdown-convertible files into `raw/` with `.md` names, copies native-readable files unchanged, copies PDFs as-is, and skips images, video, audio, and `AGENTS.md` control files. Startup then creates detailed Obsidian-wikilink maps in `maps/`. Optional context such as project description and artifact URLs can be inferred or added later.

```bash
bash .bin/onboard.sh
```

What happens:
- Flow: project name → source location → scan summary → consent → raw record writing → CLI handoff.
- Scan summary shows counts for text files, images, videos, audio files, PDFs, unknown files, ignored files, and byte totals by major class where available.
- Non-text media stays at the source location; images, video, audio, and `AGENTS.md` control files are skipped during onboarding.
- Startup creates `maps/` with map files that contain detailed retrieval summaries and Obsidian wikilinks into raw files.
- TTY arrow-key picker for the CLI handoff choice (numbered fallback when piped).
- Cursor hidden during raw record writing, restored on exit.
- Existing setup files trigger an overwrite confirmation unless you pass `--force`.
- A startup prompt is written to your clipboard and printed to the terminal.

Flags:
- `--force` — overwrite existing setup data without asking
- `--numbered` — force the numbered CLI menu instead of the arrow-key picker
- `--no-color` — disable colored output
- `--help` — show usage

On macOS you can also double-click `onboard.command`. On Windows, double-click `onboard.cmd`.

### 4. Paste the prompt into your LLM CLI

Open Claude Code, Codex, OpenCode, or whichever CLI you picked, point it at this folder, and paste the prompt. The LLM will:

1. Use the fast setup draft, treating project description and artifact URLs as optional. If they were not provided, it records that and infers working scope from the active raw corpus.
2. Update `system/configuration.md` and `system/context.md` from `setup_status: cli_started` → `workspace_started`.
3. Build the master dictionary from `raw/`, generate YAML headers for every raw copy, create detailed maps in `maps/`, build maps, validate headers and map links, and run retrieval tests.
4. Write a startup report to `agent_reports/`.

After that, ask research questions normally. The orchestrator will route them through the right sub-agents.

## How the workspace is Organized

```
pilosa/
├── AGENTS.md                    Project context for standard coding agents
├── README.md                    This file
├── .bin/
│   ├── onboard.sh               Mechanical setup script (zero deps)
│   └── check-startup.sh         Developer validation helper used by startup/checks
├── .agents/                     Canonical agent and skill source
│   ├── agents/                  Canonical native agent definitions (.md)
│   └── skills/                  Canonical portable workflow skills (fallback)
│       ├── source-intake/       Add source files to the workspace
│       ├── report-writing/      Write synthesis reports
│       ├── claim-verification/  Verify claims and quotes
│       ├── workspace-cleanup/        Audit and archive stale files
│       └── orchestrator-dispatch/ Route prompts through pipeline
├── .opencode/
│   └── agents/                  Generated mirror of canonical agents
├── .claude/
│   ├── agents/                  Generated mirror of canonical agents
│   └── skills/                  Generated mirror of canonical skills
├── .codex/
│   ├── agents/                  Tracked TOML expansion of canonical agents
│   └── skills/                  Generated mirror of canonical skills
├── onboard.command              macOS launcher
├── onboard.cmd                  Windows launcher
├── system/                        Architecture, context, configuration, templates
│   ├── context.md                 Project context (scope, names, particularities)
│   ├── configuration.md           Operating profile
│   ├── startup.md                 Setup translation + indexing protocol
│   ├── dictionary.md              Shared vocabulary (built at startup)
│   ├── header_template.md         YAML frontmatter schema
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
