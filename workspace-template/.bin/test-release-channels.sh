#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

fail() {
  echo "FAIL $*" >&2
  exit 1
}

assert_eq() {
  local expected="$1" actual="$2" label="$3"
  [[ "$actual" == "$expected" ]] || fail "${label}: expected '${expected}', got '${actual}'"
}

die() { fail "$*"; }
info() { :; }

SPINOSA_RELEASE_REPO="example/spinosa"
SPINOSA_STABLE_INSTALL_URL="https://example.test/stable/install.sh"
SPINOSA_BETA_INSTALL_URL="https://example.test/beta/install.sh"
# shellcheck source=/dev/null
source "${REPO_ROOT}/.bin/lib/spinosa/release_channels.sh"

installer_fragment="$(mktemp "${TMPDIR:-/tmp}/spinosa-installer-channel-fragment.XXXXXX")"
resolve_fragment="$(mktemp "${TMPDIR:-/tmp}/spinosa-installer-resolve-fragment.XXXXXX")"
tmpdir="$(mktemp -d)"
cleanup() { rm -rf "$tmpdir"; rm -f "$installer_fragment" "$resolve_fragment"; }
trap cleanup EXIT

export SPINOSA_HOME="${tmpdir}/spinosa-release-channel-home"
export SPINOSA_METADATA_DIR="${SPINOSA_HOME}/metadata"
unset SPINOSA_RELEASE_CHANNEL
mkdir -p "$SPINOSA_METADATA_DIR"

cat > "${SPINOSA_METADATA_DIR}/config.yaml" << 'EOF'
beta: true
release_channel: stable
EOF
assert_eq "beta" "$(spinosa_release_channel)" "beta true overrides legacy stable"

cat > "${SPINOSA_METADATA_DIR}/config.yaml" << 'EOF'
beta: false
release_channel: beta
EOF
assert_eq "stable" "$(spinosa_release_channel)" "beta false overrides legacy beta"

cat > "${SPINOSA_METADATA_DIR}/config.yaml" << 'EOF'
release_channel: beta
EOF
assert_eq "beta" "$(spinosa_release_channel)" "legacy release_channel beta fallback"

set_release_channel beta
assert_eq "beta: true" "$(grep -m1 '^beta:' "${SPINOSA_METADATA_DIR}/config.yaml")" "set beta toggle true"
assert_eq "" "$(grep -m1 '^release_channel:' "${SPINOSA_METADATA_DIR}/config.yaml" || true)" "set beta removes legacy channel"

set_release_channel stable
assert_eq "beta: false" "$(grep -m1 '^beta:' "${SPINOSA_METADATA_DIR}/config.yaml")" "set beta toggle false"
assert_eq "" "$(grep -m1 '^release_channel:' "${SPINOSA_METADATA_DIR}/config.yaml" || true)" "set stable removes legacy channel"

assert_eq \
  "https://github.com/example/spinosa/releases/download/v0.8.0-beta.5/install.sh" \
  "$(install_url_for_channel beta 0.8.0-beta.5)" \
  "explicit beta installer URL"
assert_eq \
  "https://github.com/example/spinosa/releases/download/v0.8.0/install.sh" \
  "$(install_url_for_channel stable 0.8.0)" \
  "explicit stable installer URL"
assert_eq "$SPINOSA_BETA_INSTALL_URL" "$(install_url_for_channel beta latest)" "rolling beta installer URL"
assert_eq "$SPINOSA_STABLE_INSTALL_URL" "$(install_url_for_channel stable latest)" "rolling stable installer URL"

awk '
  /^installer_release_channel\(\)/ { printing = 1 }
  /^read_last_installed_version\(\)/ { exit }
  printing { print }
' "${REPO_ROOT}/install.sh" > "$installer_fragment"
awk '
  /^resolve_version\(\)/ { printing = 1 }
  /^check_release_age\(\)/ { exit }
  printing { print }
' "${REPO_ROOT}/install.sh" > "$resolve_fragment"

PINNED_VERSION="0.8.0-beta.5"
PINNED_TAG="beta"
VERSION="$PINNED_VERSION"
RELEASE_DOWNLOAD_TAG="$PINNED_TAG"
VERSION_EXPLICIT=0
REPO="example/spinosa"
SPINOSA_HOME="${tmpdir}/spinosa"
SPINOSA_METADATA_DIR="${SPINOSA_HOME}/metadata"
SPINOSA_BIN_DIR="${tmpdir}/bin"
# shellcheck source=/dev/null
source "$installer_fragment"
# shellcheck source=/dev/null
source "$resolve_fragment"

assert_eq "beta" "$(installer_release_channel)" "beta rolling installer channel"
write_install_metadata
assert_eq "beta: true" "$(grep -m1 '^beta:' "${SPINOSA_METADATA_DIR}/config.yaml")" "beta install config toggle"
assert_eq "" "$(grep -m1 '^release_channel:' "${SPINOSA_METADATA_DIR}/config.yaml" || true)" "beta install removes legacy channel"

PINNED_VERSION="0.8.0"
PINNED_TAG="v0.8.0"
VERSION="$PINNED_VERSION"
write_install_metadata
assert_eq "stable" "$(installer_release_channel)" "exact stable installer channel"
assert_eq "beta: false" "$(grep -m1 '^beta:' "${SPINOSA_METADATA_DIR}/config.yaml")" "stable install config toggle"
assert_eq "" "$(grep -m1 '^release_channel:' "${SPINOSA_METADATA_DIR}/config.yaml" || true)" "stable install removes legacy channel"

PINNED_VERSION="0.8.0-beta.5"
PINNED_TAG="v0.8.0-beta.5"
assert_eq "beta" "$(installer_release_channel)" "exact beta installer channel"

curl() {
  [[ "$*" == *"releases/download/beta/install.sh"* ]] || fail "latest beta resolved through wrong URL: $*"
  printf '%s\n' 'PINNED_VERSION="0.8.0-beta.6"'
}

PINNED_VERSION="0.8.0-beta.5"
PINNED_TAG="beta"
VERSION="latest"
VERSION_EXPLICIT=1
RELEASE_DOWNLOAD_TAG="$PINNED_TAG"
resolve_version
assert_eq "0.8.0-beta.6" "$VERSION" "installer --latest beta version"
assert_eq "beta" "$RELEASE_DOWNLOAD_TAG" "installer --latest beta download tag"

VERSION="0.8.0-beta.5"
VERSION_EXPLICIT=1
RELEASE_DOWNLOAD_TAG="$PINNED_TAG"
resolve_version
assert_eq "v0.8.0-beta.5" "$RELEASE_DOWNLOAD_TAG" "installer explicit beta download tag"

printf 'release channel tests passed\n'
