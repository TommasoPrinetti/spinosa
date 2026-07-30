# Handoff — Spinosa Upgrade Consolidation

Date: 2026-07-30
Goal: Restore reliable upgrade flow (check → prompt → install → verify → re-exec → new TUI).

## Done

### WP-0: Unblock beta channel (prerequisite)
- Fixed committed `install.sh` PINNED_VERSION from `1.0.2-beta.3` to `1.0.2-beta.14` (matching root `package.json`).

### WP-1: Version synchronization script
- `script/set-version.ts` syncs root `package.json` + `install.sh` PINNED_VERSION.

### WP-7: Version comparison consistency + tests
- `packages/spinosa-core/test/version.test.ts` — 25 tests, all pass.

### WP-3: Unified upgrade engine
- Single `upgradeFramework()` in `@spinosa/core/commands/upgrade`.
- Kernel `upgrade` command is the canonical CLI entry point.

### WP-4: Preflight + launcher restart
- `runLaunchPreflight()` in `@spinosa/core/commands/preflight`.
- Kernel `preflight` command + launcher re-exec on exit code 10.

### WP-5: Installer smoke tests
- All three `install.sh` validation paths use kernel entrypoint.

### WP-6: Release hardening
- `script/release.sh` validates branch, clean tree, version sync, typecheck, tests, live installer PINNED_VERSION.

### WP-2: Channel config consolidation
- Canonical key: `beta: true|false` in `config.yaml`.
- `setReleaseChannel()` writes `beta`, deletes legacy `release_channel`.
- `install.sh write_install_metadata()` matches same format.
- `spinosaReleaseChannel()` reads `beta` first, falls back to `release_channel`.
- Tests: `packages/spinosa-core/test/channels.test.ts`.

### WP-8: Code cleanup
- Removed kernel auto-upgrader (`packages/spinosa-kernel/src/cli/upgrade.ts`).
- Worker `checkUpgrade` no longer auto-installs (preflight handles launch upgrades).
- Removed TUI in-session `installation.update-available` handler from `app.tsx`.
- Removed duplicate `runUpgrade()` from `packages/tui/src/spinosa-cli.ts`.
- Replaced `isVersionGreater()` with `compareFrameworkVersions()`.

## Still to do

### HIGH PRIORITY

#### Beta channel must be republished
Live beta rolling channel still serves `beta.3`. Requires clean tree + `gh` auth:

```bash
bash script/release.sh v1.0.2-beta.14
```

## Key architectural decisions

| Decision | Value |
|---|---|
| Product version source | Root `package.json` |
| Upgrade engine | `upgradeFramework()` in `@spinosa/core/commands/upgrade` |
| Upgrade CLI | `spinosa upgrade` via kernel (`packages/spinosa-kernel/src/cli/cmd/upgrade.ts`) |
| Launch upgrade flow | `spinosa preflight` → exit 10 → launcher re-exec |
| Channel config canonical key | `beta: true|false` |
| Version comparator | `compareFrameworkVersions()` |

## How to run tests

```bash
cd packages/spinosa-core && bun test test/version.test.ts test/preflight.test.ts test/channels.test.ts
cd packages/tui && bun test test/spinosa/preflight.test.ts test/spinosa/cli.test.ts
```
