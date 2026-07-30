#!/usr/bin/env bash
# Legacy release entrypoint — prefer `bun run release:beta` or `bun run release:stable`.
# This wrapper pins an explicit version without incrementing semver.
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 vX.Y.Z[-beta.N]" >&2
  echo "Prefer: bun run release:beta:patch  (increments prerelease)" >&2
  echo "        bun run release:stable:patch (increments patch)" >&2
  exit 1
fi

VERSION="${1#v}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "→ Legacy explicit release for v${VERSION}"
echo "→ Syncing version files"
bun script/set-version.ts "$VERSION"

if [ -n "$(git status --porcelain package.json install.sh)" ]; then
  git add package.json install.sh
  git commit -m "release: v${VERSION}" --quiet
  git push origin HEAD --quiet
fi

bun script/release/validate.ts
bun script/release/build.ts "$VERSION"
bun script/release/verify-local.ts "$VERSION"

TAG="v${VERSION}"
if ! git rev-parse "$TAG" >/dev/null 2>&1; then
  git tag "$TAG"
fi
git push origin "refs/tags/${TAG}"

PRERELEASE=""
if echo "$VERSION" | grep -q '-'; then
  PRERELEASE="--prerelease"
fi

gh release create "$TAG" \
  --title "Spinosa v${VERSION}" \
  --generate-notes \
  $PRERELEASE \
  "dist/v${VERSION}/install.sh" \
  "dist/v${VERSION}/spinosa-v${VERSION}.tar.gz" \
  "dist/v${VERSION}/checksums.txt"

bash script/release/publish-channel.sh "$VERSION"
bun script/release/verify-remote.ts "$VERSION"

echo "✓ Released Spinosa v${VERSION}"
