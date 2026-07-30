#!/usr/bin/env bash
# Publish rolling channel assets after the immutable GitHub release exists.
set -euo pipefail

VERSION="${1:-}"
if [ -z "$VERSION" ]; then
  echo "Usage: bash script/release/publish-channel.sh <version>" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if echo "$VERSION" | grep -q '-'; then
  CHANNEL="beta"
  PRERELEASE="--prerelease"
else
  CHANNEL="stable"
  PRERELEASE=""
fi

CHANNEL_DIST="dist/${CHANNEL}"
if [ ! -f "${CHANNEL_DIST}/install.sh" ]; then
  echo "Error: channel assets missing at ${CHANNEL_DIST} — run release:build first" >&2
  exit 1
fi

SHA="$(git rev-parse HEAD)"
git tag -f "$CHANNEL" "$SHA"
git push origin "refs/tags/${CHANNEL}:refs/tags/${CHANNEL}" --force

gh release upload "$CHANNEL" \
  "${CHANNEL_DIST}/install.sh" \
  "${CHANNEL_DIST}/checksums.txt" --clobber

gh release edit "$CHANNEL" \
  --title "Spinosa v${VERSION} (${CHANNEL})" \
  --notes "Rolling ${CHANNEL} channel — points to v${VERSION}" \
  $PRERELEASE

echo "→ Rolling ${CHANNEL} channel synced to v${VERSION}"
