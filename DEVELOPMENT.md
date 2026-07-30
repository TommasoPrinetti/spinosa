# Spinosa Development Guide

## Quick Start

```bash
cd /path/to/spinosa
bun install
bun run dev
```

`bun run dev` runs `packages/spinosa-cli/src/index.ts`, which spawns the kernel CLI with `SPINOSA_TEMPLATE_ROOT` set to the repo root. Edit any file and restart to see changes.

### Alternative: run via the spinosa shim (dev mode)

```bash
cd /path/to/spinosa
SPINOSA_HOME=~/.spinosa ./workspace-template/.bin/spinosa
```

The shim auto-detects dev mode from `workspace-template/.spinosa/workspace-files.tsv`.

Set `SPINOSA_FRAMEWORK_ROOT` or `SPINOSA_TEMPLATE_ROOT` when the framework root is not the current working directory.

## Directory Layout

```
workspace-template/  ← Files shipped into Spinosa workspaces (via workspace-files.tsv)
  .bin/spinosa       ← Bash launcher and command router
  .spinosa/          ← Workspace manifest and local state templates
  .agents/           ← Canonical skills and agent instructions
  .opencode/         ← OpenCode adapter mirror
  .claude/ .codex/   ← Vendor adapter mirrors
  .hermes/           ← Hermes adapter and generated workspace config
  system/ docs/      ← Workspace system files and user docs
packages/            ← Runtime source (kernel, tui, spinosa-core, llm, and deps)
install.sh           ← User-facing installer (curl | bash)
package.json         ← Bun workspace root
script/release/      ← TypeScript release pipeline (preflight, bump, build, verify-local, git-tag, publish-version, channel, verify-remote)
```

## Codebase Structure

| Package | Path | What it does |
|---------|------|-------------|
| **spinosa-core** | `packages/spinosa-core/` | Product workspace behavior: create/update, import, channels, preflight, upgrade, document converters. |
| **spinosa-cli** | `packages/spinosa-cli/` | Dev entrypoint (`bun run dev`). Spawns kernel, re-execs on preflight exit `10`. |
| **spinosa-kernel** | `packages/spinosa-kernel/` | Executable CLI host (`src/index.ts`). Commands in `src/cli/cmd/`. |
| **kernel-core** | `packages/core/` (`@spinosa/kernel-core`) | Inherited runtime internals from the upstream kernel. |
| **tui** | `packages/tui/` | Terminal UI. Spinosa routes in `src/routes/spinosa/`. Entry: `src/spinosa-cli.ts`. |
| **llm** | `packages/llm/` | Effect Schema-first LLM provider core. |

## Key Files

### TUI Launch Flow
- `workspace-template/.bin/spinosa` — bash bootstrap. Resolves framework root and bun, then execs the kernel CLI or launches the TUI.
- `packages/spinosa-cli/src/index.ts` — `bun run dev` entry; re-execs on preflight exit `10`.
- `packages/spinosa-kernel/src/cli/cmd/tui.ts` — runs launch preflight **before** spawning the TUI worker.
- `packages/spinosa-core/src/commands/preflight.ts` — upgrade check and workspace updates before TUI render.

### Onboarding (New Workspace)
- `packages/tui/src/routes/spinosa/onboarding.tsx` — onboarding wizard UI.
- `packages/spinosa-core/src/framework/manifest.ts` — reads `workspace-files.tsv`, copies manifest-declared paths.
- `packages/spinosa-core/src/commands/create.ts` — workspace creation from manifest-declared template paths.
- `packages/spinosa-core/src/import/pipeline.ts` — document import (direct → MarkItDown → OCR).

## Quality and Testing

All release checks run **locally** — there is no GitHub Actions quality workflow.

```bash
# Full maintainer gate (same as release:validate)
bun run quality

# Individual stages
bun script/typecheck-all.ts   # typecheck every workspace package
bun run lint:deps             # dependency-cruiser boundary rules
bun run lint:unused           # knip
bun run lint:syncpack         # catalog version alignment
bun run lint:shell            # shellcheck (requires: brew install shellcheck)
bun run test:core             # version, preflight, upgrade, channels, fs
bun run test:tui              # Spinosa TUI flow tests
bun run test:installer        # bats installer tests

# Narrower TUI test run
bun run --cwd packages/tui test:spinosa
```

## Publishing

See `RELEASE_GUIDE.md`. Framework releases use the local Bun pipeline:

```bash
bun run release:validate      # branch, clean tree, quality gate
bun run release:beta:patch    # or release:stable:patch
bun run release:resume        # continue after a mid-release failure
```

Republish an explicit version without a semver bump:

```bash
bun run release:republish -- v1.0.2-beta.16
```

Regenerate the patch audit table after changing `patchedDependencies`:

```bash
bun run patches:generate
```

## Rules for Agents

1. Product workspace behavior belongs in `packages/spinosa-core/`. CLI wiring belongs in `packages/spinosa-kernel/`. UI belongs in `packages/tui/`.
2. **Channel inference**: never hardcode `"stable"`. Infer from bundle version: prerelease → beta, plain semver → stable.
3. **Progress**: use `ProgressEmitter` for batch operations. Wire `onStdout`/`onStderr` for TUI visibility.
4. **TypeScript**: packages use `tsc --noEmit` via `bun run typecheck` or `bun script/typecheck-all.ts`.
5. **Bash**: `workspace-template/.bin/spinosa` is a thin bootstrap. CLI logic lives in `packages/spinosa-kernel/`. `install.sh` must remain macOS Bash 3.2 compatible.
6. **Workspace template**: only add paths to `workspace-template/.spinosa/workspace-files.tsv` if they should ship to user workspaces. Maintainer scripts stay in the git repo only.
7. Agent mirrors are pre-baked. Update canonical and adapter copies together, then run `bun run --cwd packages/tui test:spinosa`.
