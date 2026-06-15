#!/usr/bin/env bash
set -euo pipefail

# Publish a Spinosa framework release from the current checkout.
# Requires: git, gh, and a clean working tree.

REPLACE_ASSETS=0

if [[ -z "${1:-}" ]]; then
  echo "Usage: bash .bin/publish-release.sh <version> [--replace-assets]"
  echo "Example: bash .bin/publish-release.sh 0.2.0"
  exit 1
fi

VERSION=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --replace-assets) REPLACE_ASSETS=1; shift ;;
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
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST="${REPO_ROOT}/dist/v${VERSION}"
ARCHIVE="${DIST}/spinosa-framework-${VERSION}.tar.gz"
INSTALLER="${DIST}/install.sh"
CHECKSUMS="${DIST}/checksums.txt"

if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: invalid version: ${VERSION:-<empty>} (use X.Y.Z)"
  exit 1
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

echo "Publishing Spinosa Framework ${TAG}"
echo "  Branch: ${CURRENT_BRANCH:-detached}"
echo "  Commit: ${CURRENT_SHA}"
echo ""

bash "${REPO_ROOT}/.bin/package-release.sh" "$VERSION"

for asset in "$ARCHIVE" "$INSTALLER" "$CHECKSUMS"; do
  if [[ ! -f "$asset" ]]; then
    echo "Error: expected release asset missing: $asset"
    exit 1
  fi
done

# Collect vendor tarballs as separate release assets
VENDOR_ASSETS=()
for tarball in "${REPO_ROOT}/.bin/lib/vendor"/spinosa-vendor-*.tar.gz; do
  if [[ -f "$tarball" ]]; then
    cp "$tarball" "${DIST}/$(basename "$tarball")"
    VENDOR_ASSETS+=("${DIST}/$(basename "$tarball")")
  fi
done

BODY="$(mktemp)"
trap 'rm -f "$BODY"' EXIT
cat > "$BODY" << EOF
Spinosa Framework ${TAG}

## Install (one command)

\`\`\`sh
curl -fsSL https://github.com/TommasoPrinetti/spinosa/releases/download/${TAG}/install.sh | bash
\`\`\`

This installs the pinned stable version (${VERSION}). Zero dependencies.
Python packages (MarkItDown, RapidOCR) and OCR models are installed via pip on first run.

For options, download first:

\`\`\`sh
curl -fsSL https://github.com/TommasoPrinetti/spinosa/releases/download/${TAG}/install.sh -o install-spinosa.sh
bash install-spinosa.sh --version ${VERSION}
\`\`\`

## Update existing workspace

\`\`\`sh
spinosa update --version ${VERSION}
\`\`\`

## Update policy

- Framework-owned files are updated from this release.
- User workspace state is not replaced.
- Locally modified framework files receive .spinosa-new sidecars unless the manifest marks them always_replace.
EOF

UPLOAD_ASSETS=("$ARCHIVE" "$INSTALLER" "$CHECKSUMS")
[[ ${#VENDOR_ASSETS[@]} -gt 0 ]] && UPLOAD_ASSETS+=("${VENDOR_ASSETS[@]}")

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
	  gh release create "$TAG" "${UPLOAD_ASSETS[@]}" \
	    --target "$CURRENT_SHA" \
    --title "Spinosa Framework ${TAG}" \
    --notes-file "$BODY"
fi

echo ""
echo "Published ${TAG}"
