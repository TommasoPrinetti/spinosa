# shellcheck shell=bash
# Release channel resolution — stable (GitHub latest) vs dev (GitHub prereleases).

SPINOSA_STABLE_INSTALL_URL="${SPINOSA_STABLE_INSTALL_URL:-https://github.com/TommasoPrinetti/spinosa/releases/latest/download/install.sh}"
SPINOSA_DEV_INSTALL_URL="${SPINOSA_DEV_INSTALL_URL:-https://spinosa.dev/install/dev}"
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
  local resolved json
  if ! command -v curl >/dev/null 2>&1; then
    die "curl is required to resolve latest dev release. Use --version X.Y.Z-beta.N instead."
  fi
  json="$(curl -fsSL --connect-timeout 10 --max-time 20 \
    "https://api.github.com/repos/${SPINOSA_RELEASE_REPO}/releases?per_page=30" 2>/dev/null || true)"
  [[ -n "$json" ]] || die "Could not fetch dev releases from GitHub."
  if command -v python3 >/dev/null 2>&1; then
    resolved="$(printf '%s' "$json" | python3 -c '
import json, sys
data = json.load(sys.stdin)
for r in data:
    if r.get("prerelease") and not r.get("draft"):
        print(r["tag_name"].lstrip("v"))
        break
' 2>/dev/null || true)"
  else
    resolved="$(printf '%s' "$json" | awk '
      BEGIN { tag="" }
      /"tag_name":/ { gsub(/.*"tag_name": "/, ""); gsub(/".*/, ""); tag=$0 }
      /"prerelease": true/ { if (tag != "") { gsub(/^v/, "", tag); print tag; exit } }
    ')"
  fi
  [[ -n "$resolved" ]] || die "No dev (prerelease) publish found. Publish with: bash .bin/publish-dev-release.sh X.Y.Z-beta.N"
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