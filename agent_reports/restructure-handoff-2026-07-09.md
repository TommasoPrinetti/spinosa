# Spinosa Restructure — Handoff

## What Changed

### Directory Structure
- `framework/` → `workspace-template/` (the template copied during `spinosa new`)
- `bin/` → `.bin/` (hidden, only contains thin `spinosa` TUI launcher)
- `spinosa/` → `.spinosa/` (hidden, contains workspace-files.tsv + release-files.tsv)
- `trash/` → `.trash/` (hidden)
- Removed: `obsidian/`, `vendor/`, nested `framework/framework/`
- Removed from root: `dist/`, `metadata/`, `spinosa-tui/`

### Agent Mirrors (pre-baked, no sync-agents)
- `.agents/` — canonical source (agents/, skills/, references/)
- `.codex/`, `.opencode/`, `.claude/`, `.hermes/` — pre-baked mirrors of .agents/
- `sync-agents.sh` deleted — not needed, mirrors ship in template

### Bash → TypeScript
- All `.sh` scripts deleted except: `install.sh`, `.bin/spinosa` (thin launcher)
- `commands_new.sh` → `packages/tui/src/spinosa-core/commands/create.ts`
- `commands_add.sh` → `commands/add.ts`
- `commands_startup.sh` → `commands/startup.ts`
- `commands_onboard.sh` → `commands/onboard.ts`
- `workspace.sh` → `workspace/registry.ts`, `workspace/meta.ts`
- `handoff.sh` → `handoff/builder.ts`, `handoff/runner.ts`

### Variable Renames
- `FRAMEWORK_ROOT` → `TEMPLATE_ROOT` (the workspace template dir)
- `SPINOSA_FRAMEWORK_ROOT` → `SPINOSA_TEMPLATE_ROOT` (env var)
- `resolve_framework_root()` → `resolve_template_root()`
- `framework/spinosa/` → `.spinosa/`
- `framework/bin/` → `.bin/`
- `framework/agents/` → `.agents/`

### Manifests
- `workspace-files.tsv` — files to copy during `spinosa new` (in `.spinosa/`)
- `release-files.tsv` — removed (GitHub auto tarballs, no custom build needed)

### Installer
- Uses GitHub source tarball: `https://github.com/TommasoPrinetti/spinosa/archive/refs/tags/v<VERSION>.tar.gz`
- Binary at: `workspace-template/.bin/spinosa`
- Bundles bun for cross-platform use
- `.gitattributes` excludes CI, tests, assets, dev docs from release tarball

### Two-Phase Workspace Creation
1. **TUI creates workspace** (`createWorkspace()` in TS): copies template, runs sync, writes metadata
2. **Startup prompt** (in workspace root): agent reads system/context.md, builds dictionary + maps

## Key Files
| File | Purpose |
|---|---|
| `workspace-template/` | Template copied into new workspaces |
| `workspace-template/.spinosa/workspace-files.tsv` | Manifest for `spinosa new` |
| `workspace-template/.bin/spinosa` | Thin TUI launcher (bash, ~1.5KB) |
| `install.sh` | System installer (downloads GitHub tarball, extracts, sets up) |
| `packages/tui/src/spinosa-core/commands/create.ts` | TS workspace creation |
| `packages/tui/src/spinosa-core/framework/discovery.ts` | Template root discovery |
| `.gitattributes` | Filters release tarball content |

## How to Release
```bash
# 1. Tag
git tag v0.8.0-beta.17
git push --tags

# 2. GitHub creates tarball automatically at:
#    https://github.com/TommasoPrinetti/spinosa/archive/refs/tags/v0.8.0-beta.17.tar.gz

# 3. Users install with:
curl -fsSL https://github.com/TommasoPrinetti/spinosa/releases/download/stable/install.sh | bash

# 4. Or run TUI in dev:
bun run dev
```

## Commits (chronological order)
1. `2de9e52a` — Restructure: framework/ → workspace-template/, unify workspace creation in TS
2. `00c21075` — Remove sync-agents, pre-bake agent dirs in template
3. `d016a20b` — Strip .bin/ to just spinosa TUI launcher, remove all sh libs
4. `bc015c24` — Clean template: remove .bin/AGENTS.md from manifest, purge stale audit reports
5. `a9de5c5d` — Fix package.json scripts: remove broken sync-agents references
6. `b23e42eb` — Remove release-files.tsv from template
7. `abbc2203` — Clean root: remove stale framework/, vendor/, spinosa-tui/, dist/, metadata/
8. `d06de8e1` — Install: use GitHub auto tarball, fix paths for new structure
9. `48212925` — Add .gitattributes for lean release tarballs
