# Changelog

All notable user-facing changes to Spinosa are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

**Release policy:** versions are published only with explicit maintainer approval.

## [Unreleased]

_(Nothing yet.)_

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