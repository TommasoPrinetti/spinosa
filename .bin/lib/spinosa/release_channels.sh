# shellcheck shell=bash
# Release channel resolution — stable (GitHub latest) vs dev (GitHub prereleases).

SPINOSA_STABLE_INSTALL_URL="${SPINOSA_STABLE_INSTALL_URL:-https://github.com/TommasoPrinetti/spinosa/releases/latest/download/install.sh}"
SPINOSA_DEV_INSTALL_URL="${SPINOSA_DEV_INSTALL_URL:-https://github.com/TommasoPrinetti/spinosa/releases/download/dev/install.sh}"
SPINOSA_DEV_CHANNEL_TAG="${SPINOSA_DEV_CHANNEL_TAG:-dev}"
SPINOSA_RELEASE_REPO="${SPINOSA_RELEASE_REPO:-TommasoPrinetti/spinosa}"

spinosa_release_channel() {
  local ch="${SPINOSA_RELEASE_CHANNEL:-stable}"
  case "$ch" in
    stable|dev) printf '%s' "$ch" ;;
    *)
      die "Invalid SPINOSA_RELEASE_CHANNEL=${ch} (use stable or dev)"
      ;;
  esac
}

resolve_latest_stable_version() {
  local url resolved
  if ! command -v curl >/dev/null 2>&1; then
    die "curl is required to resolve latest stable. Use --version X.Y.Z instead."
  fi
  url="$(curl -fsSL -o /dev/null -w '%{url_effective}' \
    "https://github.com/${SPINOSA_RELEASE_REPO}/releases/latest" 2>/dev/null || true)"
  [[ -n "$url" && "$url" != */latest ]] || die "Could not resolve latest stable release."
  resolved="$(basename "$url" | sed 's/^v//')"
  [[ -n "$resolved" ]] || die "Could not parse latest stable version."
  printf '%s' "$resolved"
}

resolve_latest_dev_version() {
  local resolved installer
  if ! command -v curl >/dev/null 2>&1; then
    die "curl is required to resolve latest dev release. Use --version X.Y.Z-beta.N instead."
  fi
  installer="$(curl -fsSL --connect-timeout 10 --max-time 20 \
    "${SPINOSA_DEV_INSTALL_URL}" 2>/dev/null || true)"
  [[ -n "$installer" ]] || die "Could not fetch dev channel installer (${SPINOSA_DEV_INSTALL_URL}). Publish with: bash .bin/publish-dev-release.sh X.Y.Z-beta.N"
  resolved="$(printf '%s' "$installer" | grep -m1 '^PINNED_VERSION=' | sed 's/^PINNED_VERSION="\(.*\)"/\1/' || true)"
  [[ -n "$resolved" ]] || die "Dev channel installer missing PINNED_VERSION. Re-publish with: bash .bin/publish-dev-release.sh X.Y.Z-beta.N"
  printf '%s' "$resolved"
}

resolve_release_version_for_channel() {
  local channel="${1:-stable}"
  case "$channel" in
    stable) resolve_latest_stable_version ;;
    dev) resolve_latest_dev_version ;;
    *) die "Unknown release channel: ${channel}" ;;
  esac
}

install_url_for_channel() {
  local channel="${1:-stable}" version="${2:-}"
  case "$channel" in
    stable)
      if [[ -n "$version" && "$version" != "latest" ]]; then
        printf 'https://github.com/%s/releases/download/v%s/install.sh' "$SPINOSA_RELEASE_REPO" "$version"
      else
        printf '%s' "$SPINOSA_STABLE_INSTALL_URL"
      fi
      ;;
    dev)
      if [[ -n "$version" && "$version" != "latest" ]]; then
        printf 'https://github.com/%s/releases/download/v%s/install.sh' "$SPINOSA_RELEASE_REPO" "$version"
      else
        printf '%s' "$SPINOSA_DEV_INSTALL_URL"
      fi
      ;;
    *) die "Unknown release channel: ${channel}" ;;
  esac
}

is_prerelease_version() {
  local version="$1"
  [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+-[0-9A-Za-z.]+$ ]]
}