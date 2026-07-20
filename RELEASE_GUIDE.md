# Spinosa Framework Release Guide

> Read this before cutting a release.

---

## Release channels

Spinosa ships on two independent channels:

| Channel | Audience | GitHub endpoint | `spinosa upgrade` |
| ------- | -------- | --------------- | ----------------- |
| **Stable** | Production users | `releases/download/stable/install.sh` | `spinosa upgrade` (default) |
| **Beta** | Maintainers, testers | `releases/download/beta/install.sh` | `spinosa upgrade --channel beta` |

**Invariant:** Publishing a beta never changes the stable endpoint.

---

## Version naming

| Channel | Format | Example | `PINNED_VERSION` |
| ------- | ------ | ------- | ---------------- |
| Stable | `X.Y.Z` | `v0.7.7` | `0.7.7` |
| Beta | `X.Y.Z-<prerelease>` | `v0.8.0-beta.1` | `0.8.0-beta.1` |

The canonical version lives in root `package.json`. After publishing, `PINNED_VERSION` in `install.sh` and the pushed tag must match.

---

## Prerequisites

- `gh` CLI installed and authenticated (`gh auth status`)
- Clean working tree (`git status --porcelain`)
- On the correct branch: `beta` for beta releases, `main` for stable releases

---

## Pre-release checklist

Before tagging, run these checks. If any fail, **do not release** — fix first.

### Shell syntax

```bash
bash -n install.sh
bash -n workspace-template/.bin/spinosa
```

### Manifest integrity

```bash
test -f workspace-template/.spinosa/workspace-files.tsv
test -f workspace-template/.bin/spinosa
```

### TypeScript typecheck

```bash
bash script/verify-release.sh
```

This runs shell and manifest checks, typechecks every workspace that declares one,
the Spinosa test suite, and a host binary build/smoke test. The release script and
CI run the same gate automatically.

### Version match

Verify the tag you're about to push matches `package.json`:

```bash
PKG_VERSION="$(jq -r '.version' package.json)"
echo "package.json: ${PKG_VERSION}"
echo "tag:         v${PKG_VERSION}"
```

### Update `install.sh` PINNED_VERSION

The committed `install.sh` must have the matching version before tagging:

```bash
# Check current pin
grep '^PINNED_VERSION' install.sh

# Update if needed
sed -i '' 's/^PINNED_VERSION=".*"/PINNED_VERSION="0.8.0-beta.1"/' install.sh
```

Commit this change as part of the release commit.

---

## Releasing (the fast way)

One command does everything — prepares assets, pushes the tag, creates the GitHub Release, syncs the rolling channel, verifies:

```bash
bash script/release.sh v0.8.0-beta.18   # beta
bash script/release.sh v0.7.7            # stable
```

The script:
1. Validates the version format
2. Checks `gh` is authenticated
3. Checks working tree is clean
4. Prepares tag-specific `install.sh` with pinned version + checksums
5. Prepares channel-specific `install.sh` with `PINNED_TAG` set to the channel name
6. Creates the git tag (if it doesn't exist) and pushes it
7. Creates the GitHub Release with `--generate-notes` and `--prerelease` if beta
8. Force-pushes the rolling channel tag (`beta` or `stable`) to the same commit
9. Uploads/clobbers `install.sh` + `checksums.txt` on the channel release
10. Edits the channel release title
11. Verifies the published installer shows the correct version

---

## Releasing (step by step)

### 1. Implement changes

Make all source changes on the correct branch:
- **Beta:** work on the `beta` branch
- **Stable:** work on `main`, or merge `beta` into `main` when ready

### 2. Bump version

```bash
# Edit package.json version field
jq '.version' package.json   # verify current
```

### 3. Update install.sh

```bash
# Set PINNED_VERSION to match the new version
sed -i '' 's/^PINNED_VERSION=".*"/PINNED_VERSION="0.8.0-beta.18"/' install.sh
```

### 4. Run pre-release checks

```bash
bash -n install.sh
bash -n workspace-template/.bin/spinosa
test -f workspace-template/.spinosa/workspace-files.tsv
test -f workspace-template/.bin/spinosa
(cd packages/tui && bun test test/spinosa)
```

### 5. Commit

```bash
git add -A
git commit -m "release: v0.8.0-beta.18"
```

### 6. Push branch

```bash
git push origin refs/heads/beta:refs/heads/beta   # beta
git push origin main                               # stable
```

### 7. Run release script

```bash
bash script/release.sh v0.8.0-beta.18
```

### 8. Verify

```bash
curl -fsSL https://github.com/medialab/spinosa/releases/download/beta/install.sh | grep PINNED_VERSION
# Must show the version you just published

# Check the release exists
gh release view v0.8.0-beta.18
```

---

## Verification (full install test)

Run this on a **fresh machine or Linux VM** to validate the installer works end to end:

```bash
# Inside the VM
curl -fsSL https://github.com/medialab/spinosa/releases/download/beta/install.sh | bash
source ~/.bashrc
spinosa version
```

### Lima VM (macOS)

```bash
# Check if VM exists
limactl list

# Start if needed
limactl start spinosa-test

# Run install
limactl shell spinosa-test bash -c '
  curl -fsSL https://github.com/medialab/spinosa/releases/download/beta/install.sh | bash
  source ~/.bashrc
  spinosa version
'
```

Expected output:
- Bun 1.3.14 installed
- npm dependencies installed
- `spinosa` CLI available in PATH
- Version matches the released version

---

## Upgrade test

After installing the new version, test the upgrade path from the previous version:

```bash
spinosa upgrade --channel beta --yes
```

---

## Gotchas

### Publishing

- **Clean tree required:** commit before tagging; the GitHub auto-tarball reflects the tagged commit
- **`PINNED_VERSION` must match:** the installer pins the version — if it doesn't match the tag, install breaks
- **`dist/` is gitignored:** release assets live in `dist/vX.Y.Z/` — never committed
- **Beta does not move `stable`:** only stable releases refresh the rolling `stable` endpoint

### Branch management

- Work on `beta` for beta development
- When ready for a stable release, merge `beta` into `main`
- The rolling `beta` tag is force-pushed on each beta release — the `stable` tag is force-pushed on each stable release

### Troubleshooting

- **`gh` not authenticated:** run `gh auth login`
- **Tag already exists:** delete and re-create: `git tag -d vX.Y.Z && git push --delete origin vX.Y.Z`
- **Release already exists:** delete with `gh release delete vX.Y.Z` then re-run
- **Channel tag conflict:** `beta` and `stable` are both branch names and tag names — use full refspec (`refs/tags/...`) when ambiguity arises
