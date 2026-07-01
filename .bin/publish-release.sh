#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SPINOSA_LOG_COMPONENT="publish-release"
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/lib/spinosa/logging_bootstrap.sh" "$@"

# Publish a Spinosa framework release from the current checkout.
# Requires: git, gh, and a clean working tree.
#
# Stable:  bash .bin/publish-release.sh X.Y.Z
# Dev/beta: bash .bin/publish-dev-release.sh X.Y.Z-beta.N
#           (or: bash .bin/publish-release.sh X.Y.Z-beta.N --prerelease)

REPLACE_ASSETS=0
PRERELEASE=0

if [[ -z "${1:-}" ]]; then
  echo "Usage: bash .bin/publish-release.sh <version> [--prerelease] [--replace-assets]"
  echo "       bash .bin/publish-dev-release.sh <version> [--replace-assets]"
  echo ""
  echo "Examples:"
  echo "  bash .bin/publish-release.sh 0.7.7"
  echo "  bash .bin/publish-dev-release.sh 0.8.0-beta.1"
  exit 1
fi

VERSION=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --replace-assets) REPLACE_ASSETS=1; shift ;;
    --prerelease) PRERELEASE=1; shift ;;
    -*)
      echo "Error: unknown option: $1"
      exit 1
      ;;
    *)
      if [[ -n "$VERSION" ]]; then
        echo "Error: multiple versions supplied"
        exit 1
      fi
      VERSION="${1#v}"
      shift
      ;;
  esac
done

TAG="v${VERSION}"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST="${REPO_ROOT}/dist/v${VERSION}"
ARCHIVE="${DIST}/spinosa-framework-${VERSION}.tar.gz"
INSTALLER="${DIST}/install.sh"
CHECKSUMS="${DIST}/checksums.txt"

STABLE_VERSION_RE='^[0-9]+\.[0-9]+\.[0-9]+$'
PRERELEASE_VERSION_RE='^[0-9]+\.[0-9]+\.[0-9]+-[0-9A-Za-z.]+$'

if [[ "$PRERELEASE" -eq 1 ]]; then
  if [[ ! "$VERSION" =~ $PRERELEASE_VERSION_RE ]]; then
    echo "Error: invalid dev version: ${VERSION:-<empty>} (use X.Y.Z-beta.N)"
    exit 1
  fi
else
  if [[ ! "$VERSION" =~ $STABLE_VERSION_RE ]]; then
    echo "Error: invalid stable version: ${VERSION:-<empty>} (use X.Y.Z, or publish-dev-release.sh for beta)"
    exit 1
  fi
fi

cd "$REPO_ROOT"

if ! command -v gh >/dev/null 2>&1; then
  echo "Error: gh is required to publish releases"
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Error: working tree is not clean. Commit or stash changes before publishing."
  exit 1
fi

CURRENT_BRANCH="$(git branch --show-current)"
CURRENT_SHA="$(git rev-parse HEAD)"

if [[ -z "$CURRENT_BRANCH" ]]; then
  echo "Error: not on a branch (detached HEAD). Switch to a branch before publishing."
  exit 1
fi

PINNED="$(grep -m1 '^PINNED_VERSION=' install.sh | sed 's/^PINNED_VERSION="\(.*\)"/\1/')"
if [[ "$PINNED" != "$VERSION" ]]; then
  echo "Error: install.sh PINNED_VERSION=${PINNED} does not match release version ${VERSION}"
  echo "  Bump PINNED_VERSION before publishing."
  exit 1
fi

CHANNEL_LABEL="stable"
[[ "$PRERELEASE" -eq 1 ]] && CHANNEL_LABEL="dev (prerelease)"

echo "Publishing Spinosa Framework ${TAG} [${CHANNEL_LABEL}]"
echo "  Branch: ${CURRENT_BRANCH}"
echo "  Commit: ${CURRENT_SHA}"
echo ""

bash "${REPO_ROOT}/.bin/package-release.sh" "$VERSION"

for asset in "$ARCHIVE" "$INSTALLER" "$CHECKSUMS"; do
  if [[ ! -f "$asset" ]]; then
    echo "Error: expected release asset missing: $asset"
    exit 1
  fi
done

VENDOR_ASSETS=()
for tarball in "${REPO_ROOT}/.bin/lib/vendor"/spinosa-vendor-*.tar.gz; do
  if [[ -f "$tarball" ]]; then
    cp "$tarball" "${DIST}/$(basename "$tarball")"
    VENDOR_ASSETS+=("${DIST}/$(basename "$tarball")")
  fi
done

BODY="$(mktemp "${TMPDIR:-/tmp}/spinosa-release-notes.XXXXXX")"
trap 'rm -f "$BODY" 2>/dev/null || true' EXIT

if [[ "$PRERELEASE" -eq 1 ]]; then
  cat > "$BODY" << EOF
Spinosa Framework ${TAG} (dev / beta)

**Not stable.** This prerelease does not replace GitHub \`latest\`. Production installs should use the stable channel.

## Install (dev channel — tracks newest beta)

\`\`\`sh
curl -fsSL https://spinosa.dev/install/dev | bash
\`\`\`

## Install (this exact version)

\`\`\`sh
curl -fsSL https://github.com/TommasoPrinetti/spinosa/releases/download/${TAG}/install.sh | bash
\`\`\`

## Upgrade to latest dev

\`\`\`sh
spinosa upgrade --channel dev --yes
\`\`\`

Pinned version: ${VERSION}
EOF
else
  cat > "$BODY" << EOF
Spinosa Framework ${TAG}

## Install (stable — one command)

\`\`\`sh
curl -fsSL https://github.com/TommasoPrinetti/spinosa/releases/download/${TAG}/install.sh | bash
\`\`\`

Or via the website redirect:

\`\`\`sh
curl -fsSL https://spinosa.dev/install | bash
\`\`\`

This installs the pinned stable version (${VERSION}). Zero dependencies.
Python packages (MarkItDown, RapidOCR) and OCR models are installed via pip on first run.

For options, download first:

\`\`\`sh
curl -fsSL https://github.com/TommasoPrinetti/spinosa/releases/download/${TAG}/install.sh -o install-spinosa.sh
bash install-spinosa.sh --version ${VERSION}
\`\`\`

## Upgrade

\`\`\`sh
spinosa upgrade
\`\`\`

## Update policy

- Framework-owned files are updated from this release.
- User workspace state is not replaced.
- Locally modified framework files receive .spinosa-new sidecars unless the manifest marks them always_replace.
EOF
fi

UPLOAD_ASSETS=("$ARCHIVE" "$INSTALLER" "$CHECKSUMS")
[[ ${#VENDOR_ASSETS[@]} -gt 0 ]] && UPLOAD_ASSETS+=("${VENDOR_ASSETS[@]}")

RELEASE_ARGS=(--target "$CURRENT_BRANCH" --title "Spinosa Framework ${TAG}" --notes-file "$BODY")
[[ "$PRERELEASE" -eq 1 ]] && RELEASE_ARGS+=(--prerelease)

if gh release view "$TAG" >/dev/null 2>&1; then
  if [[ "$REPLACE_ASSETS" -ne 1 ]]; then
    echo "Error: release ${TAG} already exists. Re-run with --replace-assets to clobber assets after verifying the tag target."
    exit 1
  fi
  if git rev-parse -q --verify "refs/tags/${TAG}^{commit}" >/dev/null; then
    TAG_SHA="$(git rev-parse "refs/tags/${TAG}^{commit}")"
    if [[ "$TAG_SHA" != "$CURRENT_SHA" ]]; then
      echo "Error: ${TAG} points at ${TAG_SHA}, not current HEAD ${CURRENT_SHA}"
      exit 1
    fi
  fi
  echo "Release ${TAG} already exists; uploading assets with --clobber"
  gh release upload "$TAG" "${UPLOAD_ASSETS[@]}" --clobber
else
  gh release create "$TAG" "${UPLOAD_ASSETS[@]}" "${RELEASE_ARGS[@]}"
fi

echo ""
if [[ "$PRERELEASE" -eq 1 ]]; then
  echo "Published dev prerelease ${TAG}"
  echo "  Install: curl -fsSL https://spinosa.dev/install/dev | bash"
  echo "  Upgrade: spinosa upgrade --channel dev --yes"
else
  echo "Published stable ${TAG}"
  echo "  Install: curl -fsSL https://github.com/TommasoPrinetti/spinosa/releases/latest/download/install.sh | bash"
fi