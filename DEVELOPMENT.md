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
SPINOSA_HOME=~/.spinosa ./framework/bin/spinosa
```

The shim auto-detects dev mode when it finds `framework/spinosa/framework-files.tsv`.

## Directory Layout

```
framework/           ← Agent files (ships to workspaces via spinosa update)
  AGENTS.md          ← Orchestrator contract
  bin/               ← Bash CLI shim + libraries + sync scripts
  agents/            ← Agent definitions (source of truth)
  spinosa/           ← Framework manifest + metadata
  system/            ← Workspace system config
  docs/ maps/ raw/   ← Framework resources
vendor/              ← Generated agent mirrors (codex, claude, opencode, hermes)
packages/            ← Runtime source (opencode fork + tui + spinosa-core + deps)
install.sh           ← User-facing installer (curl | bash)
package.json         ← Bun workspace root
```

## Codebase Structure

| Package | Path | What it does |
|---------|------|-------------|
| **opencode** | `packages/opencode/` | CLI + TUI host — opencode fork. Entry: `src/index.ts`. Do not modify unless fixing upstream bugs. |
| **tui** | `packages/tui/` | TUI components. Spinosa code in `src/spinosa/` and `src/routes/spinosa/`. |
| **spinosa-core** | `packages/spinosa-core/` | Backend: workspace mgmt, import pipeline, scanning, CLI commands, channels. |

## Key Files

### TUI Launch Flow
- `framework/bin/spinosa` — bash CLI shim. No-args launches TUI from installed framework.
- `packages/opencode/src/cli/cmd/tui.ts` — creates Web Worker, RPC bridge, TUI component tree.

### Onboarding (New Workspace)
- `packages/tui/src/routes/spinosa/onboarding.tsx` — 10-step wizard UI.
- `packages/spinosa-core/src/commands/onboard.ts` — `prepareOnboarding`, `runImportPhase`, `completeOnboarding`.
- `packages/spinosa-core/src/import/pipeline.ts` — three-phase import (direct → MarkItDown → OCR).

## Publishing

### Framework Release
```bash
# Bump version in package.json (canonical source)
# install.sh uses __VERSION__ placeholder — rewritten at build time

git add -A && git commit -m "release: v0.8.0-beta.N"
git tag v0.8.0-beta.N && git push origin v0.8.0-beta.N
# CI (release.yml) handles: build → test → package → GitHub Release
```

### NPM Binary
```bash
bun run script/build-tui.ts --single
cd dist/@spinosa/tui-darwin-arm64 && npm publish --access public --tag beta
cd dist/@spinosa/tui && npm publish --access public --tag beta
```

## Rules for Agents

1. **Do NOT modify `packages/opencode/src/`** unless fixing an upstream bug. Spinosa features go in `packages/tui/src/spinosa/` or `packages/spinosa-core/src/`.
2. **Channel inference**: never hardcode `"stable"`. Infer from bundle version: prerelease → beta, plain semver → stable.
3. **Progress**: use `ProgressEmitter` for batch operations. Wire `onStdout`/`onStderr` for TUI visibility.
4. **TypeScript**: use `tsgo` for typecheck (`npx tsgo --noEmit` from package dir).
5. **Bash**: `framework/bin/spinosa` and `install.sh` must be macOS bash 3.2 compatible.
6. **Sync agents after editing**: `bash framework/bin/sync-agents.sh` or `bun run sync-agents`.
