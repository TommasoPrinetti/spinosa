#!/usr/bin/env bash
# ── release.sh — Create a GitHub Release and sync the rolling channel ──────
# Usage: bash script/release.sh v0.8.0-beta.18   # beta
#        bash script/release.sh v0.7.7            # stable
#
# Prerequisites: gh CLI authenticated.
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 vX.Y.Z[-beta.N]" >&2
  exit 1
fi

TAG="$1"
VERSION="${TAG#v}"

# Validate
if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$'; then
  echo "Error: invalid version format: $VERSION" >&2
  exit 1
fi

# Determine channel
if echo "$VERSION" | grep -q '-'; then
  CHANNEL="beta"
  PRERELEASE="--prerelease"
else
  CHANNEL="stable"
  PRERELEASE=""
fi

echo "→ Releasing Spinosa v${VERSION} (${CHANNEL})"

# Check gh auth
gh auth status 2>/dev/null || { echo "Error: gh not authenticated"; exit 1; }

# Bump root package.json so InstallationVersion matches the release.
# This commit becomes the tag target — the tarball inherits the correct version.
sed -i '' 's/"version": "[^"]*"/"version": "'"${VERSION}"'"/' package.json
if [ -n "$(git status --porcelain package.json)" ]; then
  git add package.json
  git commit -m "release: v${VERSION}" --quiet
  git push origin HEAD --quiet
  echo "→ package.json bumped to ${VERSION}"
fi

# Clean working tree (after the package.json commit)
if [ -n "$(git status --porcelain)" ]; then
  echo "Error: working tree not clean — commit first" >&2
  exit 1
fi

# Create the immutable tag (points to the commit with correct package.json).
if ! git rev-parse "$TAG" >/dev/null 2>&1; then
  git tag "$TAG"
  echo "→ Created tag $TAG"
fi

# Prepare tag assets
DIST="dist/v${VERSION}"
mkdir -p "$DIST"
cp install.sh "${DIST}/install.sh"
sed -i '' 's/^PINNED_VERSION=".*"/PINNED_VERSION="'"${VERSION}"'"/' "${DIST}/install.sh"
sed -i '' 's/^PINNED_TAG=".*"/PINNED_TAG="'"${TAG}"'"/' "${DIST}/install.sh"
ARCHIVE_NAME="spinosa-v${VERSION}.tar.gz"
git archive --format=tar.gz --prefix="spinosa-${VERSION}/" -o "${DIST}/${ARCHIVE_NAME}" "$TAG"
(
  cd "$DIST"
  shasum -a 256 install.sh "$ARCHIVE_NAME" | awk '{print $1"  "$2}' > checksums.txt
)

# Prepare channel assets (PINNED_TAG = channel name for upgrade resolution)
CHANNEL_DIST="dist/${CHANNEL}"
mkdir -p "$CHANNEL_DIST"
cp install.sh "${CHANNEL_DIST}/install.sh"
sed -i '' 's/^PINNED_VERSION=".*"/PINNED_VERSION="'"${VERSION}"'"/' "${CHANNEL_DIST}/install.sh"
sed -i '' 's/^PINNED_TAG=".*"/PINNED_TAG="'"${CHANNEL}"'"/' "${CHANNEL_DIST}/install.sh"
(
  cd "$CHANNEL_DIST"
  shasum -a 256 install.sh | awk '{print $1"  "$2}' > checksums.txt
)

# Push tag
git push origin "refs/tags/${TAG}"
echo "→ Tag $TAG pushed"

# Create GitHub Release
gh release create "$TAG" \
  --title "Spinosa v${VERSION}" \
  --generate-notes \
  $PRERELEASE \
  "${DIST}/install.sh" \
  "${DIST}/${ARCHIVE_NAME}" \
  "${DIST}/checksums.txt"
echo "→ Release v${VERSION} created"

# Sync rolling channel
SHA=$(git rev-parse HEAD)
git tag -f "$CHANNEL" "$SHA"
git push origin "refs/tags/${CHANNEL}:refs/tags/${CHANNEL}" --force

gh release upload "$CHANNEL" \
  "${CHANNEL_DIST}/install.sh" \
  "${CHANNEL_DIST}/checksums.txt" --clobber

gh release edit "$CHANNEL" \
  --title "Spinosa v${VERSION} (${CHANNEL})" \
  --notes "Rolling ${CHANNEL} channel — points to v${VERSION}" \
  $PRERELEASE
echo "→ Rolling ${CHANNEL} channel synced"

echo ""
echo "✓ Released Spinosa v${VERSION} on ${CHANNEL} channel"
curl -fsSL "https://github.com/medialab/spinosa/releases/download/${CHANNEL}/install.sh" | grep PINNED_VERSION
