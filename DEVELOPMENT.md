# Spinosa Development Guide

## Quick Start

```bash
cd ~/Documents/spinosa-main
bun run dev
```

This runs the TUI from source (`packages/opencode/src/index.ts`). Edit any file and restart to see changes.

## Codebase Structure

| Package | Path | What it does |
|---------|------|-------------|
| **opencode** | `packages/opencode/` | The CLI + TUI host — our opencode fork. Entry point: `src/index.ts` (yargs CLI). TUI thread: `src/cli/cmd/tui.ts`. Worker: `src/cli/tui/worker.ts`. **Do not modify this package's source unless you're fixing an upstream opencode bug.** All spinosa features are added via the packages below. |
| **tui** | `packages/tui/` | TUI components and spinosa workspace UI. Spinosa-specific code lives in `src/spinosa/` and `src/routes/spinosa/`. The home screen (`src/routes/home.tsx`) has the workspace picker, upgrade banner, and version checks. |
| **spinosa-core** | `packages/spinosa-core/` | Backend library: workspace management (`workspace/`), import pipeline (`import/`), file scanning (`scan/`), CLI commands (`commands/`), framework discovery (`framework/`), release channels (`system/`). |
| **tui → service** | `packages/tui/src/spinosa/service.ts` | Re-exports from spinosa-core plus per-workspace version/channel helpers. |

## Key Files

### TUI Launch Flow
- `.bin/spinosa` — bash CLI shim. No-args launches the TUI from the installed framework tree via `bun run --cwd packages/opencode`.
- `packages/opencode/src/cli/cmd/tui.ts` — creates Web Worker, sets up RPC bridge, starts the TUI component tree.

### Onboarding (New Workspace)
- `packages/tui/src/routes/spinosa/onboarding.tsx` — the 10-step wizard UI.
- `packages/spinosa-core/src/commands/onboard.ts` — `prepareOnboarding`, `runImportPhase`, `completeOnboarding`.
- `packages/spinosa-core/src/import/pipeline.ts` — three-phase import (direct → MarkItDown → OCR).

### Multi-Folder Import
Multiple source folders are supported. The first folder creates the workspace via `prepareNew`. Additional folders are imported via `runAdd(workspacePath, path, { dir: true, subfolder })`. Each extra folder's files go into `raw/<foldername>/`.

### Release Channel
Channel is inferred from the installed bundle version — prerelease → beta, plain semver → stable. See `home.tsx` upgrade banner and `onboarding.tsx` tool repair.

## Publishing

### Framework Release (Source Tarball)
```bash
# Bump version in install.sh
sed -i '' 's/PINNED_VERSION=".*"/PINNED_VERSION="0.8.0-beta.N"/' install.sh

# Update CHANGELOG.md

# Commit and publish
git add -A && git commit -m "release: v0.8.0-beta.N"
bash .bin/publish-dev-release.sh 0.8.0-beta.N
# or for a re-release: bash .bin/publish-release.sh 0.8.0-beta.N --prerelease --replace-assets
```

The framework tarball includes all 15 workspace packages + `patches/`. `install.sh` runs `bun install --production` from the framework root and symlinks `@opencode-ai/*` workspace packages.

### NPM Package (Binary Fallback)
Only needed when you want users to get the TUI without the framework:
```bash
bun run script/build-tui.ts --single
cd dist/@spinosa/tui-darwin-arm64 && npm publish --access public --tag beta
# Then publish updated umbrella:
cd dist/@spinosa/tui && npm publish --access public --tag beta
```
The `.bin/spinosa` CLI checks the installed framework tree first, then `npx @spinosa/tui`, then system `opencode`.

## Rules for Agents

1. **Do NOT modify `packages/opencode/src/`** unless fixing an upstream bug. All spinosa features go in `packages/tui/src/spinosa/` or `packages/spinosa-core/src/`.
2. **Channel inference**: never hardcode `"stable"` for upgrade/repair flows. Infer from bundle version: `isPrereleaseFrameworkVersion(bv) ? "beta" : "stable"`.
3. **Progress**: use `ProgressEmitter` for batch operations. Wire `onStdout`/`onStderr` callbacks for TUI visibility. Add timeouts to spawned processes (`runReinstall` has 120s).
4. **Error handling**: `finishProvider` in onboarding has try-catch. All `runAdd`/`runNewPhase` calls should surface errors in the TUI log.
5. **Multi-folder imports**: additional source paths get `subfolder: basename(path)` so files stay organized under `raw/<foldername>/`.
6. **TypeScript**: use `tsgo` for typecheck (`npx tsgo --noEmit` from package dir). All packages pass clean except `packages/core/src/` (pre-existing Effect migration type errors).
7. **Bash scripts**: `.bin/spinosa` and `install.sh` must be macOS bash 3.2 compatible (no `local` at global scope, no `[[` outside functions, no `$'...'`).
