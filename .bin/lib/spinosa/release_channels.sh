# shellcheck shell=bash
# Release channel resolution — stable vs beta rolling GitHub releases.

SPINOSA_STABLE_INSTALL_URL="${SPINOSA_STABLE_INSTALL_URL:-https://github.com/TommasoPrinetti/spinosa/releases/download/stable/install.sh}"
SPINOSA_BETA_INSTALL_URL="${SPINOSA_BETA_INSTALL_URL:-https://github.com/TommasoPrinetti/spinosa/releases/download/beta/install.sh}"
SPINOSA_DEV_INSTALL_URL="${SPINOSA_DEV_INSTALL_URL:-$SPINOSA_BETA_INSTALL_URL}"
SPINOSA_STABLE_CHANNEL_TAG="${SPINOSA_STABLE_CHANNEL_TAG:-stable}"
SPINOSA_BETA_CHANNEL_TAG="${SPINOSA_BETA_CHANNEL_TAG:-beta}"
SPINOSA_RELEASE_REPO="${SPINOSA_RELEASE_REPO:-TommasoPrinetti/spinosa}"

spinosa_config_file() {
  printf '%s/metadata/config.yaml' "${SPINOSA_HOME:-$HOME/.spinosa}"
}

spinosa_beta_toggle_channel() {
  local value="$1"
  value="${value//\"/}"
  value="${value//\'/}"
  case "$value" in
    true|yes|on|1) printf '%s' "beta" ;;
    false|no|off|0) printf '%s' "stable" ;;
    *) die "Invalid beta config value: ${value} (use true or false)" ;;
  esac
}

spinosa_release_channel() {
  local ch config beta_toggle
  if [[ -n "${SPINOSA_RELEASE_CHANNEL:-}" ]]; then
    ch="$SPINOSA_RELEASE_CHANNEL"
  else
    config="$(spinosa_config_file)"
    beta_toggle="$(awk '$1 == "beta:" { print $2; exit }' "$config" 2>/dev/null || true)"
    if [[ -n "$beta_toggle" ]]; then
      ch="$(spinosa_beta_toggle_channel "$beta_toggle")"
    else
      ch="$(awk '$1 == "release_channel:" { print $2; exit }' "$config" 2>/dev/null || true)"
      ch="${ch:-stable}"
    fi
  fi
  ch="${ch//\"/}"
  ch="${ch//\'/}"
  case "$ch" in
    stable|beta) printf '%s' "$ch" ;;
    dev) printf 'beta' ;;
    *) die "Invalid release channel: ${ch} (use stable or beta)" ;;
  esac
}

set_config_key() {
  local config="$1" key="$2" value="$3"
  if grep -q "^${key}:" "$config" 2>/dev/null; then
    if [[ "$(uname -s)" == "Darwin" ]]; then
      sed -i '' "s/^${key}:.*/${key}: ${value}/" "$config"
    else
      sed -i "s/^${key}:.*/${key}: ${value}/" "$config"
    fi
  else
    printf '\n%s: %s\n' "$key" "$value" >> "$config"
  fi
}

delete_config_key() {
  local config="$1" key="$2"
  [[ -f "$config" ]] || return 0
  if [[ "$(uname -s)" == "Darwin" ]]; then
    sed -i '' "/^${key}:/d" "$config"
  else
    sed -i "/^${key}:/d" "$config"
  fi
}

set_release_channel() {
  local ch="$1"
  local config_dir="${SPINOSA_METADATA_DIR:-${SPINOSA_HOME:-$HOME/.spinosa}/metadata}"
  local config="${config_dir}/config.yaml"
  local beta_toggle
  [[ "$ch" == "dev" ]] && ch="beta"
  case "$ch" in
    beta) beta_toggle=true ;;
    stable) beta_toggle=false ;;
    *) die "Invalid release channel: ${ch} (use stable or beta)" ;;
  esac
  mkdir -p "$config_dir" 2>/dev/null || return 1
  if [[ ! -f "$config" ]]; then
    cat > "$config" << EOF
beta: ${beta_toggle}
EOF
    return 0
  fi
  set_config_key "$config" "beta" "$beta_toggle"
  delete_config_key "$config" "release_channel"
}

resolve_pinned_version_from_installer() {
  local channel="$1" url="$2" hint="$3"
  local resolved installer
  if ! command -v curl >/dev/null 2>&1; then
    die "curl is required to resolve latest ${channel}. Use --version ${hint} instead."
  fi
  installer="$(curl -fsSL --connect-timeout 10 --max-time 20 "$url" 2>/dev/null || true)"
  [[ -n "$installer" ]] || die "Could not fetch ${channel} channel installer (${url}). Publish the rolling ${channel} release first."
  resolved="$(awk -F'"' '/^PINNED_VERSION=/ { print $2; exit }' <<< "$installer" || true)"
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
    stable|beta|dev)
      if [[ -n "$version" && "$version" != "latest" ]]; then
        printf 'https://github.com/%s/releases/download/v%s/install.sh' "$SPINOSA_RELEASE_REPO" "$version"
      else
        if [[ "$channel" == "stable" ]]; then
          printf '%s' "$SPINOSA_STABLE_INSTALL_URL"
        else
          printf '%s' "$SPINOSA_BETA_INSTALL_URL"
        fi
      fi
      ;;
    *) die "Unknown release channel: ${channel}" ;;
  esac
}

is_prerelease_version() {
  local version="$1"
  [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+-[0-9A-Za-z.]+$ ]]
}
