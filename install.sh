#!/bin/sh
# shellcheck shell=bash
# ── install.sh — Spinosa Framework Installer (auto-re-execs with bash) ──────

PINNED_VERSION="0.8.0"
PINNED_TAG="stable"

if [ -z "${BASH_VERSION-}" ]; then
  if command -v bash >/dev/null 2>&1; then
    if [ -n "${0-}" ] && [ -f "${0-}" ]; then
      exec bash "$0" "$@"
    fi
    # Piped to a non-bash shell (e.g. curl ... | sh) but bash is present.
    # The previous 'cat > tmp + exec' approach is unreliable (POSIX sh parser
    # has already consumed part of stdin, leading to truncated/dangling script).
    # Guide user to the supported invocation (docs already recommend | bash).
    echo "" >&2
    echo "  This installer must be run under bash." >&2
    echo "  Please use one of the following:" >&2
    echo "    curl -fsSL https://github.com/TommasoPrinetti/spinosa/releases/download/stable/install.sh | bash" >&2
    echo "    bash <(curl -fsSL https://github.com/TommasoPrinetti/spinosa/releases/download/stable/install.sh)" >&2
    echo "    curl -fsSL ... -o install.sh && bash install.sh" >&2
    echo "" >&2
    exit 1
  fi
  echo "" >&2
  echo "  Spinosa requires bash. Install it first:" >&2
  if command -v apk >/dev/null 2>&1; then
    echo "    apk add bash" >&2
  elif command -v apt-get >/dev/null 2>&1; then
    echo "    sudo apt-get install bash" >&2
  elif command -v brew >/dev/null 2>&1; then
    echo "    brew install bash" >&2
  else
    echo "    Install bash through your system package manager." >&2
  fi
  echo "" >&2
  exit 1
fi

set -euo pipefail

# ══════════════════════════════════════════════════════════════════════════════
# UNIFIED LOGGING (${SPINOSA_HOME}/logs/spinosa.log)
# Self-contained here — install.sh cannot source framework libs before install.
# ══════════════════════════════════════════════════════════════════════════════

spinosa_log_file() {
  if [ -n "${SPINOSA_LOG_FILE:-}" ]; then
    printf '%s\n' "$SPINOSA_LOG_FILE"
    return 0
  fi
  printf '%s/logs/spinosa.log\n' "${SPINOSA_HOME:-$HOME/.spinosa}"
}

spinosa_log_init() {
  local component="${1:-install}"
  shift || true
  local log_file
  log_file="$(spinosa_log_file)"
  mkdir -p "$(dirname "$log_file")" 2>/dev/null || return 0
  {
    printf '\n---\n'
    printf '%s component=%s pid=%s ppid=%s shell=%s cwd=%s' \
      "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      "$component" "$$" "$PPID" "${BASH_VERSION:-sh}" "$PWD"
    if [ $# -gt 0 ]; then
      printf ' argv=%q' "$@"
    fi
    printf '\n'
  } >> "$log_file" 2>/dev/null || true
}

spinosa_log() {
  local level="$1"
  shift || true
  local log_file
  log_file="$(spinosa_log_file)"
  mkdir -p "$(dirname "$log_file")" 2>/dev/null || return 0
  printf '%s level=%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$level" "$*" >> "$log_file" 2>/dev/null || true
}

_spinosa_install_err_trap() {
  local exit_code=$? line=$1
  spinosa_log ERROR "aborted line=${line} exit=${exit_code} cmd=${BASH_COMMAND:-}"
  if [ "${INSTALL_COMPLETED:-0}" -eq 0 ] && [ -n "${VERSION:-}" ]; then
    if [ -d "${SPINOSA_HOME}/versions/${VERSION}" ] && ! version_install_complete "$VERSION"; then
      spinosa_log WARN "ERR trap removing incomplete versions/${VERSION}"
      rm -rf "${SPINOSA_HOME}/versions/${VERSION}" 2>/dev/null || true
      note "Removed incomplete v${VERSION} — re-run install to finish"
    fi
  fi
  printf '\n  %s Install failed at line %s (exit %s). See %s\n\n' \
    "${R:-}✗${RESET:-}" "$line" "$exit_code" "$(spinosa_log_file)" >&2
  exit "$exit_code"
}

trap '_spinosa_install_err_trap $LINENO' ERR

# ══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ══════════════════════════════════════════════════════════════════════════════

VERSION="${VERSION:-$PINNED_VERSION}"
VERSION_EXPLICIT=0
RELEASE_DOWNLOAD_TAG="$PINNED_TAG"
DRY_RUN=0
VERIFY_ONLY=0
SKIP_BUNDLED_TOOLS=0
UPGRADE=0
REINSTALL=0
MIN_DAYS=""
YES=0
LAUNCH_DASHBOARD="auto"
PREFIX_MODE=0
SPINOSA_HOME="${SPINOSA_HOME:-$HOME/.spinosa}"
SPINOSA_METADATA_DIR="${SPINOSA_HOME}/metadata"
SPINOSA_BIN_DIR="${SPINOSA_BIN_DIR:-$HOME/.local/bin}"
NO_MODIFY_PATH=false
REPO="TommasoPrinetti/spinosa"

# ══════════════════════════════════════════════════════════════════════════════
# UI HELPERS
# ══════════════════════════════════════════════════════════════════════════════

if [ -t 2 ] && [ "${NO_COLOR:-}" != "1" ]; then
  G=$'\033[32m' Y=$'\033[33m' R=$'\033[31m'
  DIM=$'\033[2m' BOLD=$'\033[1m' U=$'\033[4m' RESET=$'\033[0m'
else
  G='' Y='' R='' DIM='' BOLD='' U='' RESET=''
fi

info()  { spinosa_log INFO "$1"; printf '  %s %s\n' "${DIM}→${RESET}" "$1"; }
ok()    { spinosa_log INFO "$1"; printf '  %s %s\n' "${G}✦${RESET}" "$1"; }
warn()  { spinosa_log WARN "$1"; printf '  %s %s\n' "${Y}⚠${RESET}" "$1" >&2; }
note()  { spinosa_log INFO "$1"; printf '  %s↳%s %s\n' "${DIM}" "${RESET}" "$1"; }
fail()  { spinosa_log ERROR "$1"; printf '  %s%s✗%s %s%s\n' "${R}${BOLD}" "${U}" "$(printf '\033[24m')" "$1" "${RESET}" >&2; }
die()   { spinosa_log ERROR "$1"; printf '\n  %s %s\n\n' "${R}✗${RESET}" "$1" >&2; exit 1; }
divider() { printf '%s\n' "${DIM}$(printf '%.0s─' {1..78})${RESET}"; }

read_from_tty() {
  if [ -t 0 ]; then
    flush_pending_input
    IFS= read -r "$@"
  elif [ -r /dev/tty ]; then
    flush_pending_input
    IFS= read -r "$@" < /dev/tty
  else
    return 1
  fi
}

flush_pending_input() {
  [ "${SPINOSA_FLUSH_TTY_INPUT:-1}" = "0" ] && return 0
  [ -r /dev/tty ] || return 0
  command -v stty >/dev/null 2>&1 || return 0

  # Non-blocking: only flush if data is actually pending
  read -t 0 < /dev/tty 2>/dev/null || return 0

  local old_stty ch
  old_stty="$(stty -g < /dev/tty 2>/dev/null)" || return 0
  if ! stty -icanon -echo min 0 time 1 < /dev/tty 2>/dev/null; then
    stty "$old_stty" < /dev/tty 2>/dev/null || true
    return 0
  fi

  while IFS= read -r ch < /dev/tty 2>/dev/null; do
    [ -n "$ch" ] || break
  done
  stty "$old_stty" < /dev/tty 2>/dev/null || true
}

read_tty_or_die() {
  if ! read_from_tty "$1"; then
    die "Cannot read from terminal. Use --yes to skip prompts."
  fi
}

spinner_start() {
  local msg="$1"
  SPINNER_PID=""
  [ -t 2 ] || return 0
  (
    local frames=("▁" "▃" "▄" "▅" "▆" "▇" "█" "▇" "▆" "▅" "▄" "▃")
    local i=0
    while true; do
      printf '\r\033[2K  %s%s%s %s' "${G}" "${frames[$((i % 12))]}" "${RESET}" "$msg" >&2
      i=$((i + 1))
      sleep 0.1
    done
  ) &
  SPINNER_PID=$!
}

spinner_stop() {
  [ -n "${SPINNER_PID:-}" ] || return 0
  kill "$SPINNER_PID" 2>/dev/null || true
  wait "$SPINNER_PID" 2>/dev/null || true
  SPINNER_PID=""
  printf '\r\033[2K' >&2
  if [ -n "${1:-}" ]; then
    printf '  %s %s\n' "${G}✦${RESET}" "$1"
  fi
}

# ══════════════════════════════════════════════════════════════════════════════
# FLAG PARSING
# ══════════════════════════════════════════════════════════════════════════════

while [ $# -gt 0 ]; do
  case "$1" in
    --version)
      [ $# -ge 2 ] || die "--version requires a value (use X.Y.Z or 'latest')"
      VERSION="$2"; shift 2
      VERSION_EXPLICIT=1
      if [[ "$VERSION" != "latest" && ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?(\+[a-zA-Z0-9.]+)?$ ]]; then
        die "Invalid version: $VERSION (use X.Y.Z, X.Y.Z-pre, or 'latest')"
      fi
      ;;
    --latest)     VERSION="latest"; VERSION_EXPLICIT=1; shift ;;
    --dry-run)    DRY_RUN=1; shift ;;
    --verify-only) VERIFY_ONLY=1; shift ;;
    --upgrade)    UPGRADE=1; shift ;;
    --reinstall)  REINSTALL=1; shift ;;
    --no-bundled-tools|--no-gum) SKIP_BUNDLED_TOOLS=1; shift ;;
    --no-modify-path) NO_MODIFY_PATH=true; shift ;;
    --launch)     LAUNCH_DASHBOARD=1; shift ;;
    --no-launch)  LAUNCH_DASHBOARD=0; shift ;;
    --min-days)
      [ $# -ge 2 ] || die "--min-days requires a positive integer"
      MIN_DAYS="$2"; shift 2 ;;
    --prefix)
      [ $# -ge 2 ] || die "--prefix requires a directory path"
      SPINOSA_HOME="$2"; SPINOSA_METADATA_DIR="${SPINOSA_HOME}/metadata"; PREFIX_MODE=1; shift 2 ;;
    --bin-dir)
      [ $# -ge 2 ] || die "--bin-dir requires a directory path"
      SPINOSA_BIN_DIR="$2"; shift 2 ;;
    --yes|-y)     YES=1; shift ;;
    --)           shift; break ;;
    --help|-h)
      echo "Usage: bash install-spinosa.sh [options]"
      echo ""
      echo "Install / Upgrade:"
      echo "  --version X.Y.Z   Install specific version (default: $PINNED_VERSION)"
      echo "  --latest          Use latest release instead of pinned version"
      echo "  --upgrade         Upgrade if a newer version is available"
      echo "  --reinstall       Reinstall even if same version"
      echo "  --dry-run         Show what would happen without doing it"
      echo "  --verify-only     Verify installed binaries, do not install"
      echo "  --yes             Skip all confirmation prompts (for automation)"
      echo "  --launch          Launch the dashboard after install"
      echo "  --no-launch       Do not launch the dashboard after install"
      echo ""
      echo "Security:"
      echo "  --min-days N      Reject releases newer than N days old"
      echo ""
      echo "Paths:"
      echo "  --no-bundled-tools Skip bundled document-processing tools"
      echo "  --no-modify-path  Don't modify shell config files (~/.zshrc, etc.)"
      echo "  --prefix PATH     Install root (default: ~/.spinosa)"
      echo "  --bin-dir PATH    Shim directory (default: ~/.local/bin)"
      exit 0
      ;;
    *) die "Unknown option: $1" ;;
  esac
done

# ══════════════════════════════════════════════════════════════════════════════
# UTILITY FUNCTIONS
# ══════════════════════════════════════════════════════════════════════════════

detect_platform() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Darwin)  OS="darwin" ;;
    Linux)   OS="linux" ;;
    *)       die "Unsupported OS: $os (Spinosa supports macOS and Linux)" ;;
  esac

  case "$arch" in
    arm64|aarch64) ARCH="arm64" ;;
    x86_64|amd64)  ARCH="amd64" ;;
    i386|i686)     ARCH="i386" ;;
    *)             die "Unsupported architecture: $arch" ;;
  esac

  PLATFORM="${OS}-${ARCH}"
  info "Platform: ${PLATFORM}"
}

detect_platform_suffix() {
  local os arch
  case "$(uname -s)" in
    Darwin) os="darwin" ;;
    Linux)  os="linux" ;;
    *)      os="" ;;
  esac
  case "$(uname -m)" in
    arm64|aarch64) arch="arm64" ;;
    x86_64|amd64)  arch="amd64" ;;
    i386|i686)     arch="i386" ;;
    *)             arch="" ;;
  esac
  printf '%s-%s' "$os" "$arch"
}

download() {
  local url="$1" dest="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fSL --silent --show-error --max-time 300 --connect-timeout 30 "$url" -o "$dest"
  elif command -v wget >/dev/null 2>&1; then
    wget -q --show-progress --timeout=30 --tries=1 "$url" -O "$dest"
  else
    die "Neither curl nor wget found. Please install one."
  fi
}

available_disk_bytes() {
  local path="${1:-${TMPDIR:-/tmp}}"
  local available_kb
  available_kb="$(df -Pk "$path" 2>/dev/null | awk 'NR==2 { print $4; exit }')"
  [[ "$available_kb" =~ ^[0-9]+$ ]] || return 1
  printf '%s\n' "$((available_kb * 1024))"
}

disk_mb_rounded_down() {
  local bytes="${1:-0}"
  [[ "$bytes" =~ ^[0-9]+$ ]] || bytes=0
  printf '%s\n' "$((bytes / 1024 / 1024))"
}

check_download_disk_space() {
  local required_bytes=$((500 * 1024 * 1024))
  local check_path free_bytes
  for check_path in "${TMPDIR:-/tmp}" "${SPINOSA_HOME}"; do
    mkdir -p "$check_path" 2>/dev/null || true
    free_bytes="$(available_disk_bytes "$check_path" 2>/dev/null || true)"
    [[ "$free_bytes" =~ ^[0-9]+$ ]] || continue
    if (( free_bytes < required_bytes )); then
      die "Need ~500MB free, have $(disk_mb_rounded_down "$free_bytes")MB"
    fi
  done
}

_realpath() {
  local path="$1"
  if [[ -d "$path" ]]; then
    (cd "$path" 2>/dev/null && pwd -P) 2>/dev/null || printf '%s\n' "$path"
  else
    local dir base
    dir="$(dirname "$path")"
    base="$(basename "$path")"
    (cd "$dir" 2>/dev/null && printf '%s/%s\n' "$(pwd -P)" "$base") 2>/dev/null || printf '%s\n' "$path"
  fi
}

safe_untar() {
  local archive="$1" dest="$2"
  shift 2

  [ -d "$dest" ] || mkdir -p "$dest"

  local listing
  listing="$(tar -tzf "$archive" 2>/dev/null)" || die "Cannot read archive: $archive"

  # Reject path traversal entries
  if printf '%s\n' "$listing" | grep -qE '(^|/)\.\.(/|$)'; then
    die "Archive contains path traversal entries — aborting for safety"
  fi

  # Reject absolute paths
  if printf '%s\n' "$listing" | grep -qE '^/'; then
    die "Archive contains absolute paths — aborting for safety"
  fi

  # Reject unsafe symlinks and hard links
  local verbose_listing _entry _file_path _target
  verbose_listing="$(tar -tzvf "$archive" 2>/dev/null)" || die "Cannot inspect archive: $archive"

  # Get archive root prefix (first path component of the first entry)
  local archive_root=""
  while IFS= read -r _entry; do
    # Skip non-entries (blank lines, etc.)
    [[ -z "$_entry" ]] && continue
    # Extract file path: last space-separated token in the tar listing (before " -> " if symlink)
    _file_path="${_entry##* -> }"
    # If no ->, the whole file path is the last token
    echo "$_entry" | grep -q ' -> ' && _file_path="${_entry%% -> *}"
    _file_path="$(echo "$_file_path" | awk '{print $NF}')"
    archive_root="${_file_path%%/*}"
    [[ -n "$archive_root" ]] && break
  done <<< "$verbose_listing"

  while IFS= read -r _entry; do
    # Symlink check (l* entries with -> target)
    if [[ "$_entry" == l* && "$_entry" == *" -> "* ]]; then
      _target="${_entry##* -> }"
      # Absolute symlinks always unsafe
      if [[ "$_target" == /* ]]; then
        die "Archive contains unsafe symlinks — aborting for safety"
      fi
      # Count path components in symlink directory (depth from archive root)
      _file_path="${_entry%% -> *}"
      _file_path="$(echo "$_file_path" | awk '{print $NF}')"
      local _dir="${_file_path%/*}"
      # Strip archive root from dir to get relative depth
      _dir="${_dir#$archive_root/}"
      local _depth=0 _i
      for _i in $(echo "$_dir" | tr '/' ' '); do _depth=$((_depth + 1)); done
      # Count ../ traversals in target
      local _traversals=0
      local _part
      for _part in $(echo "$_target" | tr '/' ' '); do
        [[ "$_part" == ".." ]] && _traversals=$((_traversals + 1))
      done
      # Reject if symlink escapes the archive root
      if (( _traversals > _depth )); then
        die "Archive contains unsafe symlinks — aborting for safety"
      fi
    fi
    # Hard link check (h* entries with "link to" target)
    if [[ "$_entry" == h* && "$_entry" == *" link to "* ]]; then
      _target="${_entry##* link to }"
      if [[ "$_target" == /* ]] || [[ "$_target" =~ (^|/)\.\.(/|$) ]]; then
        die "Archive contains unsafe hard links — aborting for safety"
      fi
    fi
  done <<< "$verbose_listing"

  tar -xzf "$archive" -C "$dest" --no-same-owner "$@"
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    die "No SHA-256 tool (sha256sum or shasum) found. Cannot verify checksums."
  fi
}

verify_checksum() {
  local file="$1" expected="$2"
  local actual
  actual="$(sha256_file "$file")"
  if [ "$actual" = "$expected" ]; then
    return 0
  else
    return 1
  fi
}

verify_asset_checksum() {
  local file="$1" filename="$2" checksums_file="$3" label="$4"
  local expected_hash
  expected_hash="$(awk -v f="$filename" '$2 == f { print $1; exit }' "$checksums_file")"
  [ -n "$expected_hash" ] || die "${filename} not found in checksums file — aborting for safety"
  if verify_checksum "$file" "$expected_hash"; then
    ok "${label} checksum verified"
  else
    die "${label} checksum mismatch — aborting for safety"
  fi
}

clean_macos_metadata() {
  local dir="$1"
  find "$dir" -name ".DS_Store" -delete 2>/dev/null || true
  find "$dir" -name "._*" -delete 2>/dev/null || true
}

init_global_metadata() {
  mkdir -p "$SPINOSA_METADATA_DIR"
  local name legacy current
  for name in config.yaml workspace_cache.txt workspaces.txt version_check_cache; do
    legacy="${SPINOSA_HOME}/${name}"
    current="${SPINOSA_METADATA_DIR}/${name}"
    if [ -f "$legacy" ] && [ ! -f "$current" ]; then
      mv "$legacy" "$current" 2>/dev/null || cp "$legacy" "$current" 2>/dev/null || true
    fi
  done
}

installer_release_channel() {
  case "$PINNED_TAG" in
    stable) printf '%s\n' "stable" ;;
    beta|dev) printf '%s\n' "beta" ;;
    v*)
      if [[ "$PINNED_VERSION" == *-* ]]; then
        printf '%s\n' "beta"
      else
        printf '%s\n' "stable"
      fi
      ;;
    *)
      if [[ "$PINNED_VERSION" == *-* ]]; then
        printf '%s\n' "beta"
      else
        printf '%s\n' "stable"
      fi
      ;;
  esac
}

installer_beta_toggle() {
  case "$(installer_release_channel)" in
    beta) printf '%s\n' "true" ;;
    *) printf '%s\n' "false" ;;
  esac
}

channel_install_url() {
  local channel="$1"
  case "$channel" in
    stable) printf 'https://github.com/%s/releases/download/stable/install.sh\n' "$REPO" ;;
    beta|dev) printf 'https://github.com/%s/releases/download/beta/install.sh\n' "$REPO" ;;
    *) die "Unknown release channel: ${channel}" ;;
  esac
}

resolve_pinned_version_from_installer() {
  local channel="$1" url="$2"
  local installer resolved
  installer="$(curl -fsSL --max-time 30 "$url" 2>/dev/null || true)"
  [ -n "$installer" ] || die "Could not resolve latest ${channel} version. Use --version to specify."
  resolved="$(awk -F'"' '/^PINNED_VERSION=/ { print $2; exit }' <<< "$installer" || true)"
  [ -n "$resolved" ] || die "${channel} channel installer is missing PINNED_VERSION."
  printf '%s\n' "$resolved"
}

config_set_key() {
  local config="$1" key="$2" value="$3"
  if grep -q "^${key}:" "$config" 2>/dev/null; then
    if [ "$(uname -s)" = "Darwin" ]; then
      sed -i '' "s/^${key}:.*/${key}: ${value}/" "$config"
    else
      sed -i "s/^${key}:.*/${key}: ${value}/" "$config"
    fi
  else
    printf '\n%s: %s\n' "$key" "$value" >> "$config"
  fi
}

config_delete_key() {
  local config="$1" key="$2"
  [ -f "$config" ] || return 0
  if [ "$(uname -s)" = "Darwin" ]; then
    sed -i '' "/^${key}:/d" "$config"
  else
    sed -i "/^${key}:/d" "$config"
  fi
}

SPINOSA_INSTALL_COMPLETE_STAMP=".spinosa-install-complete"
INSTALL_COMPLETED=0

write_install_metadata() {
  mkdir -p "$SPINOSA_METADATA_DIR"
  cat > "${SPINOSA_METADATA_DIR}/install.yaml" << EOF
# Install state — machine-generated
install_root: "${SPINOSA_HOME}"
bin_dir: "${SPINOSA_BIN_DIR}"
EOF
  # Write last_installed_version to config.yaml (user-facing settings)
  local config="${SPINOSA_METADATA_DIR}/config.yaml"
  if [ ! -f "$config" ]; then
    cat > "$config" << CONFIG_EOF
beta: $(installer_beta_toggle)
auto_upgrade: true
last_installed_version: "${VERSION}"
CONFIG_EOF
  else
    config_set_key "$config" "beta" "$(installer_beta_toggle)"
    config_delete_key "$config" "release_channel"
    config_set_key "$config" "last_installed_version" "\"${VERSION}\""
  fi
}

read_last_installed_version() {
  local file="${SPINOSA_METADATA_DIR}/config.yaml"
  [ -f "$file" ] || return 1
  awk '$1 == "last_installed_version:" { print $2; exit }' "$file"
}

version_dir_has_framework() {
  local version="$1"
  local fw_dir="${SPINOSA_HOME}/versions/${version}"
  [ -d "$fw_dir" ] || return 1
  find "$fw_dir" -maxdepth 1 -type d -name 'spinosa-framework-*' 2>/dev/null | grep -q .
}

version_install_complete() {
  local version="$1"
  [ -n "$version" ] || return 1
  case "$version" in
    .*|*/*) return 1 ;;
  esac
  version_dir_has_framework "$version" || return 1
  if [ -f "${SPINOSA_HOME}/versions/${version}/${SPINOSA_INSTALL_COMPLETE_STAMP}" ]; then
    return 0
  fi
  local last
  last="$(read_last_installed_version 2>/dev/null || true)"
  [ -n "$last" ] && [ "$last" = "$version" ]
}

list_complete_versions() {
  local entry version
  [ -d "${SPINOSA_HOME}/versions" ] || return 0
  for entry in "${SPINOSA_HOME}/versions"/*; do
    [ -e "$entry" ] || continue
    version="$(basename "$entry")"
    version_install_complete "$version" && printf '%s\n' "$version"
  done | sort -V
}

reclaim_incomplete_version() {
  local version="$1"
  if [ -d "${SPINOSA_HOME}/versions/${version}" ] && ! version_install_complete "$version"; then
    warn "Removing incomplete v${version} from a previous install attempt"
    spinosa_log WARN "reclaim incomplete versions/${version}"
    rm -rf "${SPINOSA_HOME}/versions/${version}"
  fi
}

reclaim_all_incomplete_versions() {
  local entry version
  [ -d "${SPINOSA_HOME}/versions" ] || return 0
  for entry in "${SPINOSA_HOME}/versions"/*; do
    [ -e "$entry" ] || continue
    version="$(basename "$entry")"
    reclaim_incomplete_version "$version"
  done
}

mark_version_install_complete() {
  local version="$1"
  local stamp="${SPINOSA_HOME}/versions/${version}/${SPINOSA_INSTALL_COMPLETE_STAMP}"
  printf '%s %s\n' "$version" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$stamp"
  write_install_metadata
}

install_install_state_lib() {
  local fw_root="$1"
  local src="${fw_root}/.bin/lib/spinosa/install_state.sh"
  local dest="${SPINOSA_HOME}/lib/install_state.sh"
  [ -f "$src" ] || return 0
  mkdir -p "${SPINOSA_HOME}/lib"
  cp "$src" "$dest"
}

# ══════════════════════════════════════════════════════════════════════════════
# VERSION & SECURITY
# ══════════════════════════════════════════════════════════════════════════════

compare_versions() {
  local original_a="$1" original_b="$2"
  local a="${original_a%%-*}" b="${original_b%%-*}"
  a="${a%%+*}" b="${b%%+*}"
  local IFS=.
  set -f
  # shellcheck disable=SC2086
  set -- $a
  set +f
  local av=("$@")
  set -f
  # shellcheck disable=SC2086
  set -- $b
  set +f
  local bv=("$@")
  local i max
  max=${#av[@]}
  [ "${#bv[@]}" -gt "$max" ] && max="${#bv[@]}"
  for ((i=0; i<max; i++)); do
    local an="${av[$i]:-0}" bn="${bv[$i]:-0}"
    an="${an//[^0-9]/}"; an="${an:-0}"
    bn="${bn//[^0-9]/}"; bn="${bn:-0}"
    if (( an > bn )); then
      return 1
    elif (( an < bn )); then
      return 2
    fi
  done
  local apre="" bpre=""
  if [[ "$original_a" == *-* ]]; then
    apre="${original_a#*-}"
    apre="${apre%%+*}"
  fi
  if [[ "$original_b" == *-* ]]; then
    bpre="${original_b#*-}"
    bpre="${bpre%%+*}"
  fi
  if [ -z "$apre" ] && [ -n "$bpre" ]; then return 1; fi
  if [ -n "$apre" ] && [ -z "$bpre" ]; then return 2; fi
  if [ -n "$apre" ] && [ -n "$bpre" ] && [ "$apre" != "$bpre" ]; then
    set -f
    # shellcheck disable=SC2086
    set -- $apre
    set +f
    local ap=("$@")
    set -f
    # shellcheck disable=SC2086
    set -- $bpre
    set +f
    local bp=("$@")
    max=${#ap[@]}; [ "${#bp[@]}" -gt "$max" ] && max="${#bp[@]}"
    for ((i=0; i<max; i++)); do
      local ai="${ap[$i]:-}" bi="${bp[$i]:-}"
      [ "$ai" = "$bi" ] && continue
      [ -z "$ai" ] && return 2
      [ -z "$bi" ] && return 1
      if [[ "$ai" =~ ^[0-9]+$ && "$bi" =~ ^[0-9]+$ ]]; then
        if [ "$ai" -gt "$bi" ]; then return 1; fi
        if [ "$ai" -lt "$bi" ]; then return 2; fi
      elif [[ "$ai" =~ ^[0-9]+$ ]]; then
        return 2
      elif [[ "$bi" =~ ^[0-9]+$ ]]; then
        return 1
      else
        [ "$ai" '>' "$bi" ] && return 1
        [ "$ai" '<' "$bi" ] && return 2
      fi
    done
  fi
  return 0
}

get_installed_version() {
  list_complete_versions | tail -1
}

resolve_version() {
  if [ "$VERSION" = "latest" ]; then
    local channel url
    channel="$(installer_release_channel)"
    url="$(channel_install_url "$channel")"
    info "Resolving latest ${channel} version..."
    local resolved
    resolved="$(resolve_pinned_version_from_installer "$channel" "$url")"
    VERSION="$resolved"
    RELEASE_DOWNLOAD_TAG="$channel"
    info "Latest ${channel} version: ${VERSION}"
  elif [ "$VERSION_EXPLICIT" -eq 1 ]; then
    RELEASE_DOWNLOAD_TAG="v${VERSION}"
  else
    RELEASE_DOWNLOAD_TAG="$PINNED_TAG"
  fi
}

check_release_age() {
  local version="$1" min_days="$2"
  [ -n "$min_days" ] || return 0
  [ "$min_days" -gt 0 ] 2>/dev/null || die "--min-days must be a positive integer (got: $min_days)"

  local api_url="https://api.github.com/repos/${REPO}/releases/tags/${RELEASE_DOWNLOAD_TAG}"
  local published_at
  published_at="$(curl -fsSL --max-time 30 "$api_url" 2>/dev/null | grep '"published_at":' | head -1 | sed 's/.*"published_at": "\([^"]*\)".*/\1/')" || true

  if [ -z "$published_at" ]; then
    if [ -n "$min_days" ]; then
      die "Could not verify release age. GitHub API may be rate-limited. Retry later, or omit --min-days."
    fi
    warn "Could not verify release age — skipping check"
    return 0
  fi

  local release_ts current_ts
  release_ts=""
  if release_ts="$(date -d "$published_at" +%s 2>/dev/null)"; then
    :
  elif release_ts="$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$published_at" +%s 2>/dev/null)"; then
    :
  else
    die "Could not parse release date '$published_at'. Cannot enforce --min-days."
  fi

  current_ts="$(date +%s)"
  local days_old=$(( (current_ts - release_ts) / 86400 ))

  if [ "$days_old" -lt "$min_days" ]; then
    die "Release v${version} is only ${days_old} day(s) old. Minimum required: ${min_days} day(s). Use --latest to override, or wait."
  fi

  ok "Release age verified: ${days_old} day(s) old (minimum: ${min_days})"
}

# Pinned vendor Python packages — bump vendor_pip_fingerprint() when these change.
VENDOR_PIP_MARKITDOWN='markitdown[all]==0.1.6'
VENDOR_PIP_RAPIDOCR='rapidocr==3.8.1'
VENDOR_PIP_PYPDFIUM2='pypdfium2==5.9.0'
VENDOR_PIP_PYPDF='pypdf==5.1.0'
VENDOR_PIP_ONNX_VERSIONS='1.23.2 1.23.1 1.23.0 1.22.1 1.22.0'

vendor_pip_fingerprint() {
  printf '%s|%s|%s|%s|%s' \
    "$VENDOR_PIP_MARKITDOWN" "$VENDOR_PIP_RAPIDOCR" "$VENDOR_PIP_PYPDFIUM2" \
    "$VENDOR_PIP_PYPDF" "$VENDOR_PIP_ONNX_VERSIONS"
}

vendor_tarball_sha_from_checksums() {
  local checksums_file="$1" suffix="$2"
  awk -v f="spinosa-vendor-${suffix}.tar.gz" '$2 == f { print $1; exit }' "$checksums_file"
}

vendor_python_for_dir() {
  local vendor_dir="$1"
  local python_bin="${vendor_dir}/python/bin/python3"
  if [[ ! -x "$python_bin" ]]; then
    python_bin="${vendor_dir}/Python.framework/Versions/Current/bin/python3"
  fi
  [[ -x "$python_bin" ]] || return 1
  printf '%s' "$python_bin"
}

read_vendor_metadata_field() {
  local field="$1"
  local file="${SPINOSA_METADATA_DIR}/vendor.yaml"
  [[ -f "$file" ]] || return 1
  awk -v k="$field" '$1 == k ":" { sub(/^[^:]*:[[:space:]]*/, ""); print; exit }' "$file"
}

write_vendor_metadata() {
  local suffix="$1" tarball_sha="$2"
  mkdir -p "$SPINOSA_METADATA_DIR"
  cat > "${SPINOSA_METADATA_DIR}/vendor.yaml" << EOF
platform_suffix: ${suffix}
vendor_tarball_sha256: ${tarball_sha}
pip_fingerprint: $(vendor_pip_fingerprint)
updated: $(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF
}

vendor_tool_checks_pass() {
  local vendor_dir="$1" tool
  for tool in markitdown-cli rapidocr-cli; do
    [[ -x "${vendor_dir}/${tool}" ]] || return 1
    case "$tool" in
      markitdown-cli)
        "${vendor_dir}/${tool}" --check-markitdown >/dev/null 2>&1 || return 1
        ;;
      rapidocr-cli)
        "${vendor_dir}/${tool}" --check-rapidocr >/dev/null 2>&1 || return 1
        ;;
    esac
  done
  return 0
}

vendor_packages_healthy() {
  local vendor_dir="$1" python_bin
  python_bin="$(vendor_python_for_dir "$vendor_dir")" || return 1
  "$python_bin" -c 'from rapidocr import RapidOCR; import onnxruntime; import pypdfium2; from markitdown import MarkItDown; import pypdf' >/dev/null 2>&1
}

vendor_installed_pins_match() {
  local vendor_dir="$1" python_bin pkg spec ver installed onnx_ver matched=0
  python_bin="$(vendor_python_for_dir "$vendor_dir")" || return 1

  for spec in "$VENDOR_PIP_MARKITDOWN" "$VENDOR_PIP_RAPIDOCR" "$VENDOR_PIP_PYPDFIUM2" "$VENDOR_PIP_PYPDF"; do
    pkg="${spec%%\[*}"
    pkg="${pkg%%==*}"
    ver="${spec#*==}"
    installed="$("$python_bin" -m pip show "$pkg" 2>/dev/null | awk '/^Version:/{print $2; exit}')"
    [[ "$installed" == "$ver" ]] || return 1
  done

  installed="$("$python_bin" -m pip show onnxruntime 2>/dev/null | awk '/^Version:/{print $2; exit}')"
  [[ -n "$installed" ]] || return 1
  for onnx_ver in $VENDOR_PIP_ONNX_VERSIONS; do
    [[ "$installed" == "$onnx_ver" ]] && matched=1 && break
  done
  [[ "$matched" -eq 1 ]]
}

vendor_binaries_healthy() {
  local framework_root="$1" vendor_dir="${2:-}"
  local checksums_file="${framework_root}/metadata/vendor-checksums.txt"
  [[ -f "$checksums_file" ]] || return 1

  local suffix verified=0 failed=0 line expected_hash bin_name plat_suffix installed_bin
  suffix="$(detect_platform_suffix)"
  if [[ -z "$vendor_dir" ]]; then
    vendor_dir="${SPINOSA_HOME}/vendor/spinosa-${suffix}"
  fi

  while IFS= read -r line; do
    case "$line" in
      ''|\#*) continue ;;
    esac
    expected_hash="$(printf '%s' "$line" | awk '{print $1}')"
    bin_name="$(printf '%s' "$line" | awk '{print $2}')"
    plat_suffix="$(printf '%s' "$line" | awk '{print $3}')"
    [[ "$plat_suffix" == "$suffix" ]] || continue

    installed_bin="${vendor_dir}/${bin_name}"
    [[ -f "$installed_bin" ]] || installed_bin="${SPINOSA_HOME}/bin/${bin_name}"
    [[ -f "$installed_bin" ]] || return 1

    if verify_checksum "$installed_bin" "$expected_hash"; then
      verified=$((verified + 1))
    else
      failed=$((failed + 1))
    fi
  done < "$checksums_file"

  [[ "$failed" -eq 0 && "$verified" -gt 0 ]]
}

vendor_bundle_can_reuse() {
  local checksums_file="$1" suffix="$2" vendor_dest="$3" framework_root="$4"
  local expected_sha stored_sha stored_suffix stored_pip

  [[ "$REINSTALL" -eq 0 ]] || return 1
  [[ -d "$vendor_dest" ]] || return 1
  [[ -f "$checksums_file" ]] || return 1

  expected_sha="$(vendor_tarball_sha_from_checksums "$checksums_file" "$suffix")"
  [[ -n "$expected_sha" ]] || return 1

  if [[ -f "${SPINOSA_METADATA_DIR}/vendor.yaml" ]]; then
    stored_sha="$(read_vendor_metadata_field vendor_tarball_sha256)" || return 1
    stored_suffix="$(read_vendor_metadata_field platform_suffix)" || return 1
    stored_pip="$(read_vendor_metadata_field pip_fingerprint)" || return 1
    [[ "$stored_sha" == "$expected_sha" ]] || return 1
    [[ "$stored_suffix" == "$suffix" ]] || return 1
    [[ "$stored_pip" == "$(vendor_pip_fingerprint)" ]] || return 1
  else
    vendor_binaries_healthy "$framework_root" "$vendor_dest" || return 1
    vendor_installed_pins_match "$vendor_dest" || return 1
  fi

  vendor_tool_checks_pass "$vendor_dest" || return 1
  vendor_packages_healthy "$vendor_dest" || return 1
  return 0
}

verify_vendor_binaries() {
  local framework_root="$1" vendor_dir="${2:-}"
  local checksums_file="${framework_root}/metadata/vendor-checksums.txt"

  if [ ! -f "$checksums_file" ]; then
    warn "No vendor checksums found in release — skipping binary verification"
    return 0
  fi

  local suffix
  suffix="$(detect_platform_suffix)"
  if [ -z "$vendor_dir" ]; then
    vendor_dir="${SPINOSA_HOME}/vendor/spinosa-${suffix}"
  fi
  info "Verifying vendor binary checksums..."
  local verified=0 failed=0 line expected_hash bin_name plat_suffix installed_bin

  while IFS= read -r line; do
    case "$line" in
      ''|\#*) continue ;;
    esac

    expected_hash="$(printf '%s' "$line" | awk '{print $1}')"
    bin_name="$(printf '%s' "$line" | awk '{print $2}')"
    plat_suffix="$(printf '%s' "$line" | awk '{print $3}')"

    [ "$plat_suffix" = "$suffix" ] || continue

    installed_bin="${vendor_dir}/${bin_name}"
    [ -f "$installed_bin" ] || installed_bin="${SPINOSA_HOME}/bin/${bin_name}"
    [ -f "$installed_bin" ] || continue

    if verify_checksum "$installed_bin" "$expected_hash"; then
      verified=$((verified + 1))
    else
      failed=$((failed + 1))
      warn "Checksum mismatch: ${bin_name} (${plat_suffix})"
    fi
  done < "$checksums_file"

  if [ "$failed" -gt 0 ]; then
    die "${failed} vendor binary checksum(s) failed. Remove ${SPINOSA_HOME} and re-install, or use --no-bundled-tools."
  fi

  if [ "$verified" -gt 0 ]; then
    ok "${verified} vendor binary checksum(s) verified"
  fi
}

smoke_check_vendor_tools() {
  local vendor_dir="$1"
  local failed=0 tool

  for tool in markitdown-cli rapidocr-cli; do
    if [ ! -x "${vendor_dir}/${tool}" ]; then
      warn "${tool} is not executable in vendor bundle"
      failed=$((failed + 1))
      continue
    fi
    case "$tool" in
      markitdown-cli)
        if "${vendor_dir}/${tool}" --check-markitdown >/dev/null 2>&1; then
          ok "${tool} package check passed"
        else
          warn "${tool} package check failed"
          failed=$((failed + 1))
        fi
        ;;
      rapidocr-cli)
        if "${vendor_dir}/${tool}" --check-rapidocr >/dev/null 2>&1; then
          ok "${tool} package check passed"
        else
          warn "${tool} package check failed"
          failed=$((failed + 1))
        fi
        ;;
    esac
  done

  if [ "$failed" -gt 0 ]; then
    warn "Document conversion tools are partially unavailable. Retry with: spinosa upgrade --reinstall"
  fi
  return 0
}

# ══════════════════════════════════════════════════════════════════════════════
# PROMPT & INSTALL FLOW
# ══════════════════════════════════════════════════════════════════════════════

prompt_upgrade() {
  local installed="$1" target="$2"

  local cmp=0
  compare_versions "$target" "$installed" || cmp=$?

  if [ "$cmp" -eq 0 ]; then
    if [ "$REINSTALL" -eq 1 ]; then
      if [ "$YES" -eq 1 ]; then
        info "Reinstalling v${target} (--yes)..."
      else
        info "Reinstalling v${target}..."
      fi
      return 0
    fi
    if [ "$UPGRADE" -eq 1 ]; then
      info "Already on v${target}. No upgrade needed."
      return 1
    fi
    printf '  %sSpinosa v%s is already installed.%s\n' "${Y}" "$installed" "${RESET}"
    if [ "$YES" -eq 1 ]; then
      info "Skipping reinstall prompt (--yes)."
      return 1
    fi
    printf '  %sReinstall?%s [y/N]: ' "${BOLD}" "${RESET}"
    local reply
    read_tty_or_die reply
    case "$reply" in
      y|Y|yes|YES) return 0 ;;
      *) info "Install cancelled." ; return 1 ;;
    esac
  elif [ "$cmp" -eq 1 ]; then
    if [ "$UPGRADE" -eq 1 ]; then
      if [ "$YES" -eq 1 ]; then
        info "Upgrading v${installed} → v${target} (--yes)..."
      else
        info "Upgrading v${installed} → v${target}..."
      fi
      return 0
    fi
    if [ "$REINSTALL" -eq 1 ]; then
      info "Installing v${target} (over v${installed})..."
      return 0
    fi
    printf '  %sSpinosa v%s is installed. v%s is available.%s\n' "${G}" "$installed" "$target" "${RESET}"
    if [ "$YES" -eq 1 ]; then
      info "Auto-upgrading (--yes)."
      return 0
    fi
    printf '  %sUpgrade?%s [Y/n]: ' "${BOLD}" "${RESET}"
    local reply
    read_tty_or_die reply
    reply="${reply:-Y}"
    case "$reply" in
      n|N|no|NO) info "Upgrade cancelled." ; return 1 ;;
      *) return 0 ;;
    esac
  else
    if [ "$UPGRADE" -eq 1 ]; then
      warn "Installed v${installed} is newer than target v${target}. Skipping upgrade."
      return 1
    fi
    if [ "$REINSTALL" -eq 1 ]; then
      if [ "$YES" -eq 1 ]; then
        info "Downgrading v${installed} → v${target} (--yes)..."
      else
        info "Downgrading v${installed} → v${target}..."
      fi
      return 0
    fi
    printf '  %sInstalled v%s is newer than target v%s.%s\n' "${Y}" "$installed" "$target" "${RESET}"
    if [ "$YES" -eq 1 ]; then
      info "Skipping downgrade (--yes)."
      return 1
    fi
    printf '  %sDowngrade?%s [y/N]: ' "${BOLD}" "${RESET}"
    local reply
    read_tty_or_die reply
    case "$reply" in
      y|Y|yes|YES) return 0 ;;
      *) info "Install cancelled." ; return 1 ;;
    esac
  fi
}

confirm_install() {
  local version="$1"
  if [ "$YES" -eq 1 ]; then
    return 0
  fi
  printf '  %sInstall Spinosa v%s?%s [Y/n]: ' "${BOLD}" "$version" "${RESET}"
  local reply
  read_tty_or_die reply
  reply="${reply:-Y}"
  case "$reply" in
    n|N|no|NO) info "Install cancelled." ; return 1 ;;
  esac
  return 0
}

should_install() {
  local version="$1"
  if [ "$DRY_RUN" -eq 0 ] && [ "$VERIFY_ONLY" -eq 0 ]; then
    local installed_version
    installed_version="$(get_installed_version)"
    if [ -n "$installed_version" ]; then
      prompt_upgrade "$installed_version" "$version" || return 1
    else
      confirm_install "$version" || return 1
    fi
  fi
  return 0
}

handle_verify_only() {
  [ "$VERIFY_ONLY" -eq 1 ] || return 1
  local existing_version
  existing_version="$(get_installed_version)"
  if [ -z "$existing_version" ]; then
    die "No Spinosa installation found at ${SPINOSA_HOME}"
  fi
  local fw_dir="${SPINOSA_HOME}/versions/${existing_version}"
  local fw_subdir
  fw_subdir="$(find "$fw_dir" -maxdepth 1 -type d -name 'spinosa-framework-*' 2>/dev/null | head -1)" || true
  if [ -z "$fw_subdir" ]; then
    die "Could not find installed framework"
  fi
  verify_vendor_binaries "$fw_subdir"
  ok "Verification complete"
  return 0
}

handle_dry_run() {
  [ "$DRY_RUN" -eq 1 ] || return 1
  local base_url="$1"
  local archive_name="$2"
  info "Dry run — would download:"
  info "  ${base_url}/${archive_name}"
  info "  ${base_url}/checksums.txt"
  info "Would install to: ${SPINOSA_HOME}/versions/${VERSION}/"
  info "Would create shim: ${SPINOSA_BIN_DIR}/spinosa"
  echo ""
  return 0
}

download_and_verify() {
  local url="$1" dest="$2" label="$3"
  local checksums_file="${4:-}"
  local archive_name="${5:-}"
  local max_retries="${6:-1}"
  local retry_delay="${7:-3}"

  local retries=0 download_ok=false
  while [ "$retries" -lt "$max_retries" ]; do
    if [ "$max_retries" -gt 1 ]; then
      spinner_start "Downloading ${label} (attempt $((retries + 1))/${max_retries})"
    else
      spinner_start "Downloading ${label}"
    fi
    if download "$url" "$dest"; then
      spinner_stop
      download_ok=true
      break
    fi
    spinner_stop
    retries=$((retries + 1))
    if [ "$retries" -lt "$max_retries" ]; then
      warn "Download failed — retrying (${retries}/${max_retries})"
      sleep "$retry_delay"
    fi
  done

  if ! $download_ok; then
    die "Failed to download ${label}"
  fi

  if [ -n "$checksums_file" ] && [ -n "$archive_name" ]; then
    local ck_url="${url%/*}/${checksums_file}"
    local ck_dest
    ck_dest="$(dirname "$dest")/${checksums_file}"
    download "$ck_url" "$ck_dest" || die "Failed to download ${checksums_file} — cannot verify integrity"
    verify_asset_checksum "$dest" "$archive_name" "$ck_dest" "$label"
  fi
}

install_vendor_python_packages() {
  local spinosa_python="$1" vendor_dir="$2"
  local requirements_lock="${vendor_dir}/requirements.txt"
  local pip_ok=0 onnx_ver pip_attempt _pip_start

  if [[ -f "$requirements_lock" ]]; then
    for pip_attempt in 1 2; do
      spinner_stop 2>/dev/null || true
      spinner_start "Installing locked vendor packages (attempt ${pip_attempt}/2)"
      if "$spinosa_python" -m pip install \
        --require-hashes \
        -r "$requirements_lock" \
        --quiet --timeout 120 2>&1; then
        pip_ok=1
        break
      fi
      if [[ "$pip_attempt" -lt 2 ]]; then
        warn "Locked vendor package install attempt ${pip_attempt}/2 failed — retrying"
        sleep 4
      fi
    done
    [[ "$pip_ok" -eq 1 ]]
    return
  fi

  _pip_start=$SECONDS
  for onnx_ver in $VENDOR_PIP_ONNX_VERSIONS; do
    [[ $((SECONDS - _pip_start)) -lt 300 ]] || break
    pip_attempt=0
    while [[ $pip_ok -eq 0 && $pip_attempt -lt 2 ]]; do
      pip_attempt=$((pip_attempt + 1))
      spinner_stop 2>/dev/null || true
      spinner_start "Installing packages (onnxruntime ${onnx_ver}, attempt ${pip_attempt}/2)"
      if "$spinosa_python" -m pip install \
        "$VENDOR_PIP_MARKITDOWN" \
        "$VENDOR_PIP_RAPIDOCR" \
        "onnxruntime==${onnx_ver}" \
        "$VENDOR_PIP_PYPDFIUM2" \
        "$VENDOR_PIP_PYPDF" \
        --quiet --timeout 120 --only-binary onnxruntime 2>&1; then
        pip_ok=1
        break
      else
        if [[ $pip_attempt -lt 2 ]]; then
          warn "onnxruntime ${onnx_ver} attempt ${pip_attempt}/2 failed — retrying"
          sleep 4
        else
          warn "onnxruntime ${onnx_ver} failed — trying older version"
        fi
      fi
    done
    [[ $pip_ok -eq 1 ]] && break
  done
  [[ "$pip_ok" -eq 1 ]]
}

install_vendor_bundles() {
  local base_url="$1" tmpdir="$2" version="$3"
  local suffix
  suffix="$(detect_platform_suffix)"

  local spinosa_vendor_dest="${SPINOSA_HOME}/vendor/spinosa-${suffix}"
  local vendor_url="${base_url}/spinosa-vendor-${suffix}.tar.gz"
  local vendor_tmp="${tmpdir}/spinosa-vendor-${suffix}.tar.gz"
  local checksums_file="${tmpdir}/checksums.txt"
  local fw_root="${SPINOSA_HOME}/versions/${version}/spinosa-framework-${version}"
  local expected_vendor_sha=""

  if [[ ! -f "$checksums_file" ]]; then
    download "${base_url}/checksums.txt" "$checksums_file" || die "Failed to download checksums.txt — cannot verify vendor bundle"
  fi

  expected_vendor_sha="$(vendor_tarball_sha_from_checksums "$checksums_file" "$suffix")"

  if vendor_bundle_can_reuse "$checksums_file" "$suffix" "$spinosa_vendor_dest" "$fw_root"; then
    ok "Bundled document tools unchanged — reusing existing install"
    write_vendor_metadata "$suffix" "$expected_vendor_sha"
    smoke_check_vendor_tools "$spinosa_vendor_dest"
    verify_vendor_binaries "$fw_root" "$spinosa_vendor_dest"
    return 0
  fi

  download_and_verify "$vendor_url" "$vendor_tmp" "Spinosa vendor for ${suffix}" \
    "checksums.txt" "spinosa-vendor-${suffix}.tar.gz" 3 3

  spinner_start "Installing Spinosa vendor (Python + wrappers)"
  local vendor_extract_tmp="${tmpdir}/vendor-extract"
  mkdir -p "$vendor_extract_tmp"
  safe_untar "$vendor_tmp" "$vendor_extract_tmp" --strip-components=1
  rm -rf "$spinosa_vendor_dest" 2>/dev/null || true
  mkdir -p "$(dirname "$spinosa_vendor_dest")"
  mv "$vendor_extract_tmp" "$spinosa_vendor_dest"
  clean_macos_metadata "$spinosa_vendor_dest"
  chmod +x "${spinosa_vendor_dest}/rapidocr-cli" 2>/dev/null || true
  chmod +x "${spinosa_vendor_dest}/markitdown-cli" 2>/dev/null || true
  spinner_stop

  info "Installing vendor Python packages..."
  spinosa_log INFO "vendor_dir=${spinosa_vendor_dest}"

  local spinosa_python
  spinosa_python="$(vendor_python_for_dir "$spinosa_vendor_dest" || true)"

  if [[ -n "$spinosa_python" ]]; then
    spinosa_log INFO "vendor_python=${spinosa_python}"
    if install_vendor_python_packages "$spinosa_python" "$spinosa_vendor_dest"; then
      spinner_stop "MarkItDown + RapidOCR + PDF tools installed"
      spinner_start "Verifying RapidOCR import"
      if "$spinosa_python" -c "from rapidocr import RapidOCR" 2>/dev/null; then
        spinner_stop
        ok "RapidOCR import verified"
        spinner_start "Cleaning up unused models"
        "$spinosa_python" -c "
import rapidocr, os
models_dir = os.path.join(os.path.dirname(rapidocr.__file__), 'models')
for f in os.listdir(models_dir):
    if f.startswith('ch_'):
        os.remove(os.path.join(models_dir, f))
for f in ['ppocr_keys_v1.txt', 'ppocrv5_dict.txt']:
    path = os.path.join(models_dir, f)
    if os.path.exists(path): os.remove(path)
" 2>/dev/null || true
        spinner_stop "Models cleaned"

        spinner_start "Downloading OCR models"
        local ocr_log="${SPINOSA_HOME}/logs/ocr-model-download.log"
        mkdir -p "$(dirname "$ocr_log")"
        if "$spinosa_python" -c "
import logging
logging.getLogger('RapidOCR').setLevel(logging.WARNING)
logging.getLogger('onnxruntime').setLevel(logging.WARNING)
from rapidocr import RapidOCR, EngineType, LangDet, LangRec, ModelType, OCRVersion
RapidOCR(params={
    'Det.engine_type': EngineType.ONNXRUNTIME,
    'Det.lang_type': LangDet.EN,
    'Det.model_type': ModelType.MOBILE,
    'Det.ocr_version': OCRVersion.PPOCRV4,
    'Rec.engine_type': EngineType.ONNXRUNTIME,
    'Rec.lang_type': LangRec.EN,
    'Rec.model_type': ModelType.MOBILE,
    'Rec.ocr_version': OCRVersion.PPOCRV4,
})
" >"$ocr_log" 2>&1; then
          spinner_stop "Models ready"
        else
          spinner_stop "Models not downloaded"
          fail "OCR models could not be pre-downloaded — will download on first use"
          note "Check internet access if this persists"
        fi
        ok "Python packages installed"
      else
        spinner_stop
        fail "RapidOCR installed but cannot import — system library missing"
        if [[ "$(uname -s)" == "Linux" ]]; then
          note "On Linux, install: sudo apt-get install libgl1"
        fi
        warn "PDF/image OCR and Office doc conversion will not be available"
      fi
    else
      spinner_stop
      warn "pip install failed — PDF/image OCR and Office doc conversion will not be available"
      rm -f "${spinosa_vendor_dest}/rapidocr-cli" "${spinosa_vendor_dest}/markitdown-cli" 2>/dev/null || true
    fi
  else
    warn "Bundled Python not found — PDF/image OCR and Office doc conversion will not be available"
  fi

  smoke_check_vendor_tools "$spinosa_vendor_dest"
  verify_vendor_binaries "$fw_root" "$spinosa_vendor_dest"
  if [[ -n "$expected_vendor_sha" ]]; then
    write_vendor_metadata "$suffix" "$expected_vendor_sha"
  fi
}

install_shims() {
  if [ "$PREFIX_MODE" -eq 1 ]; then
    info "Custom install root (--prefix) — skipping global shim."
    info "  Run Spinosa from: ${SPINOSA_HOME}/bin/spinosa"
    return 0
  fi
  local shim="${SPINOSA_BIN_DIR}/spinosa"
  cat > "$shim" << SHIM_EOF
#!/bin/sh
target="${SPINOSA_HOME}/bin/spinosa"
if [ ! -f "\$target" ]; then
  echo "spinosa: installation broken — missing \${target}" >&2
  exit 1
fi
exec bash "\$target" "\$@"
SHIM_EOF
  chmod +x "$shim"
  ok "Created wrapper script: ${shim}"

}

SPINOSA_ENV_FILE=""
SPINOSA_PATH_CONFIG_FILE=""

write_spinosa_env_file() {
  SPINOSA_ENV_FILE="${SPINOSA_HOME}/env.sh"
  mkdir -p "$SPINOSA_HOME"
  cat > "$SPINOSA_ENV_FILE" << EOF
# Spinosa CLI environment — managed by install.sh
export SPINOSA_BIN_DIR="${SPINOSA_BIN_DIR}"
export PATH="${SPINOSA_BIN_DIR}:\$PATH"
EOF
}

shell_path_default_config() {
  local current_shell="$1"
  case "$current_shell" in
    fish) printf '%s\n' "$HOME/.config/fish/config.fish" ;;
    zsh)  printf '%s\n' "${ZDOTDIR:-$HOME}/.zshrc" ;;
    bash)
      if [[ "$(uname -s)" == "Darwin" ]]; then
        printf '%s\n' "$HOME/.bash_profile"
      else
        printf '%s\n' "$HOME/.bashrc"
      fi
      ;;
    *) printf '%s\n' "$HOME/.profile" ;;
  esac
}

spinosa_path_block_present() {
  local config_file="$1"
  [[ -f "$config_file" ]] || return 1
  grep -q '# Spinosa' "$config_file" 2>/dev/null || return 1
  grep -Eq '\.spinosa/env\.sh|fish_add_path|SPINOSA_BIN_DIR' "$config_file" 2>/dev/null
}

spinosa_path_source_line() {
  local current_shell="$1"
  case "$current_shell" in
    fish) printf 'fish_add_path %s\n' "$SPINOSA_BIN_DIR" ;;
    *)
      printf '[[ -f "${SPINOSA_HOME:-$HOME/.spinosa}/env.sh" ]] && . "${SPINOSA_HOME:-$HOME/.spinosa}/env.sh"\n'
      ;;
  esac
}

activate_spinosa_path_for_session() {
  if [[ -f "${SPINOSA_HOME}/env.sh" ]]; then
    # shellcheck source=/dev/null
    . "${SPINOSA_HOME}/env.sh"
    ok "Activated Spinosa PATH from ${SPINOSA_HOME}/env.sh"
  else
    export SPINOSA_BIN_DIR="${SPINOSA_BIN_DIR}"
    export PATH="${SPINOSA_BIN_DIR}:$PATH"
    ok "Activated Spinosa PATH for this install session"
  fi
  hash -r 2>/dev/null || true
}

setup_shell_path() {
  [[ "${NO_MODIFY_PATH:-false}" == "true" ]] && return 0

  local current_shell config_file default_config candidate path_line wrote=0
  current_shell="$(basename "${SHELL:-/bin/sh}")"
  path_line="$(spinosa_path_source_line "$current_shell")"
  default_config="$(shell_path_default_config "$current_shell")"
  config_file=""

  case "$current_shell" in
    fish) candidates=("$HOME/.config/fish/config.fish") ;;
    zsh)
      if [[ "$(uname -s)" == "Darwin" ]]; then
        candidates=("${ZDOTDIR:-$HOME}/.zshrc" "${ZDOTDIR:-$HOME}/.zprofile" "${ZDOTDIR:-$HOME}/.zshenv")
      else
        candidates=("${ZDOTDIR:-$HOME}/.zshrc" "${ZDOTDIR:-$HOME}/.zshenv")
      fi
      ;;
    bash)
      if [[ "$(uname -s)" == "Darwin" ]]; then
        candidates=("$HOME/.bash_profile" "$HOME/.bashrc" "$HOME/.profile")
      else
        candidates=("$HOME/.bashrc" "$HOME/.bash_profile" "$HOME/.profile")
      fi
      ;;
    *) candidates=("$HOME/.profile") ;;
  esac

  for candidate in "${candidates[@]}"; do
    if spinosa_path_block_present "$candidate"; then
      config_file="$candidate"
      ok "Spinosa PATH already configured in ${candidate}"
      break
    fi
  done

  if [[ -z "$config_file" ]]; then
    for candidate in "${candidates[@]}"; do
      if [[ -f "$candidate" ]]; then
        config_file="$candidate"
        break
      fi
    done
  fi

  if [[ -z "$config_file" ]]; then
    config_file="$default_config"
    mkdir -p "$(dirname "$config_file")"
    : > "$config_file"
    ok "Created shell config: ${config_file}"
  fi

  if [[ -w "$config_file" ]]; then
    if ! spinosa_path_block_present "$config_file"; then
      {
        printf '\n# Spinosa\n'
        printf '%s' "$path_line"
      } >> "$config_file"
      ok "Added ${SPINOSA_BIN_DIR} to ${config_file}"
      wrote=1
    fi
    SPINOSA_PATH_CONFIG_FILE="$config_file"
  else
    warn "Cannot write to ${config_file} — add this manually:"
    note "${path_line}"
  fi

  if [[ "$wrote" -eq 1 && "$current_shell" == "zsh" && "$(uname -s)" == "Darwin" \
        && "$config_file" != "${ZDOTDIR:-$HOME}/.zprofile" \
        && -f "${ZDOTDIR:-$HOME}/.zprofile" ]] \
      && ! spinosa_path_block_present "${ZDOTDIR:-$HOME}/.zprofile"; then
    {
      printf '\n# Spinosa\n'
      printf '%s' "$path_line"
    } >> "${ZDOTDIR:-$HOME}/.zprofile"
    note "Also added PATH to ${ZDOTDIR:-$HOME}/.zprofile (macOS login shells)"
  fi
}

install_stdin_is_piped() {
  [[ ! -t 0 ]]
}

shell_reload_hint() {
  local env_file="${1:-${SPINOSA_ENV_FILE:-${SPINOSA_HOME}/env.sh}}"
  if [[ -n "${SPINOSA_PATH_CONFIG_FILE:-}" ]]; then
    printf 'source %s' "${SPINOSA_PATH_CONFIG_FILE}"
  elif [[ -f "$env_file" ]]; then
    printf 'source %s' "$env_file"
  else
    printf 'export PATH="%s:$PATH"' "${SPINOSA_BIN_DIR}"
  fi
}

print_path_instructions() {
  local fallback_bin="$SPINOSA_BIN_DIR" env_file="${SPINOSA_ENV_FILE:-${SPINOSA_HOME}/env.sh}"
  local reload_hint
  reload_hint="$(shell_reload_hint "$env_file")"
  [[ "$fallback_bin" == "$HOME/.local/bin" ]] && fallback_bin='$HOME/.local/bin'

  info "Run Spinosa with: spinosa"

  if "${SPINOSA_BIN_DIR}/spinosa" help >/dev/null 2>&1; then
    ok "Command 'spinosa' is ready in this install session"
  elif command -v spinosa >/dev/null 2>&1; then
    warn "Command 'spinosa' is on PATH but not runnable — run: ${reload_hint}"
  else
    warn "Command 'spinosa' is still not on PATH in this session"
    note "Run: ${reload_hint}"
  fi

  if install_stdin_is_piped; then
    note "Pipe install (curl|bash) — your interactive shell still needs PATH"
    note "In your terminal, run: ${reload_hint}"
    note "Or open a new terminal window"
  elif [[ -n "${SPINOSA_PATH_CONFIG_FILE:-}" || -f "$env_file" ]]; then
    note "In new terminals: ${reload_hint}"
  else
    note "If needed: export PATH=\"${fallback_bin}:\$PATH\""
  fi
}

print_banner() {
  printf '\n\n\n'
  printf '  %s\n' "${G}███████╗██████╗ ██╗███╗   ██╗ ██████╗ ███████╗ █████╗ ${RESET}"
  printf '  %s\n' "${G}██╔════╝██╔══██╗██║████╗  ██║██╔═══██╗██╔════╝██╔══██╗${RESET}"
  printf '  %s\n' "${G}███████╗██████╔╝██║██╔██╗ ██║██║   ██║███████╗███████║${RESET}"
  printf '  %s\n' "${G}╚════██║██╔═══╝ ██║██║╚██╗██║██║   ██║╚════██║██╔══██║${RESET}"
  printf '  %s\n' "${G}███████║██║     ██║██║ ╚████║╚██████╔╝███████║██║  ██║${RESET}"
  printf '  %s\n' "${G}╚══════╝╚═╝     ╚═╝╚═╝  ╚═══╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝${RESET}"
  printf '  %s%sFramework Installer%s\n\n' "${BOLD}" "${G}" "${RESET}"
}

run_basic_test() {
  info "Running basic test..."
  local test_err
  test_err="$("${SPINOSA_BIN_DIR}/spinosa" help 2>&1 >/dev/null)" || true
  if ! "${SPINOSA_BIN_DIR}/spinosa" help >/dev/null 2>&1; then
    spinosa_log WARN "basic test stderr: ${test_err:-<empty>}"
    warn "Basic test failed — shim at ${SPINOSA_BIN_DIR}/spinosa is not runnable."
    return 1
  fi
  if command -v spinosa >/dev/null 2>&1; then
    ok "Basic test passed (spinosa on PATH)"
  else
    ok "Basic test passed (shim works; reload shell for PATH)"
  fi
}

maybe_launch_dashboard() {
  local spinosa_cmd="${SPINOSA_BIN_DIR}/spinosa"
  if command -v spinosa >/dev/null 2>&1; then
    spinosa_cmd="spinosa"
  fi

  if [[ "$LAUNCH_DASHBOARD" == "1" ]] || { [[ "$LAUNCH_DASHBOARD" == "auto" ]] && [[ -t 0 && -r /dev/tty ]]; }; then
    info "Launching Spinosa dashboard..."
    flush_pending_input
    sleep 1
    SPINOSA_NO_UPGRADE_CHECK=1 exec "$spinosa_cmd" </dev/tty || warn "Dashboard launch skipped — run 'spinosa' to start it manually"
  fi
}

# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

main() {
  local lockdir="${SPINOSA_HOME}/versions/.lock.${$}-${VERSION}"

  spinosa_log_init "install.sh" "$0" "$@"
  spinosa_log INFO "version=${VERSION} home=${SPINOSA_HOME} bin=${SPINOSA_BIN_DIR}"

  init_global_metadata

  # Stale lock check: if lock dir is older than 30 min, reclaim it
  if [ -d "$lockdir" ]; then
    if [[ "$(find "$lockdir" -maxdepth 0 -mmin +30 2>/dev/null)" == "$lockdir" ]]; then
      rm -rf "$lockdir"
      info "Removed stale lock from previous install attempt"
    else
      die "Another installer is running for version ${VERSION}. Wait and retry, or remove: rm -rf '${lockdir}'"
    fi
  fi
  mkdir -p "$(dirname "$lockdir")" && mkdir "$lockdir"

  if [[ "$YES" -eq 0 ]]; then
    print_banner
  fi
  detect_platform
  resolve_version
  check_release_age "$VERSION" "$MIN_DAYS"

  local base_url="https://github.com/${REPO}/releases/download/${RELEASE_DOWNLOAD_TAG}"
  local archive_name="spinosa-framework-${VERSION}.tar.gz"

  info "Version: ${VERSION}"
  info "Install root: ${SPINOSA_HOME}"
  info "Bin directory: ${SPINOSA_BIN_DIR}"
  echo ""

  should_install "$VERSION" || { rm -rf "$lockdir"; return 0; }
  handle_verify_only "$SPINOSA_HOME" && { rm -rf "$lockdir"; return 0; }
  handle_dry_run "$base_url" "$archive_name" && { rm -rf "$lockdir"; return 0; }

  mkdir -p "${SPINOSA_HOME}/bin"
  mkdir -p "${SPINOSA_BIN_DIR}"
  check_download_disk_space

  local tmpdir
  tmpdir="$(mktemp -d "${TMPDIR:-/tmp}/spinosa-install.XXXXXX")"
  cleanup() {
    spinner_stop
    rm -rf "$tmpdir" "$lockdir" 2>/dev/null || true
  }
  trap cleanup EXIT INT TERM HUP

  printf '\n' >&2

  reclaim_all_incomplete_versions
  INSTALL_COMPLETED=0

  # Download framework archive + checksums
  local framework_dest="${tmpdir}/${archive_name}"
  download_and_verify \
    "${base_url}/${archive_name}" "$framework_dest" \
    "Framework v${VERSION}" \
    "checksums.txt" "$archive_name" 3 3

  # Extract to temp then move atomically (creates version dir only
  # after verified content is ready — prevents marking partial installs)
  local extract_tmp="${tmpdir}/framework-extract"
  mkdir -p "$extract_tmp"
  safe_untar "$framework_dest" "$extract_tmp"
  rm -rf "${SPINOSA_HOME}/versions/${VERSION}" 2>/dev/null || true
  mkdir -p "${SPINOSA_HOME}/versions/${VERSION}"
  mv "$extract_tmp"/* "${SPINOSA_HOME}/versions/${VERSION}/"
  clean_macos_metadata "${SPINOSA_HOME}/versions/${VERSION}"

  # Install CLI binary (atomic write: temp + mv to avoid partial reads)
  local spinosa_bin="${SPINOSA_HOME}/versions/${VERSION}/spinosa-framework-${VERSION}/.bin/spinosa"
  if [ -f "$spinosa_bin" ]; then
    cp "$spinosa_bin" "${SPINOSA_HOME}/bin/.spinosa.tmp"
    chmod +x "${SPINOSA_HOME}/bin/.spinosa.tmp"
    mv "${SPINOSA_HOME}/bin/.spinosa.tmp" "${SPINOSA_HOME}/bin/spinosa"
    ok "Installed spinosa CLI"
  else
    die "spinosa CLI not found in archive"
  fi

  # Vendor bundles
  if [ "$SKIP_BUNDLED_TOOLS" -eq 0 ]; then
    install_vendor_bundles "$base_url" "$tmpdir" "$VERSION"
  fi

  install_shims

  local fw_root="${SPINOSA_HOME}/versions/${VERSION}/spinosa-framework-${VERSION}"
  mark_version_install_complete "$VERSION"
  install_install_state_lib "$fw_root"
  INSTALL_COMPLETED=1

  cleanup
  trap - EXIT INT TERM HUP

  echo ""
  write_spinosa_env_file
  if [ "$PREFIX_MODE" -eq 0 ]; then
    setup_shell_path
    activate_spinosa_path_for_session
    run_basic_test || true
  fi

  echo ""
  divider
  printf '\n  %s%sSpinosa installed successfully!%s\n\n' "${BOLD}" "${G}" "${RESET}"

  spinosa_log INFO "install complete version=${VERSION} home=${SPINOSA_HOME}"
  note "Install log: $(spinosa_log_file)"
  if [ "$PREFIX_MODE" -eq 1 ]; then
    info "Run Spinosa from: ${SPINOSA_HOME}/bin/spinosa"
  else
    print_path_instructions
  fi
  echo ""
  maybe_launch_dashboard
  return 0
}

main "$@"
