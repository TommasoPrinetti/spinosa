# Spinosa Framework Release Guide

> Read this before cutting a release.

---

## Release channels

| Channel | Audience | GitHub endpoint | `spinosa upgrade` |
| ------- | -------- | --------------- | ----------------- |
| **Stable** | Production users | `releases/download/stable/install.sh` | `spinosa upgrade` (default) |
| **Beta** | Maintainers, testers | `releases/download/beta/install.sh` | `spinosa upgrade --channel beta` |

Publishing a beta never changes the stable endpoint.

---

## Version naming

| Channel | Format | Example tag | `PINNED_VERSION` in `install.sh` |
| ------- | ------ | ----------- | -------------------------------- |
| Stable | `X.Y.Z` | `v0.7.7` | `0.7.7` |
| Beta | `X.Y.Z-<prerelease>` | `v0.8.0-beta.1` | `0.8.0-beta.1` |

The canonical version lives in `package.json`. `PINNED_VERSION` in `install.sh` must match after publishing.

---

## Prerequisites

- `gh` CLI installed and authenticated (`gh auth status`)
- Clean working tree (`git status --porcelain`)
- `bash`, `shasum` available

---

## Release script

One-liner that does everything:

```bash
# Make sure you're on the right branch and have committed.
# Then:
bash script/release.sh v0.8.0-beta.1     # beta
bash script/release.sh v0.7.7             # stable
```

Creates the GitHub Release, uploads `install.sh`, the immutable source archive, and `checksums.txt`, then syncs the rolling channel tag.

---

## Manual steps (if you want to understand what happens)

### 1. Bump version

```bash
# Edit package.json
jq '.version' package.json   # verify
# Or: npm version 0.8.0-beta.1 --no-git-tag-version
```

### 2. Update install.sh `PINNED_VERSION`

```bash
sed -i '' 's/^PINNED_VERSION=".*"/PINNED_VERSION="0.8.0-beta.1"/' install.sh
```

### 3. Run pre-release checks

```bash
bash -n install.sh
bash -n workspace-template/.bin/spinosa
(cd packages/tui && bun test test/spinosa)
```

### 4. Commit

```bash
git add -A
git commit -m "release: v0.8.0-beta.1"
```

### 5. Prepare assets

```bash
VERSION="0.8.0-beta.18"
DIST="dist/v${VERSION}"
mkdir -p "$DIST"
git tag "v${VERSION}"

cp install.sh "${DIST}/install.sh"
sed -i '' 's/^PINNED_VERSION=".*"/PINNED_VERSION="'"${VERSION}"'"/' "${DIST}/install.sh"
sed -i '' 's/^PINNED_TAG=".*"/PINNED_TAG="v'"${VERSION}"'"/' "${DIST}/install.sh"
git archive --format=tar.gz --prefix="spinosa-${VERSION}/" \
  -o "${DIST}/spinosa-v${VERSION}.tar.gz" "v${VERSION}"
(cd "$DIST" && shasum -a 256 install.sh "spinosa-v${VERSION}.tar.gz" \
  | awk '{print $1"  "$2}' > checksums.txt)
```

### 6. Create GitHub Release

```bash
gh release create "v${VERSION}" \
  --title "Spinosa v${VERSION}" \
  --generate-notes \
  $([[ "$VERSION" == *-* ]] && echo "--prerelease") \
  "dist/v${VERSION}/install.sh" \
  "dist/v${VERSION}/spinosa-v${VERSION}.tar.gz" \
  "dist/v${VERSION}/checksums.txt"
```

### 7. Sync rolling channel

```bash
# Stable
CHANNEL="stable"
# Beta
CHANNEL="beta"

SHA=$(git rev-parse HEAD)
git tag -f "$CHANNEL" "$SHA"
git push origin "refs/tags/${CHANNEL}:refs/tags/${CHANNEL}" --force

# Prepare channel installer (PINNED_TAG = channel name for upgrade resolution)
CHANNEL_DIST="dist/${CHANNEL}"
mkdir -p "$CHANNEL_DIST"
cp install.sh "${CHANNEL_DIST}/install.sh"
sed -i '' 's/^PINNED_VERSION=".*"/PINNED_VERSION="'"${VERSION}"'"/' "${CHANNEL_DIST}/install.sh"
sed -i '' 's/^PINNED_TAG=".*"/PINNED_TAG="'"${CHANNEL}"'"/' "${CHANNEL_DIST}/install.sh"
(cd "$CHANNEL_DIST" && shasum -a 256 install.sh | awk '{print $1"  "$2}' > checksums.txt)

gh release upload "$CHANNEL" \
  "dist/${CHANNEL}/install.sh" \
  "dist/${CHANNEL}/checksums.txt" --clobber

gh release edit "$CHANNEL" \
  --title "Spinosa v${VERSION} (${CHANNEL})" \
  --notes "Rolling ${CHANNEL} channel — points to v${VERSION}" \
  $([[ "$VERSION" == *-* ]] && echo "--prerelease" || true)
```

### 8. Verify

```bash
curl -fsSL "https://github.com/medialab/spinosa/releases/download/${CHANNEL}/install.sh" | grep PINNED_VERSION
# Must show the version you just published
```

---

## Linux VM testdrive (pre-stable validation)

Run on a **fresh Linux VM** (Ubuntu 22.04+, amd64 or arm64) before a **stable** release.

```bash
# Inside the VM
curl -fsSL https://github.com/medialab/spinosa/releases/download/beta/install.sh | bash
source ~/.bashrc
spinosa version
```

---

## Gotchas

- **Clean tree required:** commit before tagging; the GitHub auto-tarball reflects the tagged commit.
- **`PINNED_VERSION` must match:** the installer pins the version — if it doesn't match the tag, install breaks.
- **`dist/` is gitignored:** release assets live in `dist/vX.Y.Z/` — never committed.
- **Beta does not move `stable`:** only stable releases refresh the rolling `stable` endpoint.
- **GitHub Actions are disabled** for releases — everything runs locally via `gh`.
