# Changelog

All notable user-facing changes to Spinosa are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

**Release policy:** versions are published only with explicit maintainer approval.

## [1.0.2-beta.15] — 2026-07-30

### Changed

- Launch preflight is unified in the kernel TUI. `spinosa` and `bun run dev` use the same path. Both print `checking for updates...`, `no updates available` (1 second minimum), then `launching TUI...`.
- Upgrade engine, launch preflight, and version sync are consolidated in `@spinosa/core`. The bash launcher no longer runs a separate preflight subprocess.
- Release docs rewritten: `RELEASE_GUIDE.md` documents the `release-it` pipeline, `script/set-version.ts`, and rolling channel publish steps. Maintainer docs updated in `CONTRIBUTING.md`, `workspace-template/docs/reference/cli.md`, and the website CLI reference.

### Fixed

- `bun run dev` now runs the same upgrade check as `spinosa` when root `package.json` has a product version.
- After a launch-time upgrade, `spinosa-cli` and the bash launcher re-exec on exit code `10`.
- Release validation runs GitHub helper tests outside the root `bunfig` guard.

## [1.0.2-beta.2] — 2026-07-28

### Fixed

- The TUI launch path (`spinosa` with no arguments) referenced a deleted `packages/opencode` directory, causing "Spinosa not found" on fresh installs. The entry point now launches from `packages/tui/src/spinosa-cli.ts`.

## [1.0.2-beta.1] — 2026-07-28

### Security

- Local logs (`spinosa.log`, `tui.ndjson`, `debug.ndjson`) and the workspace registry are now written with `0600` permissions; parent directories use `0700`. Sensitive keys (`authorization`, `cookie`, `password`, `secret`, `token`, `api_key`) are redacted from log entries, and `Basic`/`Bearer` credentials are scrubbed from log text.
- The HTTP API no longer accepts credentials via the `auth_token` query parameter. Use the `Authorization` header instead. Query credentials are now rejected with `401`.
- The local server now refuses to bind to non-loopback hosts unless `SPINOSA_SERVER_PASSWORD` is set. Binding to `0.0.0.0` without a password throws at startup.
- The remote UI proxy (`app.opencode.ai`) has been removed. The server serves the embedded UI only; when the embedded UI is unavailable, requests fall through to the local 404 handler. The Content-Security-Policy is tightened (`connect-src 'self'`, `base-uri 'none'`, `object-src 'none'`, `frame-src 'none'`, `form-action 'self'`).
- The reverse proxy sanitizer now strips `authorization`, `cookie`, `origin`, and `referer` headers before forwarding requests; target-specific credentials may still be supplied explicitly via `extra`.
- The Homebrew tap publish step no longer embeds the GitHub token in the clone URL. It uses a `GIT_ASKPASS` helper with the `GITHUB_TOKEN` environment variable instead.
- The migration report now stores relative paths instead of absolute paths, and is written with `0600` permissions.

### Changed

- Dependencies bumped: esbuild `0.25.12` → `0.28.1`, `solid-js` `1.9.10` → `1.9.14`, `vite` `7.1.4` → `7.3.5`, `dompurify` `3.3.1` → `3.4.12`, `@babel/core` `7.28.4` → `7.29.6`, `minimatch` `10.0.3` → `10.2.5`, OpenTelemetry packages to `2.10.0`/`1.9.1`/`0.221.0`.
- `.gitignore` now excludes `packages/spinosa-kernel/.spinosa-migration-report.json`, `.serena/`, and `*.tsbuildinfo`.

## [1.0.1-beta.14] — 2026-07-24

No user-facing changes since beta.13. (Build pipeline stabilization.)

## [1.0.1-beta.13] — 2026-07-23

No user-facing changes since beta.12. (Tag cleanup.)

## [1.0.1-beta.12] — 2026-07-23

### Changed

- TrOCR engine and LLM‑based OCR post‑processing removed. `ppu-paddle-ocr` remains the sole OCR engine. All `trocr` references purged from worker and pipeline code.

## [1.0.1-beta.11] — 2026-07-23

### Fixed

- All upgrade awareness removed from the TUI. Upgrade prompting, downloading, and installation now live exclusively in `spinosa upgrade` (CLI). The TUI never mentions or offers upgrades.
- Post‑upgrade workspace discovery shows a progress message.

## [1.0.1-beta.10] — 2026-07-23

### Fixed

- Version check no longer caches the "upgrade available" decision. Every TUI mount re‑fetches the remote version so the upgrade prompt appears reliably when a newer release is published.

## [1.0.1-beta.9] — 2026-07-23

### Fixed

- After `spinosa upgrade` completes, the user is now prompted to update their workspaces from within the same CLI flow. TUI flow unified: both CLI‑only and TUI‑assisted upgrades offer the same post‑upgrade workspace update step.

## [1.0.1-beta.8] — 2026-07-23

### Fixed

- Better error logging when upgrade version resolution fails.

## [1.0.1-beta.7] — 2026-07-23

### Fixed

- `spinosa upgrade` no longer crashes when a registered workspace directory is missing during the post‑upgrade update phase.

## [1.0.1-beta.6] — 2026-07-23

### Fixed

- Old version directories are purged from `~/.spinosa/versions/` after a successful upgrade.
- Known contaminant files (leaked test artifacts, personal paths) are cleaned during workspace update.

## [1.0.1-beta.5] — 2026-07-22

### Added

- Dedicated upgrade screen that blocks the home page until the upgrade is resolved.
- Scrolling ASCII banner handles long workspace names.

### Fixed

- ASCII art always shows; removed the scrolling animation that sometimes hid the banner.
- OCR runs in an isolated child process; ANSI escape sequences stripped from OCR output.
- Test fixture paths anonymized.

## [1.0.1-beta.4] — 2026-07-22

### Changed

- Remaining personal paths stripped from website, server, and installer artifacts. Leak‑prevention patterns added to `.gitignore` and `raw/AGENTS.md`.

## [1.0.1-beta.1] — 2026-07-22

### Added

- Installer now uses the TUI wave pattern (`tui-wave`) for visual consistency.
- First post‑stable beta release.

### Fixed

- Legacy Spinosa shim recognized correctly.
- Beta checksum manifest validation fixed.
- Stale `corpus.md` removed (replaced by `workspace.md`).

## [1.0.0] — 2026-07-20

### Added

- First stable release. All changes from the beta series are now promoted to stable.
- Spinosa checks for updates on every start and prompts to upgrade when a newer version is available.
- Workspace picker "Delete stale" button removes non‑existent workspace index entries.
- `spinosa upgrade` now prompts for confirmation before installing.
- Website moved into repo at `website/` — deployed to GitHub Pages on push to `main`.

### Changed

- Repository migrated from `TommasoPrinetti/spinosa` to `medialab/spinosa`.

### Fixed

- `bun run dev` from outside a workspace no longer auto‑opens the last saved workspace.
- Workspace index cleaned of 108 stale e2e test entries.

## [0.9.0-beta.27] — 2026-07-20

### Fixed

- `spinosa upgrade` now prompts `[Y/n]` before proceeding. Use `--yes` to skip confirmation.

## [0.9.0-beta.26] — 2026-07-20

### Added

- Upgrade prompt now offers "Yes" to install the update immediately, then exits TUI with a message to re-run spinosa.

## [0.9.0-beta.25] — 2026-07-20

### Added

- Spinosa now checks for updates on every start. "Checking for updates…" appears in the boot loading screen. If a newer version is available, a dialog prompts the user to run `spinosa upgrade`.

## [0.9.0-beta.24] — 2026-07-18

### Added

- `@spinosa/tui-agent` — deterministic OpenTUI driver for agent-operated TUI debugging. Ships as a npm-packable package with a CLI (`tui-agent run`, `interact`, `list`, `show`, `diff`, `doctor`), JSON scenario DSL, JSONL agent control loop, artifact output (text, SVG, spans, tree, state), and a Spinosa adapter example. See `packages/tui/tools/tui-agent/README.md`.
- `/session` command alias for `/sessions` in the TUI command palette.
- HomeFooter keyboard labels (Shift+S/A/K/W/M) are now wired to actual key bindings via `useBindings`.
- Workspace picker: "Delete stale" button removes all non‑existent workspace index entries in one click, with confirmation dialog.

### Changed

- `/session` command now scopes to the active Spinosa workspace path instead of the TUI host directory. Sessions created in workspace B from a TUI launched in workspace A are visible when switching to workspace B.
- HTTP API `session.list` now accepts a `workspaceID` filter parameter.

### Fixed

- HomeFooter `onMouseDown` changed to `onMouseUp` so click-outside-to-dismiss on dialogs does not also fire footer actions.
- Dialog backdrop now correctly distinguishes backdrop clicks from inner-dialog clicks via a `backdropPressed` flag and `stopPropagation`.
- Dialog max height is now responsive to terminal height: smaller than 30 rows gets `height - 2`, otherwise 60% of terminal height.
- Dialog, dialog-select, and dialog-export-options use `flexDirection="column"` and `minHeight={0}` so content shrinks inside small modals.
- Session list scrolls inside small modals (`minHeight={0}` boundary before prompt/footer).
- Export options layout is columnar on narrow terminals; labels and options no longer render across one row.
- Workspace picker columns (Name, Parent, Status, Version, Accessed) are now responsive — hide Version below 72 columns, hide Accessed below 94 columns.
- Workspace picker adds a `›` selection indicator, uses `compactColumns()` for narrower terminal widths.
- Home reduces decorative chrome below 24 terminal rows (hides spacer, version label, ASCII banner, limits recent cards to 1).
- ASCII banner falls back to bold plain text when the terminal is too narrow for the `block` font rendering.
- Visualizer hides the stacked inspector when terminal height is below 28 rows.
- Visualizer hides keyboard shortcut hint bar below 28 rows.
- Prompt workspace status bar uses `overflow="hidden"` and shows a separator pipe below 80 columns.
- Session transcript scroll container has `minHeight={0}` to prevent overflow in constrained layouts.
- DialogProvider wraps dialog overlay with a positioned `box` instead of layering the overlay over the entire screen, preventing obscure mouse-targeting issues.
- `bun run dev` from outside a Spinosa workspace no longer auto‑opens the last saved workspace. Shows global home instead.
- Cleaned 108 stale e2e‑test workspace entries from the global registry.

## [0.9.0-beta.22] — 2026-07-17

### Fixed

- TUI now lands on the global homepage (workspace picker) instead of auto-opening the last-used workspace
- Resolved 14 pre-existing TypeScript errors: missing `inspectWorkspacePresence` import, `createResource` type inference in `dialog-move-session`, and read-only `Breakpoints` mutation in `anthropic-messages`
- Framework root resolution now prefers the installed release over the dev repo (`spinosa-main`) so workspace creation doesn't stamp with the wrong version
- Removed stale serena MCP plugin config

## [0.9.0-beta.21] — 2026-07-17

### Fixed

- macOS 26.5 security scanning (XProtect/Gatekeeper) would SIGKILL the bun process on first `spinosa` invocation after install because native `.node`/`.dylib` addons carry a kernel-protected `com.apple.provenance` xattr. The installer now runs a warm-up `bun run ... version` (with retries) after dependency install to let the scanner complete before the verify step, and the verify step itself retries up to 3 times with a 2-second pause. Spurious `Killed: 9` should no longer appear.

- The `spinosa: true` marker is now written to `metadata/config.yaml`, fixing the uninstall command's "marker missing" error.

- Cleaned up duplicate Spinosa PATH entries in `.zshrc` and removed a stale `/tmp/spinosa-test-*` reference.

## [0.9.0-beta.20] — 2026-07-17

### Fixed

- Installer no longer auto-launches the Spinosa dashboard. Auto-launching an interactive TUI from a `curl | bash` pipe is unreliable (no controlling TTY, orphaned background jobs killed with SIGKILL), which caused the installer to report a spurious `Killed: 9` and left `spinosa` dead on subsequent runs. The installer now only installs and prints `→ Run Spinosa with: spinosa`; the user launches the dashboard themselves in a fresh terminal. The runnability probe now uses the non-TUI `spinosa version` instead of `help`.

## [0.9.0-beta.19] — 2026-07-17

### Fixed

- Installer now terminates after a successful install instead of hanging: the Spinosa dashboard is launched detached in the background (`nohup ... &`), so the installer process exits cleanly while the dashboard keeps running.

### Changed

- Installer output is now grouped into labelled sections (System check, Download & extract, Dependencies, Install & configure, Verify) and every user-visible line carries a consistent status glyph (`→` step, `✦` success, `⚠` warning, `↳` note, `✗` error, `?` prompt), making progress easier to follow at a glance.

## [0.9.0-beta.18] — 2026-07-17

### Fixed

- Installer no longer fails with "Dependency timeout runner not found" during `bun install`. The dependency watchdog (`run-with-timeout.ts`) was previously excluded from the GitHub source tarball by a `.gitattributes` `export-ignore` rule on `script/`. It now ships under `workspace-template/.bin/` so fresh installs and upgrades can run `bun i` correctly.

## [0.9.0-beta.17] — 2026-07-17

### Fixed

- Installer now shows progress spinners and status messages for every long-running step (download, extraction, bundled Bun fetch/extract, staging, promotion) so the user is never left staring at a silent terminal.
- Installer no longer appends a duplicate PATH block to shell config files on re-run; it detects the existing Spinosa marker correctly.
- Archive safety check no longer mis-computes symlink traversal depth, so legitimate nested symlinks are accepted while escaping symlinks are still rejected.
- Repair of a broken global `~/.spinosa` home is guarded so a missing/empty `SPINOSA_HOME` can never resolve a destructive `rm -rf` to `/bin` or `/lib`.
- Dashboard launch failure is reported with a hint to run `spinosa` manually instead of silently exiting.

### Changed

- Version comparison during upgrade detection uses an explicit exit-status capture, avoiding a stale comparison result on equal versions.

## [0.9.0-beta.16] — 2026-07-17

### Added

- Workspaces now have persistent unique IDs and richer global registry metadata for presence, setup state, recovery, and moved-folder detection.
- Startup now performs visible cleanup, identity, and workspace-presence checks before opening the TUI.
- Missing workspaces can be relocated manually, found by scanning for their ID, or removed from the registry directly from the picker.
- Interrupted workspace imports can resume from their saved source and workspace metadata.

### Changed

- Recent workspaces exclude missing entries, label incomplete imports, and route incomplete workspaces back into onboarding at the appropriate step.
- Back navigation during copy, OCR, MarkItDown, and other active import work now confirms cancellation and stops the process before navigating.
- Installer maintenance repairs damaged runtime dependencies while preserving central Spinosa metadata.

### Fixed

- WASM-only shell parser dependencies no longer invoke native `node-gyp`/Python builds during installation; dependency attempts now stream output and time out cleanly before repair.
- Linux terminals no longer retain stale bold styling when reactive text attributes change.
- TypeScript CLI commands such as uninstall preserve interactive terminal input.
- Global-home workspace actions render after leaving an incomplete import.
- Removing a missing workspace now refreshes the open picker before returning to its workspace list.

## [0.9.0-beta.13] — 2026-07-14

### Added

- The first-run global home now requires provider selection before creating or opening a workspace.
- The visualizer now supports session and workspace selection, multiple visualization modes, clickable tool details, and copyable tool commands.

### Changed

- Visualizer controls, hover states, scrolling, spacing, tool colors, and canvas top alignment now follow the TUI layout conventions.

### Fixed

- TUI release tests now track current home navigation, routing, versioning, and update-lock behavior without leaking module mocks across test files.

## [0.9.0-beta.9] — 2026-07-12

### Changed

- Upgrade checks now run in the CLI before the TUI starts. Successful upgrades optionally update every registered workspace, then request a fresh `spinosa` launch so the new runtime is loaded.
- Removed upgrade networking and installer ownership from the TUI home screen.

### Fixed

- Global output flags now work before commands, for example `spinosa --json status`.
- `spinosa status [workspace]` now honors positional workspace paths and rejects explicitly invalid workspaces.
- Human CLI summaries now use the configured output channel instead of leaking directly to process stdout.

## [0.9.0-beta.8] — 2026-07-12

### Fixed

- `spinosa upgrade` now verifies the newly installed target release instead of the still-running previous release, preventing successful upgrades from being reported as failures.
- Maintenance checks now import the Node `Dirent` type from its correct module, restoring clean Spinosa typechecks.

## [0.8.0-beta.16] — 2026-07-08

### Fixed

- `replace_if_unmodified` update policy now actually enforced: user-modified framework files are skipped during `spinosa update` via SHA-256 checksum tracking.
- `spinosa uninstall` confirm prompt no longer has a 100ms delay on macOS bash 3.2.

### Changed

- Version cache now skips re-checking for 1 hour when no upgrade is available, reducing GitHub fetches on repeated TUI home mounts.
- TUI upgrade flow now shows a toast listing workspaces that need updating before restarting.

## [0.8.0-beta.13] — 2026-07-07

### Changed

- Framework tarball now ships `packages/opencode/` and `packages/tui/` (our enhanced opencode fork) plus all supporting workspace packages and root `package.json`/`bunfig.toml` for `bun install --production` resolution.
- `install.sh` runs `bun install --production` from the framework root once, resolving all workspace deps in a single pass.
- `.bin/spinosa` launches `npx @spinosa/tui` when installed, falls back to system `opencode`.
- Handoff runners use the bundled TUI path instead of system `opencode`.
- `package-release.sh` strips test/ and node_modules from opencode/tui packages before packaging.

### Fixed

- Cross-platform build failure for darwin-x64 (onnxruntime arm64-only). Native platform builds handled per-platform.


### Fixed (beta.12 re-release)

- OCR in `addFiles` flow was a no-op stub — now calls `runPpuOcrBatch` to actually process images.
- Multi-folder "new workspace": additional source paths imported via `runAdd` with `subfolder` option, files land in `raw/<foldername>/`.
- Progress counter shown during OCR: status line updates with `5/65 filename → OCR ...` in real-time.
- `ToolStatus` now includes `ocr: boolean` field, `detectDocumentTools` properly checks `ppu-paddle-ocr` availability.
- `finishProvider` error handling: launch failures show in TUI log instead of silent.
- `workspaceAsciiBannerText` strips `-spinosa` suffix including numbered variants (e.g. `-spinosa-28`).
- Type errors fixed: `search.ts` prefix scope, `event.ts` decodeSerializedEvent null guard, `framework.ts` `ver`/`compareFrameworkVersions` issues, `theme/index.ts` `ansiToRgba` return type, missing imports in `onboarding.tsx` and `cli-bridge.ts`.
- `runReinstall`: 120s timeout, ANSI-stripped output, no more `stdio: inherit` leaking CLI into TUI.

## [0.8.0-beta.12] — 2026-07-07

### Fixed

- Upgrade banner now infers release channel from the installed bundle version instead of user config, so a beta install never gets offered a stable upgrade.
- In-TUI upgrade shows step-by-step toast progress and restarts the TUI on completion — no more spawning a separate CLI window.
- Tool repair (`runReinstall`) uses the local `install.sh` with captured output instead of downloading from GitHub, keeping all progress visible inside the TUI.
- `workspaceAsciiBannerText` correctly strips the `-spinosa` suffix from workspace names with dedup numbers (e.g. `corpus-spinosa-2` → `CORPUS-2`).
- All Python vendor dependencies removed from the framework.  `markitdown-ts` and `ppu-paddle-ocr` handle document conversion and OCR as Bun/TS packages.  No more `pip install`, Python runtime, or vendor tarballs.
- Worker no longer crashes on `effect` import (removed stale `Either` barrel import in `event.ts`).  RPC `call()` properly handles `postMessage` failures with `Promise.withResolvers()`.
- `runReinstall` no longer hardcodes `"stable"` channel — inferred from bundle version like all other upgrade paths.
- Three missing imports (`workspaceAsciiBannerText`, `runUpgrade`, `placeholders`) restored in `home.tsx` — fixes TUI crashes on workspace switch.

## [0.8.0-beta.10] — 2026-07-02

### Changed

- `spinosa update` now records a minimal workspace manifest (`file`/`dir`) instead of rebuilding per-file SHA-256 hashes after every update, which removes the slow post-copy hashing phase.
- The update workspace picker now shows only workspaces that are behind the current framework version, dedupes repeated registry entries by path, and skips the redundant confirmation after selecting `All workspaces`.
- Agent mirror refresh now renders a real step progress bar instead of a spinner-only status line.

### Fixed

- `spinosa update` no longer crashes on macOS system Bash 3.2 when the stale-workspace filter sees an empty array under `set -u`.
- Framework template cleanup: removed tracked session residue from `.spinosa/archive/` and reset `.spinosa/memory/orchestrator-notes.md` to a neutral template state.

## [0.8.0-beta.9] — 2026-07-02

### Changed

- `spinosa update` now uses a simpler ownership model: release-managed framework paths overwrite in place, while user-state such as `raw/`, `system/context.md`, and workspace notes is preserved.
- Agent mirror refresh now runs only when `AGENTS.md` or `.agents/` changed, so ordinary framework updates avoid the extra mirror pass.

### Fixed

- Local prerelease builds no longer crash on macOS system Bash 3.2 when rendering the interactive menu.
- Update progress now keeps a single unified spinner/progress state across manifest updates, directory sync, log migration, and mirror refresh, instead of flickering between partial bars and blank states.
- Ctrl-C during timed update operations is handled more quickly, with faster polling and child-process cancellation.
- `.bin/sync-agents.sh` now uses incremental local mirroring, which substantially reduces the time spent on `Refreshing agent mirrors`.

## [0.8.0-beta.8] — 2026-07-02

### Fixed

- `spinosa update` on cloud-folder workspaces now stages manifest and workspace-metadata rewrites locally, copies them back through the timeout-safe path, and time-bounds the final `sync-agents` step so the process no longer appears to freeze immediately after framework copies.
- The `spinosa update` workspace picker now includes a single `All workspaces` action and visually separates utility actions from the registered workspace list.
- Removed stale startup dashboard appendix content from `startup-prompt.md`; startup chart behavior now lives in shared chart-rendering references instead of duplicated prompt-local instructions.
- Added `spinosa-visualizer` to the orchestrator contract in `AGENTS.md` and fixed `.bin/sync-agents.sh` so visualizer mirrors regenerate correctly for Codex, Claude, OpenCode, and Hermes.

## [0.8.0-beta.7] — 2026-07-02

### Fixed

- Channel-less upgrade and auto-upgrade now use `beta: true|false` from `~/.spinosa/metadata/config.yaml` as the single persisted channel switch, so beta installs do not fetch stable releases and stable installs do not fetch beta releases.
- Installer and workspace config bootstrap now persist only `beta: true|false` and remove legacy `release_channel:` entries when rewriting config.

## [0.8.0-beta.6] — 2026-07-02

### Added

- Visualizer coverage for full matrix heatmaps, connected line charts, ridge plots, vertical bars, and categorical histograms, with reusable script helpers.
- Release-channel regression coverage for exact beta installer URLs, rolling channel URLs, installer channel metadata, and channel-aware `--latest`.

### Fixed

- `install.sh --prefix` no longer overwrites the global `~/.local/bin/spinosa` shim, skips PATH/basic-test side effects, and prints the custom install command.
- Global shims now fail with a clear missing-target message if the installed CLI target is broken.
- Beta installs now persist `beta: true`; exact beta installs download immutable `vX.Y.Z-beta.N` assets; installer `--latest` resolves through the active rolling channel.
- Channel version resolution no longer emits `Broken pipe` warnings under `pipefail`.
- Release publishing now validates `PINNED_TAG`, stages exact release installers with immutable tags, and uploads separate rolling-channel installer/checksum assets.
- `test-new-test-vault.sh` preserves and restores an existing global shim during integration tests.

## [0.8.0-beta.5] — 2026-07-02

### Added

- Config consolidation: `last_installed_version` and `auto_upgrade` moved to `~/.spinosa/metadata/config.yaml`. Orphan `scan_permission` removed. Dead `install.yaml` fields stripped. Installer reads/writes `last_installed_version` from config.yaml. (User settings now in one file.)
- Pinned `pypdf==5.1.0` in installer and vendor builds for reproducible Python dependency installs.
- Hash-locked vendor package install: `build-spinosa-vendor.sh` generates a platform-targeted `requirements.txt` with SHA-256 hashes; `install.sh` runs `pip install --require-hashes` when present.
- Pre-install disk space check: installer fails early when free space on temp or install volume is below ~500MB.
- Expanded `spinosa --help` with global flags, command options, conventions, and examples. Per-command `--help` routing for all commands.
- Community documentation files: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `SUPPORT.md`. GitHub issue/PR templates.

### Fixed

- Version check cache cleanup now clears channel-suffixed variants (`_stable`, `_beta`).
- `auto_upgrade_check()` now reads `auto_upgrade:` from config.yaml (env var `SPINOSA_NO_UPGRADE_CHECK=1` still takes priority).

## [0.8.0-beta.4] — 2026-07-01

### Fixed

- `spinosa update` on cloud storage: files whose framework content hasn't changed between versions are now detected via local hash comparison and skipped entirely — no cloud I/O, no timeout wait.
- Progress bar now renders before the cloud hash operation, so the spinner animates during the 30s hashing wait instead of staying frozen.

## [0.8.0-beta.3] — 2026-07-01

### Added

- Config-switchable release channel: set `beta: true|false` in `~/.spinosa/metadata/config.yaml`. Auto-upgrade and `spinosa upgrade` respect the persisted preference. Running `spinosa upgrade --channel beta` (or `--channel stable`) saves the choice to config — no manual file editing required.

## [0.8.0-beta.2] — 2026-07-01

### Fixed

- Auto-upgrade no longer offers stable when an installed beta is already newer than the stable channel.
- `spinosa update` progress now keeps the active file line animated during long cloud copy/hash operations.
- Ctrl-C during timed cloud I/O cancels the active child process promptly instead of waiting through retries/timeouts.
- Version comparison now handles prereleases (`0.8.0-beta.1` is newer than `0.7.7`, older than `0.8.0`).

## [0.8.0-beta.1] — 2026-07-01

### Added

- Release channels: rolling stable (`releases/download/stable/install.sh`) and rolling beta (`releases/download/beta/install.sh`)
- `spinosa upgrade --channel beta` — tracks newest beta prerelease (`--channel dev` remains a compatibility alias)
- Stable and beta installs now use explicit rolling GitHub release tags instead of GitHub `latest` / `dev`
- `.bin/lib/spinosa/release_channels.sh` — channel resolution helpers

## [0.7.7] — 2026-07-01

### Fixed

- `spinosa upgrade` re-execs after install so post-upgrade workspace update loads the new framework libraries (avoids stale in-memory update code on cloud workspaces)
- `logs/` → `.logs/` migration skips bulk directory rename on cloud storage (Google Drive FUSE can hang on `mv`)

## [0.7.6] — 2026-07-01

### Fixed

- `spinosa update` on cloud workspaces no longer hangs indefinitely on checksum, directory prune, migration `mv`, or injection append — timeouts on `sha256_file` (cloud), skip `find`/`rm` prune on cloud dirs, stream-first cloud copies
- Hash timeouts no longer mis-classify cloud files as "customized" during update (counted as copy failures instead)
- Legacy `logs/` migration: per-file `safe_copy` fallback after `mv` timeout, Phase 5 finalize pass, auto-archive `session_metrics.tsv` / `user_requests.md` to `.spinosa/archive/`, remove empty `logs/` after retired cleanup
- `docs/reference/testsuite.md` stripped from release bundle and skipped during `docs/` directory copy (retired manifest alone was insufficient)
- Agent-interception skill and `agent_reports/AGENTS.md` updated for `.logs/` / `.spinosa/archive/` paths
- Update logs each manifest path to `~/.spinosa/logs/spinosa.log` so stalled sync shows the current file when the UI spinner freezes

### Changed

- Workspace clutter cleanup: `logs/` → hidden `.logs/` (with `spinosa update` migration from legacy `logs/`)
- `CHANGELOG.md`, workspace `install.sh`, and `docs/reference/testsuite.md` no longer shipped to user workspaces (repo/maintainer only)
- GitHub release `install.sh` asset unchanged (`curl | bash`)
- Artifact naming: `.agents/references/artifact-naming.md`; directory `AGENTS.md`, write-capable agents, templates, and `startup-prompt.md` require human-readable filenames (topic slugs — not `report.md`, `analysis.md`, `batch_001`)

## [0.7.5] — 2026-07-01

### Fixed

- Cloud workspace `spinosa update` / copy no longer hangs indefinitely on Google Drive, Dropbox, or OneDrive — per-file timeout (default 60s, `SPINOSA_CLOUD_COPY_TIMEOUT_SEC`) with explicit failure reason

## [0.7.4] — 2026-07-01

### Fixed

- `spinosa doctor` no longer exits with warning count (e.g. 3) under `set -e` — completes with normal summary and exit 1
- `read_vendor_metadata_field` reads full YAML values (vendor `pip_fingerprint` with spaced ONNX versions)
- Install marks version complete before basic test so `spinosa version` resolves during install smoke check
- Phase A tests: `test-import-routing.sh` frontmatter assertions; `test-install-vendor-reuse.sh` install.sh extract

### Added

- `docs/reference/testsuite.md` — pre-release production gate (automated, install, CLI, workspace, Linux VM, GitHub sign-off)
- `.bin/test-new-test-vault.sh` — maintainer-only `spinosa new` gate against `TEST-VAULT` (repo/testsuite; not shipped to user workspaces)
- Testsuite automation rule: `--launch copy` for non-interactive `spinosa new` (no OpenCode terminal spawn)

### Changed

- Maintainer-only scripts (`.bin/test-*.sh`, `package-release.sh`, `build-spinosa-vendor.sh`, `validate-skills.sh`, `check-doc-contract.sh`) removed from `framework-files.tsv`; listed in `retired-framework-files.tsv` so `spinosa update` drops them from workspaces

## [0.7.3] — 2026-07-01

### Fixed

- `spinosa` no longer crashes on macOS bash 3.2 when run with no arguments (`ORIGINAL_ARGS[@]: unbound variable` under `set -u`)
- Installer only treats a version as "installed" after success (`versions/<ver>/.spinosa-install-complete` + `metadata/install.yaml`)
- Partial/failed installs are removed on retry and no longer trigger false "already installed" upgrade prompts
- `spinosa` CLI resolves only complete version dirs (ignores partial `versions/*` leftovers)

### Added

- `spinosa doctor` warns when incomplete `versions/*` directories are present

## [0.7.2] — 2026-07-01

### Fixed

- Installer no longer exits silently on macOS after vendor checksum (bash 3.2 + `set -u` chained `local` in `vendor_python_for_dir`)
- `prompt_upgrade()` no longer aborts under `set -e` when versions differ (same class as v0.7.1 `spinosa update` fix)
- Basic test failure no longer aborts install before success banner
- `spinosa upgrade` no longer reports hard failure when installer exits non-zero but CLI is present

### Added

- Unified bash logging to `~/.spinosa/logs/spinosa.log` (installer, CLI, upgrade, and `.bin/` scripts)
- ERR trap in installer — failures show line number and log path instead of silent exit

## [0.7.1] — 2026-07-01

### Fixed

- `spinosa update` no longer aborts under `set -e` when CLI is newer than workspace (normal upgrade path)

## [0.7.0] — 2026-07-01

### Added

- `spinosa doctor` — health check for CLI/workspace version skew, document tools, cloud paths, Hermes config drift
- `spinosa update` progress — per-path manifest progress, per-file copy bar for large dirs, changed-path summary
- `spinosa new` converter progress — unified MarkItDown/OCR bar, 1s spinner/elapsed refresh while converting
- CLI reference: upgrade lifecycle, `spinosa update`, integrations section
- Post-upgrade integration checklist (Hermes merge reminder)
- `CHANGELOG.md` and `.bin/test-doctor.sh` shipped via framework manifest

### Changed

- README and FAQ distinguish `spinosa upgrade` (CLI) vs `spinosa update` (workspace)
- Post-upgrade workspace prompt explains vendor mirror regeneration

## [0.6.9] — 2026-07-01

### Added

- Vendor bundle reuse on upgrade when packages unchanged (skips redundant pip reinstall)
- Cloud-safe workspace update: per-file copy with retries and stream fallback for Google Drive / Dropbox / OneDrive

### Changed

- `onboarding.log` records enabled/excluded file-type batches with counts

## [0.6.8] — 2026-07-01

### Added

- Initial cloud-aware workspace update (safe copy tree)

## [0.6.7] — 2026-07-01

### Added

- Onboarding import verification and recovery (`onboarding.log`)
- Install-session PATH activation via `~/.spinosa/env.sh`
