# Spinosa Development Guide

## Quick Start

```bash
cd ~/Documents/spinosa-main
bun run dev
```

This runs the TUI from source (`packages/opencode/src/index.ts`). Edit any file and restart to see changes.

### Alternative: run via the spinosa shim (dev mode)

```bash
cd ~/Documents/spinosa-main
SPINOSA_HOME=~/.spinosa ./workspace-template/.bin/spinosa
```

The shim auto-detects dev mode from `workspace-template/.spinosa/workspace-files.tsv`.

## Directory Layout

```
workspace-template/  ← Files shipped into Spinosa workspaces
  .bin/spinosa       ← Bash launcher and command router
  .spinosa/          ← Workspace manifest and local state templates
  .agents/           ← Canonical skills and agent instructions
  .opencode/         ← OpenCode adapter mirror
  .claude/ .codex/   ← Vendor adapter mirrors
  .hermes/           ← Hermes adapter and generated workspace config
  system/ docs/      ← Workspace system files and user docs
packages/            ← Runtime source (opencode fork + tui + spinosa-core + deps)
install.sh           ← User-facing installer (curl | bash)
package.json         ← Bun workspace root
```

## Codebase Structure

| Package | Path | What it does |
|---------|------|-------------|
| **opencode** | `packages/opencode/` | CLI + TUI host — opencode fork. Entry: `src/index.ts`. Do not modify unless fixing upstream bugs. |
| **tui** | `packages/tui/` | TUI components. Spinosa code in `src/spinosa/` and `src/routes/spinosa/`. |
| **spinosa-core** | `packages/tui/src/spinosa-core/` | Backend: workspace management, import pipeline, scanning, CLI commands, channels. |

## Key Files

### TUI Launch Flow
- `workspace-template/.bin/spinosa` — thin bash bootstrap (~25 lines). Resolves root + bun, then execs `spinosa-cli.ts` or launches TUI.
- `packages/tui/src/spinosa-cli.ts` — TypeScript CLI entry point. Handles all commands: `new`, `add`, `update`, `doctor`, `upgrade`, `uninstall`, `status`, `list`, `version`, `help`.
- `packages/tui/src/spinosa-cli/` — modular command handlers (`commands/`), argument parser, output IO with `--json`/`--quiet` support.
- `packages/opencode/src/cli/cmd/tui.ts` — creates Web Worker, RPC bridge, TUI component tree.

### Onboarding (New Workspace)
- `packages/tui/src/routes/spinosa/onboarding.tsx` — 10-step wizard UI.
- `packages/tui/src/spinosa-core/commands/onboard.ts` — `prepareOnboarding`, `runOnboarding`, `completeOnboarding`.
- `packages/tui/src/spinosa-core/import/pipeline.ts` — three-phase import (direct → MarkItDown → OCR).

## Publishing

### Framework Release
```bash
# Bump version in package.json (canonical source)
# Keep package.json and install.sh PINNED_VERSION aligned, then run local release gate.
bun run --cwd packages/tui test:spinosa
bash script/release.sh vX.Y.Z[-beta.N]
```

### NPM Binary
```bash
bun run script/build-tui.ts --single
cd dist/@spinosa/tui-darwin-arm64 && npm publish --access public --tag beta
cd dist/@spinosa/tui && npm publish --access public --tag beta
```

## Rules for Agents

1. **Do NOT modify `packages/opencode/src/`** unless fixing an upstream bug. Spinosa features go in `packages/tui/src/spinosa/`, `packages/tui/src/routes/spinosa/`, or `packages/tui/src/spinosa-core/`.
2. **Channel inference**: never hardcode `"stable"`. Infer from bundle version: prerelease → beta, plain semver → stable.
3. **Progress**: use `ProgressEmitter` for batch operations. Wire `onStdout`/`onStderr` for TUI visibility.
4. **TypeScript**: use the package scripts (`bun run --cwd packages/tui typecheck`).
5. **Bash**: `workspace-template/.bin/spinosa` is a thin bootstrap (~25 lines). All CLI logic lives in `spinosa-cli.ts`. `install.sh` must remain macOS Bash 3.2 compatible.
6. Agent mirrors are pre-baked. Update canonical and adapter copies together, then run `bun run --cwd packages/tui verify:spinosa`.
