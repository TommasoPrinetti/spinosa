# Changelog

All notable user-facing changes to Spinosa are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

**Release policy:** versions are published only with explicit maintainer approval.

## [Unreleased]

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
