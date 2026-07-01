# shellcheck shell=bash
# Release channel resolution — stable vs beta rolling GitHub releases.

SPINOSA_STABLE_INSTALL_URL="${SPINOSA_STABLE_INSTALL_URL:-https://github.com/TommasoPrinetti/spinosa/releases/download/stable/install.sh}"
SPINOSA_BETA_INSTALL_URL="${SPINOSA_BETA_INSTALL_URL:-https://github.com/TommasoPrinetti/spinosa/releases/download/beta/install.sh}"
SPINOSA_DEV_INSTALL_URL="${SPINOSA_DEV_INSTALL_URL:-$SPINOSA_BETA_INSTALL_URL}"
SPINOSA_STABLE_CHANNEL_TAG="${SPINOSA_STABLE_CHANNEL_TAG:-stable}"
SPINOSA_BETA_CHANNEL_TAG="${SPINOSA_BETA_CHANNEL_TAG:-beta}"
SPINOSA_RELEASE_REPO="${SPINOSA_RELEASE_REPO:-TommasoPrinetti/spinosa}"

spinosa_release_channel() {
  local ch="${SPINOSA_RELEASE_CHANNEL:-stable}"
  case "$ch" in
    stable|beta) printf '%s' "$ch" ;;
    dev) printf 'beta' ;;
    *)
      die "Invalid SPINOSA_RELEASE_CHANNEL=${ch} (use stable or beta)"
      ;;
  esac
}

resolve_pinned_version_from_installer() {
  local channel="$1" url="$2" hint="$3"
  local resolved installer
  if ! command -v curl >/dev/null 2>&1; then
    die "curl is required to resolve latest ${channel}. Use --version ${hint} instead."
  fi
  installer="$(curl -fsSL --connect-timeout 10 --max-time 20 "$url" 2>/dev/null || true)"
  [[ -n "$installer" ]] || die "Could not fetch ${channel} channel installer (${url}). Publish the rolling ${channel} release first."
  resolved="$(printf '%s' "$installer" | grep -m1 '^PINNED_VERSION=' | sed 's/^PINNED_VERSION="\(.*\)"/\1/' || true)"
  [[ -n "$resolved" ]] || die "${channel} channel installer missing PINNED_VERSION. Re-publish the rolling ${channel} release."
  printf '%s' "$resolved"
}

resolve_latest_stable_version() {
  resolve_pinned_version_from_installer "stable" "$SPINOSA_STABLE_INSTALL_URL" "X.Y.Z"
}

resolve_latest_beta_version() {
  resolve_pinned_version_from_installer "beta" "$SPINOSA_BETA_INSTALL_URL" "X.Y.Z-beta.N"
}

resolve_latest_dev_version() {
  resolve_latest_beta_version
}

resolve_release_version_for_channel() {
  local channel="${1:-stable}"
  case "$channel" in
    stable) resolve_latest_stable_version ;;
    beta|dev) resolve_latest_beta_version ;;
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
    beta|dev)
      if [[ -n "$version" && "$version" != "latest" ]]; then
        printf 'https://github.com/%s/releases/download/v%s/install.sh' "$SPINOSA_RELEASE_REPO" "$version"
      else
        printf '%s' "$SPINOSA_BETA_INSTALL_URL"
      fi
      ;;
    *) die "Unknown release channel: ${channel}" ;;
  esac
}

is_prerelease_version() {
  local version="$1"
  [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+-[0-9A-Za-z.]+$ ]]
}
