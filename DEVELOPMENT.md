# Spinosa Development Guide

## Quick Start

```bash
cd /path/to/spinosa
bun run dev
```

This runs the TUI from source via `packages/spinosa-kernel` and `packages/tui`. Edit any file and restart to see changes.

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
```

## Codebase Structure

| Package | Path | What it does |
|---------|------|-------------|
| **spinosa-core** | `packages/spinosa-core/` | Product workspace behavior: create/update, import, channels, preflight, upgrade. |
| **spinosa-kernel** | `packages/spinosa-kernel/` | Executable CLI host (`src/index.ts`). Commands in `src/cli/cmd/`. |
| **kernel-core** | `packages/core/` (`@spinosa/kernel-core`) | Inherited runtime internals from the upstream kernel. |
| **tui** | `packages/tui/` | Terminal UI. Spinosa routes in `src/routes/spinosa/`. Entry: `src/spinosa-cli.ts`. |
| **llm** | `packages/llm/` | Effect Schema-first LLM provider core. |

## Key Files

### TUI Launch Flow
- `workspace-template/.bin/spinosa` — bash bootstrap. Resolves framework root and bun, then execs the kernel CLI or launches the TUI.
- `packages/spinosa-kernel/src/index.ts` — yargs CLI entry point.
- `packages/spinosa-kernel/src/cli/cmd/tui.ts` — runs launch preflight, then creates the TUI worker and session transport.
- `packages/spinosa-core/src/commands/preflight.ts` — upgrade check and workspace updates before TUI render.

### Onboarding (New Workspace)
- `packages/tui/src/routes/spinosa/onboarding.tsx` — onboarding wizard UI.
- `packages/spinosa-core/src/commands/create.ts` — workspace creation from manifest-declared template paths.
- `packages/spinosa-core/src/import/pipeline.ts` — document import (direct → MarkItDown → OCR).

## Publishing

See `RELEASE_GUIDE.md`. Framework releases use `release-it`:

```bash
bun run release:validate
bun run release:beta:patch   # or release:stable:patch
```

## Rules for Agents

1. Product workspace behavior belongs in `packages/spinosa-core/`. CLI wiring belongs in `packages/spinosa-kernel/`. UI belongs in `packages/tui/`.
2. **Channel inference**: never hardcode `"stable"`. Infer from bundle version: prerelease → beta, plain semver → stable.
3. **Progress**: use `ProgressEmitter` for batch operations. Wire `onStdout`/`onStderr` for TUI visibility.
4. **TypeScript**: use package `typecheck` scripts (`bun run typecheck` at repo root).
5. **Bash**: `workspace-template/.bin/spinosa` is a thin bootstrap. CLI logic lives in `packages/spinosa-kernel/`. `install.sh` must remain macOS Bash 3.2 compatible.
6. Agent mirrors are pre-baked. Update canonical and adapter copies together, then run `bun run --cwd packages/tui test:spinosa`.
