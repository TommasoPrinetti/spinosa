# Spinosa Framework Release Guide

> Maintainer reference for cutting and publishing Spinosa releases. Read this before tagging.

---

## Quick start

**Preferred:** use `release-it` — it bumps semver, syncs version files, builds assets, publishes to GitHub, syncs the rolling channel, and verifies the live installer.

```bash
# Beta prerelease (from beta branch)
bun run release:beta:patch    # or :minor

# Stable release (from main branch)
bun run release:stable:patch    # or :minor / :major
```

**Republish a specific version** without incrementing semver (e.g. fix a broken channel asset):

```bash
bun run release:republish -- v1.0.2-beta.14
```

Both flows require a **clean working tree**, branch `main` or `beta`, and `gh` authenticated (`gh auth status`).

---

## How releases work

Spinosa publishes **two kinds** of GitHub releases for every version:

| Release | Tag | Assets | Purpose |
| ------- | --- | ------ | ------- |
| **Immutable version** | `vX.Y.Z` or `vX.Y.Z-beta.N` | `install.sh`, `spinosa-v{VERSION}.tar.gz`, `checksums.txt` | Exact install/upgrade target; tarball is the source bundle |
| **Rolling channel** | `stable` or `beta` | `install.sh`, `checksums.txt` | Always points at the newest release on that channel |

| Channel | Audience | Install URL | Upgrade default |
| ------- | -------- | ----------- | --------------- |
| **Stable** | Production users | `releases/download/stable/install.sh` | `spinosa upgrade` |
| **Beta** | Maintainers, testers | `releases/download/beta/install.sh` | `spinosa upgrade --channel beta` |

Publishing a beta **never** moves the `stable` rolling tag.

### Version source of truth

The canonical product version lives in **root `package.json`**. Before every release, `script/set-version.ts` synchronizes:

- `package.json` → `"version"`
- `install.sh` → `PINNED_VERSION`

```bash
# Manual sync (normally handled by release-it after:bump hook)
bun script/set-version.ts 1.0.2-beta.14
```

Internal upstream package versions (`@spinosa/kernel-core`, `@spinosa/core`, etc.) are **independent** — this script does not touch them.

### Version naming

| Channel | Format | Example tag | `PINNED_VERSION` |
| ------- | ------ | ----------- | ---------------- |
| Stable | `X.Y.Z` | `v1.0.0` | `1.0.0` |
| Beta | `X.Y.Z-<prerelease>` | `v1.0.2-beta.14` | `1.0.2-beta.14` |

Channel is inferred from the version string (`releaseChannel()` in `@spinosa/core`).

---

## Release pipeline

Hooks are defined in `.release-it.json`. Both `release-it` and `bun run release:republish` run the same stages.

```mermaid
flowchart LR
  validate[release:validate]
  bump[semver bump + set-version]
  build[release:build]
  verifyLocal[release:verify-local]
  ghRelease[GitHub release vX.Y.Z]
  channel[release:publish-channel]
  verifyRemote[release:verify-remote]

  validate --> bump --> build --> verifyLocal --> ghRelease --> channel --> verifyRemote
```

| Stage | Script | What it checks |
| ----- | ------ | -------------- |
| Validate | `bun script/release/validate.ts` | Branch `main`/`beta`, clean tree, `bun run quality` |
| Sync version | `bun script/set-version.ts ${version}` | `package.json` + `install.sh` PINNED_VERSION match |
| Build | `bun script/release/build.ts ${version}` | Stage `dist/v{VERSION}/` and `dist/{channel}/` installers + checksums + tarball |
| Verify local | `bun script/release/verify-local.ts ${version}` | All three version-release assets exist; checksums include both files |
| GitHub release | `release-it` or `gh release create` | Upload immutable version assets |
| Publish channel | `bun script/release/publish-channel.ts ${version}` | Force-push rolling `stable`/`beta` tag; upload channel installer |
| Verify remote | `bun script/release/verify-remote.ts ${version}` | Live rolling installer `PINNED_VERSION` matches published version |

Run individual stages manually when debugging:

```bash
bun run release:validate
bun script/set-version.ts 1.0.2-beta.14
bun script/release/build.ts 1.0.2-beta.14
bun script/release/verify-local.ts 1.0.2-beta.14
# ... publish ...
bun script/release/publish-channel.ts 1.0.2-beta.14
bun script/release/verify-remote.ts 1.0.2-beta.14
```

### What `release:build` produces

```
dist/v{VERSION}/
  install.sh              # PINNED_TAG=v{VERSION}
  spinosa-v{VERSION}.tar.gz
  checksums.txt           # both install.sh AND tarball (required)

dist/{stable|beta}/
  install.sh              # PINNED_TAG=stable|beta (rolling)
  checksums.txt           # install.sh only
```

The version-release `checksums.txt` **must** list both `install.sh` and `spinosa-v{VERSION}.tar.gz`. If the tarball entry is missing, installs and upgrades abort with `spinosa-v{VERSION}.tar.gz not found in checksums file`.

---

## Prerequisites

- `gh` CLI installed and authenticated
- `bun` (repo uses `bun@1.3.14`)
- Clean working tree (`git status --porcelain` empty)
- `bash`, `shasum` available
- `GITHUB_TOKEN` or `GH_TOKEN` set for channel publish/verify (optional for verify-remote — falls back to anonymous curl)

---

## Pre-release validation

Before cutting a release, run the full maintainer gate:

```bash
# Automated release gate (same as release:validate)
bun run release:validate

# Shell syntax
bash -n install.sh
bash -n workspace-template/.bin/spinosa

# Installer smoke tests
bun run test:installer

# Broader TUI / Spinosa flow tests
(cd packages/tui && bun test test/spinosa)
```

For the full interactive + VM matrix, see `workspace-template/docs/reference/testsuite.md`.

---

## Linux VM testdrive (pre-stable validation)

Run on a **fresh Linux VM** (Ubuntu 22.04+, amd64 or arm64) before a **stable** release.

```bash
# Inside the VM
curl -fsSL https://github.com/medialab/spinosa/releases/download/beta/install.sh | bash
source ~/.bashrc
spinosa version
spinosa doctor
```

---

## Post-publish verification

### Version release assets

```bash
VERSION="1.0.2-beta.14"
gh release view "v${VERSION}" --json assets \
  | python3 -c "import sys,json; [print(a['name']) for a in json.load(sys.stdin)['assets']]"
# Expected: checksums.txt, install.sh, spinosa-v${VERSION}.tar.gz
```

```bash
curl -fsSL "https://github.com/medialab/spinosa/releases/download/v${VERSION}/checksums.txt"
# Expected: 2 lines — install.sh and spinosa-v${VERSION}.tar.gz
```

### Rolling channel

```bash
CHANNEL="beta"   # or stable
curl -fsSL "https://github.com/medialab/spinosa/releases/download/${CHANNEL}/install.sh" | grep PINNED_VERSION
# Must show the version you just published
```

`release:verify-remote` runs this check automatically at the end of every release.

---

## Upgrade architecture (maintainer context)

User-facing upgrades are centralized in `@spinosa/core`:

| Concern | Location |
| ------- | -------- |
| Upgrade engine | `upgradeFramework()` in `packages/spinosa-core/src/commands/upgrade.ts` |
| Launch-time check | `runLaunchPreflight()` in `packages/spinosa-core/src/commands/preflight.ts` |
| CLI entry points | `spinosa upgrade`, `spinosa preflight` (kernel commands) |
| Version comparison | `compareFrameworkVersions()` |
| Channel config | `beta: true\|false` in `~/.spinosa/metadata/config.yaml` |

**Launch flow:** when you run `spinosa` (no args) or `bun run dev`, the kernel TUI runs `runLaunchPreflight()` once, prints `checking for updates...` / `no updates available` (1s minimum), then `launching TUI...`. If preflight upgrades and requests a restart, it exits with code `10` and the launcher / `spinosa-cli` re-execs. The TUI does not own upgrade networking or installation.

**Dev tree:** `bun run dev` skips the bash launcher; the kernel TUI runs preflight inline. Dev builds (`installedVersion === "dev"`) skip the network upgrade check.

Disable launch-time checks: `SPINOSA_NO_UPGRADE_CHECK=1` or `auto_upgrade: false` in config.

---

## Gotchas

- **Clean tree required:** commit before tagging; the tarball is built from `HEAD`.
- **`PINNED_VERSION` must match:** use `set-version.ts` — never hand-edit one file without the other.
- **`dist/` is gitignored:** release assets live in `dist/vX.Y.Z/` and `dist/{channel}/` — never committed.
- **Beta does not move `stable`:** only stable releases refresh the rolling `stable` endpoint.
- **GitHub Actions are disabled** for framework releases — everything runs locally via `release-it` / `gh`.
- **Version-release checksums need both entries** — always curl the live `checksums.txt` before declaring a release done.
- **Channel-release checksums are install.sh only** — the tarball lives on the immutable version release, not the rolling channel.
- **Republishing:** `bun run release:republish -- vX.Y.Z` commits version sync changes if needed, then runs the full pipeline.

---

## Legacy manual publish (reference only)

Use the automated flows above. These steps document what the scripts do internally.

<details>
<summary>Manual asset staging</summary>

```bash
VERSION="1.0.2-beta.14"
bun script/set-version.ts "$VERSION"
bun script/release/build.ts "$VERSION"
bun script/release/verify-local.ts "$VERSION"

TAG="v${VERSION}"
git tag "$TAG"   # if not already tagged
gh release create "$TAG" \
  --title "Spinosa v${VERSION}" \
  --generate-notes \
  $([[ "$VERSION" == *-* ]] && echo --prerelease) \
  "dist/v${VERSION}/install.sh" \
  "dist/v${VERSION}/spinosa-v${VERSION}.tar.gz" \
  "dist/v${VERSION}/checksums.txt"

bun script/release/publish-channel.ts "$VERSION"
bun script/release/verify-remote.ts "$VERSION"
```

</details>
