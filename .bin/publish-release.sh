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
# Beta:   bash .bin/publish-dev-release.sh X.Y.Z-beta.N
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

sha256_artifact() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    echo "Error: no SHA-256 tool found" >&2
    return 1
  fi
}

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

if [[ "$PRERELEASE" -eq 1 ]]; then
  if [[ "$CURRENT_BRANCH" != "beta" ]]; then
    echo "Error: beta/prerelease releases must be published from the 'beta' branch (current: ${CURRENT_BRANCH})"
    echo "  Run: git checkout beta && git merge ${CURRENT_BRANCH}"
    exit 1
  fi
else
  if [[ "$CURRENT_BRANCH" != "stable" ]]; then
    echo "Error: stable releases must be published from the 'stable' branch (current: ${CURRENT_BRANCH})"
    echo "  Run: git checkout stable && git merge ${CURRENT_BRANCH}"
    exit 1
  fi
fi

PINNED="$(grep -m1 '^PINNED_VERSION=' install.sh | sed 's/^PINNED_VERSION="\(.*\)"/\1/')"
if [[ "$PINNED" != "$VERSION" ]]; then
  echo "Error: install.sh PINNED_VERSION=${PINNED} does not match release version ${VERSION}"
  echo "  Bump PINNED_VERSION before publishing."
  exit 1
fi
PINNED_RELEASE_TAG="$(grep -m1 '^PINNED_TAG=' install.sh | sed 's/^PINNED_TAG="\(.*\)"/\1/')"
EXPECTED_PINNED_TAG="stable"
[[ "$PRERELEASE" -eq 1 ]] && EXPECTED_PINNED_TAG="beta"
if [[ "$PINNED_RELEASE_TAG" != "$EXPECTED_PINNED_TAG" ]]; then
  echo "Error: install.sh PINNED_TAG=${PINNED_RELEASE_TAG} does not match ${EXPECTED_PINNED_TAG} channel publishing"
  echo "  Set PINNED_TAG=\"${EXPECTED_PINNED_TAG}\" before publishing this channel."
  exit 1
fi

CHANNEL_LABEL="stable"
[[ "$PRERELEASE" -eq 1 ]] && CHANNEL_LABEL="beta (prerelease)"

echo "Publishing Spinosa Framework ${TAG} [${CHANNEL_LABEL}]"
echo "  Branch: ${CURRENT_BRANCH}"
echo "  Commit: ${CURRENT_SHA}"
echo ""

git push origin "HEAD:refs/heads/${CURRENT_BRANCH}" >/dev/null 2>&1 || git push origin "HEAD:refs/heads/${CURRENT_BRANCH}"

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
CHANNEL_TMPDIRS=()
cleanup_publish_tmp() {
  rm -f "$BODY" 2>/dev/null || true
  local d
  if [[ ${#CHANNEL_TMPDIRS[@]} -gt 0 ]]; then
    for d in "${CHANNEL_TMPDIRS[@]}"; do
      rm -rf "$d" 2>/dev/null || true
    done
  fi
}
trap cleanup_publish_tmp EXIT

if [[ "$PRERELEASE" -eq 1 ]]; then
  cat > "$BODY" << EOF
Spinosa Framework ${TAG} (beta)

**Not stable.** This prerelease refreshes only the rolling beta channel. Production installs should use the stable channel.

## Install (beta channel — tracks newest beta)

\`\`\`sh
curl -fsSL https://github.com/TommasoPrinetti/spinosa/releases/download/beta/install.sh | bash
\`\`\`

## Install (this exact version)

\`\`\`sh
curl -fsSL https://github.com/TommasoPrinetti/spinosa/releases/download/${TAG}/install.sh | bash
\`\`\`

## Upgrade to latest beta

\`\`\`sh
spinosa upgrade --channel beta --yes
\`\`\`

Pinned version: ${VERSION}
EOF
else
  cat > "$BODY" << EOF
Spinosa Framework ${TAG}

## Install (stable — one command)

\`\`\`sh
curl -fsSL https://github.com/TommasoPrinetti/spinosa/releases/download/stable/install.sh | bash
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
      echo "Updating ${TAG} from ${TAG_SHA} to current HEAD ${CURRENT_SHA}"
    fi
  fi
  git tag -f "$TAG" "$CURRENT_SHA"
  git push origin "refs/tags/${TAG}:refs/tags/${TAG}" --force
  echo "Release ${TAG} already exists; uploading assets with --clobber"
  gh release upload "$TAG" "${UPLOAD_ASSETS[@]}" --clobber
else
  gh release create "$TAG" "${UPLOAD_ASSETS[@]}" "${RELEASE_ARGS[@]}"
fi

sync_channel_release() {
  local channel_tag="$1" version="$2" title="$3" prerelease="$4"
  local channel_body channel_dist channel_install channel_checksums
  channel_body="$(mktemp "${TMPDIR:-/tmp}/spinosa-${channel_tag}-channel-notes.XXXXXX")"
  channel_dist="$(mktemp -d "${TMPDIR:-/tmp}/spinosa-${channel_tag}-assets.XXXXXX")"
  CHANNEL_TMPDIRS+=("$channel_dist")
  channel_install="${channel_dist}/install.sh"
  channel_checksums="${channel_dist}/checksums.txt"
  cat > "$channel_body" << EOF
Rolling ${channel_tag} channel — currently points at **v${version}**.

\`\`\`sh
curl -fsSL https://github.com/TommasoPrinetti/spinosa/releases/download/${channel_tag}/install.sh | bash
\`\`\`

Updated automatically by \`publish-release.sh\`.
EOF

  cp "$INSTALLER" "$channel_install"
  if [[ "$(uname -s)" == "Darwin" ]]; then
    sed -i '' "s/^PINNED_TAG=.*/PINNED_TAG=\"${channel_tag}\"/" "$channel_install"
  else
    sed -i "s/^PINNED_TAG=.*/PINNED_TAG=\"${channel_tag}\"/" "$channel_install"
  fi
  if ! grep -q "^PINNED_TAG=\"${channel_tag}\"" "$channel_install"; then
    echo "Error: could not prepare ${channel_tag} channel installer"
    exit 1
  fi

  : > "$channel_checksums"
  printf '%s  %s\n' "$(sha256_artifact "$ARCHIVE")" "$(basename "$ARCHIVE")" >> "$channel_checksums"
  printf '%s  %s\n' "$(sha256_artifact "$channel_install")" "install.sh" >> "$channel_checksums"
  local vendor_asset
  if [[ ${#VENDOR_ASSETS[@]} -gt 0 ]]; then
    for vendor_asset in "${VENDOR_ASSETS[@]}"; do
      printf '%s  %s\n' "$(sha256_artifact "$vendor_asset")" "$(basename "$vendor_asset")" >> "$channel_checksums"
    done
  fi

  local channel_upload_assets=("$ARCHIVE" "$channel_install" "$channel_checksums")
  [[ ${#VENDOR_ASSETS[@]} -gt 0 ]] && channel_upload_assets+=("${VENDOR_ASSETS[@]}")

  echo ""
  echo "Syncing rolling ${channel_tag} channel release (${channel_tag}) → v${version}"

  git push origin "HEAD:refs/heads/${CURRENT_BRANCH}" >/dev/null 2>&1 || git push origin "HEAD:refs/heads/${CURRENT_BRANCH}"

  if gh release view "$channel_tag" >/dev/null 2>&1; then
    git tag -f "$channel_tag" "$CURRENT_SHA"
    git push origin "refs/tags/${channel_tag}:refs/tags/${channel_tag}" --force
    gh release upload "$channel_tag" "${channel_upload_assets[@]}" --clobber
    if [[ "$prerelease" == "1" ]]; then
      gh release edit "$channel_tag" --title "$title" --prerelease --notes-file "$channel_body"
    else
      gh release edit "$channel_tag" --title "$title" --notes-file "$channel_body"
    fi
  else
    local release_args=(--target "$CURRENT_BRANCH" --title "$title" --notes-file "$channel_body" --latest=false)
    [[ "$prerelease" == "1" ]] && release_args+=(--prerelease)
    gh release create "$channel_tag" "${channel_upload_assets[@]}" "${release_args[@]}"
    git fetch origin "refs/tags/${channel_tag}:refs/tags/${channel_tag}" >/dev/null 2>&1 || true
    if ! git rev-parse -q --verify "refs/tags/${channel_tag}^{commit}" >/dev/null 2>&1 \
      || [[ "$(git rev-parse "refs/tags/${channel_tag}^{commit}")" != "$CURRENT_SHA" ]]; then
      git tag -f "$channel_tag" "$CURRENT_SHA"
      git push origin "refs/tags/${channel_tag}:refs/tags/${channel_tag}" --force
    fi
  fi
  rm -f "$channel_body"
}

if [[ "$PRERELEASE" -eq 1 ]]; then
  sync_channel_release "beta" "$VERSION" "Spinosa beta channel (rolling)" 1
else
  sync_channel_release "stable" "$VERSION" "Spinosa stable channel (rolling)" 0
fi

echo ""
if [[ "$PRERELEASE" -eq 1 ]]; then
  echo "Published beta prerelease ${TAG}"
  echo "  Install: curl -fsSL https://github.com/TommasoPrinetti/spinosa/releases/download/beta/install.sh | bash"
  echo "  Upgrade: spinosa upgrade --channel beta --yes"
else
  echo "Published stable ${TAG}"
  echo "  Install: curl -fsSL https://github.com/TommasoPrinetti/spinosa/releases/download/stable/install.sh | bash"
fi
