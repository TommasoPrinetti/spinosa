#!/bin/sh
# shellcheck shell=bash
# ── install.sh — Spinosa Framework Installer (auto-re-execs with bash) ──────

PINNED_VERSION="0.9.0-beta.13"
PINNED_TAG="beta"
BUNDLED_BUN_VERSION="1.3.14"

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
  spinner_stop 2>/dev/null || true
  spinosa_log ERROR "aborted line=${line} exit=${exit_code} cmd=${BASH_COMMAND:-}"
  if [ -n "${INSTALL_BACKUP_DIR:-}" ] && [ -d "${INSTALL_BACKUP_DIR}" ]; then
    spinosa_log WARN "restoring previous installation from ${INSTALL_BACKUP_DIR}"
    rm -rf "${SPINOSA_HOME}/versions/${VERSION}" 2>/dev/null || true
    mv "${INSTALL_BACKUP_DIR}" "${SPINOSA_HOME}/versions/${VERSION}" 2>/dev/null || true
  fi
  if [ -n "${INSTALL_STAGE_DIR:-}" ]; then
    rm -rf "${INSTALL_STAGE_DIR}" 2>/dev/null || true
  fi
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
DEV_MODE=0
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
  DIM=$'\033[2m' BOLD=$'\033[1m' RESET=$'\033[0m'
else
  G='' Y='' R='' DIM='' BOLD='' RESET=''
fi

info()  { spinosa_log INFO "$1"; printf '  %s %s\n' "${DIM}→${RESET}" "$1"; }
ok()    { spinosa_log INFO "$1"; printf '  %s %s\n' "${G}✦${RESET}" "$1"; }
warn()  { spinosa_log WARN "$1"; printf '  %s %s\n' "${Y}⚠${RESET}" "$1" >&2; }
note()  { spinosa_log INFO "$1"; printf '  %s↳%s %s\n' "${DIM}" "${RESET}" "$1"; }
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
  [ -t 2 ] || return 0
  printf '  %s' "$msg" >&2
}
spinner_stop() {
  printf '\r\033[2K' >&2
  if [ -n "${1:-}" ]; then
    printf '  %s %s\n' "${G}✦${RESET}" "$1" >&2
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
    --dev)        DEV_MODE=1; shift ;;
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
      echo "  --dev             Install full source tree for local development"
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


download() {
  local url="$1" dest="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fSL --retry 3 --retry-delay 3 --silent --show-error --max-time 600 --connect-timeout 30 "$url" -o "$dest"
  elif command -v wget >/dev/null 2>&1; then
    wget -q --show-progress --timeout=30 --tries=4 "$url" -O "$dest"
  else
    die "Neither curl nor wget found. Please install one."
  fi
}

download_github_release_asset() {
  local repo="$1" tag="$2" asset="$3" dest="$4"
  local api_url="https://api.github.com/repos/${repo}/releases/tags/${tag}"
  local asset_url
  asset_url="$(curl -fsSL --max-time 30 "$api_url" 2>/dev/null | grep -E '"browser_download_url"' | grep "$asset" | head -1 | sed 's/.*"browser_download_url": *"\([^"]*\)".*/\1/')"
  if [ -n "$asset_url" ]; then
    curl -fSL --retry 3 --retry-delay 3 --max-time 600 --connect-timeout 30 "$asset_url" -o "$dest" && return 0
  fi
  return 1
}

bun_asset_name() {
  case "$(uname -s)-$(uname -m)" in
    Darwin-arm64|Darwin-aarch64) printf '%s\n' "bun-darwin-aarch64" ;;
    Darwin-x86_64|Darwin-amd64)  printf '%s\n' "bun-darwin-x64" ;;
    Linux-aarch64|Linux-arm64)   printf '%s\n' "bun-linux-aarch64" ;;
    Linux-x86_64|Linux-amd64)    printf '%s\n' "bun-linux-x64" ;;
    *) return 1 ;;
  esac
}

install_bundled_bun() {
  local tmpdir="$1"
  local asset bun_zip bun_extract bun_src
  if [ "${SKIP_BUNDLED_TOOLS:-0}" -eq 1 ]; then
    command -v bun >/dev/null 2>&1 || die "--no-bundled-tools requires a system Bun installation"
    ok "Using system Bun: $(command -v bun)"
    return 0
  fi
  asset="$(bun_asset_name)" || die "Unsupported platform for bundled Bun: $(uname -s) $(uname -m)"
  bun_zip="${tmpdir}/${asset}.zip"
  bun_extract="${tmpdir}/bun-runtime"

  if [[ -x "${SPINOSA_HOME}/bin/bun" ]] && "${SPINOSA_HOME}/bin/bun" --version 2>/dev/null | grep -qx "$BUNDLED_BUN_VERSION"; then
    ok "Bundled Bun ${BUNDLED_BUN_VERSION} already installed"
    return 0
  fi

  command -v unzip >/dev/null 2>&1 || die "unzip is required to install bundled Bun"
  download "https://github.com/oven-sh/bun/releases/download/bun-v${BUNDLED_BUN_VERSION}/${asset}.zip" "$bun_zip" \
    || die "Failed to download Bun ${BUNDLED_BUN_VERSION}"
  rm -rf "$bun_extract"
  mkdir -p "$bun_extract"
  unzip -q "$bun_zip" -d "$bun_extract" || die "Failed to extract Bun — download may be corrupted. Try again."
  bun_src="$(find "$bun_extract" -type f -name bun -perm -111 | head -1)"
  [[ -n "$bun_src" ]] || die "Downloaded Bun archive did not contain executable bun"
  mkdir -p "${SPINOSA_HOME}/bin"
  cp "$bun_src" "${SPINOSA_HOME}/bin/.bun.tmp"
  chmod +x "${SPINOSA_HOME}/bin/.bun.tmp"
  mv "${SPINOSA_HOME}/bin/.bun.tmp" "${SPINOSA_HOME}/bin/bun"
  ok "Installed bundled Bun ${BUNDLED_BUN_VERSION}"
}

install_bun_dependencies() {
  local fw_root="$1"
  local bun_bin="${SPINOSA_HOME}/bin/bun"
  if [[ ! -x "$bun_bin" ]]; then
    bun_bin="$(command -v bun 2>/dev/null || true)"
  fi
  [[ -n "$bun_bin" && -x "$bun_bin" ]] || die "Bun runtime not found"

  # Allow skipping npm dependency install entirely (CI / air-gapped)
  if [ "${SPINOSA_SKIP_DEPS:-}" = "1" ]; then
    note "SPINOSA_SKIP_DEPS=1 — skipping bun install (deps must be managed externally)"
    return 0
  fi

  # Show a helpful message on first install — bun install downloads hundreds of
  # packages and can take 2-3 minutes on a fresh install.
  if [ ! -d "${fw_root}/node_modules" ]; then
    note "Downloading npm packages — this may take 2-3 minutes on first install"
  fi
  spinner_start "Installing dependencies"
  local bun_out
  bun_out="$(mktemp "${TMPDIR:-/tmp}/spinosa-bun-install.XXXXXX")"
  local bun_ok=0
  for attempt in 1 2; do
    if (cd "$fw_root" && PATH="$(dirname "$bun_bin"):$PATH" "$bun_bin" install > "$bun_out" 2>&1); then
      bun_ok=1
      break
    fi
    if [[ $attempt -eq 1 ]]; then
      spinosa_log WARN "bun install failed (attempt 1/2), retrying..."
      sleep 2
    fi
  done
  if [[ $bun_ok -eq 0 ]]; then
    spinner_stop
    spinosa_log ERROR "bun install failed after 2 attempts. Output:"
    while IFS= read -r line; do spinosa_log ERROR "$line"; done < "$bun_out"
    rm -f "$bun_out"
    die "Dependency install failed. Check ${SPINOSA_HOME}/logs/spinosa.log for details. If the network is unreliable, set SPINOSA_SKIP_DEPS=1 to skip this step and manage dependencies separately."
  fi
  rm -f "$bun_out"
  spinner_stop "Dependencies installed"
  # Ensure all workspace packages are resolvable as @opencode-ai/* symlinks.
  # for packages with complex native dep chains (core, spinosa-core, etc.).
  local nm="${fw_root}/node_modules/@opencode-ai"
  mkdir -p "$nm"
  for pkg_dir in "${fw_root}/packages"/*/ "${fw_root}/packages/sdk/js"; do
    local pkg_json="${pkg_dir}package.json"
    [[ -f "$pkg_json" ]] || continue
    local pkg_name
    pkg_name="$(grep '"name"' "$pkg_json" | head -1 | sed 's/.*"name": *"\(.*\)".*/\1/')"
    [[ -n "$pkg_name" && "$pkg_name" == @opencode-ai/* ]] || continue
    local link="$nm/${pkg_name#@opencode-ai/}"
    [[ -L "$link" ]] || ln -sf "$pkg_dir" "$link" 2>/dev/null || true
  done


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


# SECURITY: Keep archive safety checks centralized here unless a new runtime
# extraction path is introduced; if so, keep both implementations in parity.
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
      _dir="${_dir#"$archive_root"/}"
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
  for name in config.yaml workspace_cache.txt workspaces.txt; do
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
  [ -f "${fw_dir}/workspace-template/.spinosa/workspace-files.tsv" ] || return 1
  [ -f "${fw_dir}/workspace-template/.bin/spinosa" ] || return 1
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




mark_version_install_complete() {
  local version="$1"
  local stamp="${SPINOSA_HOME}/versions/${version}/${SPINOSA_INSTALL_COMPLETE_STAMP}"
  printf '%s %s\n' "$version" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$stamp"
  write_install_metadata
}


# ══════════════════════════════════════════════════════════════════════════════
# VERSION & SECURITY
# ══════════════════════════════════════════════════════════════════════════════

compare_versions() {
  if [ "$1" = "$2" ]; then
    return 0
  fi

  # Strip prerelease and build metadata for base version comparison
  local a_base="$1" b_base="$2"
  a_base="${a_base%%-*}"; a_base="${a_base%%+*}"
  b_base="${b_base%%-*}"; b_base="${b_base%%+*}"

  if [ "$a_base" != "$b_base" ]; then
    local sorted
    sorted="$(printf '%s\n%s\n' "$a_base" "$b_base" | sort -V)"
    [ "$(echo "$sorted" | head -1)" = "$a_base" ] && return 2  # $1 < $2
    return 1  # $1 > $2
  fi

  # Same base version: compare prerelease tags (semver: prerelease < release)
  local apre="" bpre=""
  case "$1" in *-*) apre="${1#*-}"; apre="${apre%%+*}" ;; esac
  case "$2" in *-*) bpre="${2#*-}"; bpre="${bpre%%+*}" ;; esac

  [ -z "$apre" ] && return 1  # release > prerelease
  [ -z "$bpre" ] && return 2  # prerelease < release

  # Both have prerelease tags: sort -V handles numeric tokens correctly
  sorted="$(printf '%s\n%s\n' "$apre" "$bpre" | sort -V)"
  [ "$(echo "$sorted" | head -1)" = "$apre" ] && return 2
  return 1
}

get_installed_version() {
  local entry version latest="" cmp=0
  [ -d "${SPINOSA_HOME}/versions" ] || return 0
  for entry in "${SPINOSA_HOME}/versions"/*; do
    [ -e "$entry" ] || continue
    version="$(basename "$entry")"
    version_install_complete "$version" || continue
    if [ -z "$latest" ]; then
      latest="$version"
    else
      compare_versions "$version" "$latest" || cmp=$?
      [ "$cmp" -eq 1 ] && latest="$version"
    fi
  done
  [ -n "$latest" ] && printf '%s\n' "$latest"
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
    # Explicit versions install from immutable vX.Y.Z source tags; keep the
    # pinned installer tag for channel metadata and release-age checks.
    RELEASE_DOWNLOAD_TAG="$PINNED_TAG"
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
  if ! version_dir_has_framework "$existing_version"; then
    die "Installed Spinosa v${existing_version} is missing workspace-template files"
  fi
  ok "Verification complete"
  return 0
}

handle_dry_run() {
  [ "$DRY_RUN" -eq 1 ] || return 1
  local archive_url="$1"
  local archive_name="$2"
  info "Dry run — would download:"
  info "  ${archive_url}"
  info "Would install to: ${SPINOSA_HOME}/versions/${VERSION}/"
  info "Would create shim: ${SPINOSA_BIN_DIR}/spinosa"
  echo ""
  return 0
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
export SPINOSA_BUN="${SPINOSA_HOME}/bin/bun"
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
  grep -Eq '\framework/spinosa/env\.sh|fish_add_path|SPINOSA_BIN_DIR' "$config_file" 2>/dev/null
}

spinosa_path_source_line() {
  local current_shell="$1"
  case "$current_shell" in
    fish) printf 'fish_add_path %s\n' "$SPINOSA_BIN_DIR" ;;
    *)
      # shellcheck disable=SC2016
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
    # shellcheck disable=SC2016
    printf 'export PATH="%s:$PATH"' "${SPINOSA_BIN_DIR}"
  fi
}

print_path_instructions() {
  local fallback_bin="$SPINOSA_BIN_DIR" env_file="${SPINOSA_ENV_FILE:-${SPINOSA_HOME}/env.sh}"
  local reload_hint
  reload_hint="$(shell_reload_hint "$env_file")"
  # shellcheck disable=SC2016
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
  local ok=true

  # Check bun
  local bun_bin="${SPINOSA_HOME}/bin/bun"
  if [[ -x "$bun_bin" ]]; then
    ok "bun: $("$bun_bin" --version 2>/dev/null || echo ok)"
  else
    warn "bun not found at ${bun_bin}"
    ok=false
  fi

  # Check opencode (TUI packages)
  local fw_root="${SPINOSA_HOME}/versions/${VERSION}"
  if [[ -f "${fw_root}/workspace-template/.bin/spinosa" ]]; then
    ok "spinosa launcher: ${fw_root}/workspace-template/.bin/spinosa"
  else
    warn "spinosa launcher not found"
    ok=false
  fi
  if [[ -d "${fw_root}/packages/opencode" ]]; then
    ok "TUI packages: $(find "${fw_root}/packages/opencode" -maxdepth 1 -type f -name '*.json' -print | head -1)"
  else
    warn "TUI packages (packages/opencode) not found"
    ok=false
  fi

  # Check shim
  if [[ -f "${SPINOSA_BIN_DIR}/spinosa" ]]; then
    ok "shim: ${SPINOSA_BIN_DIR}/spinosa"
  else
    warn "shim not found at ${SPINOSA_BIN_DIR}/spinosa"
    ok=false
  fi

  if $ok; then
    ok "All components verified"
  else
    warn "Some components missing — spinosa may not work until dependencies are installed"
  fi
}
maybe_launch_dashboard() {
  if [[ "$LAUNCH_DASHBOARD" == "1" ]] || { [[ "$LAUNCH_DASHBOARD" == "auto" ]] && [[ -t 0 && -r /dev/tty ]]; }; then
    local spinosa_cmd="${SPINOSA_BIN_DIR}/spinosa"
    [[ -x "$spinosa_cmd" ]] || { warn "Dashboard launch skipped — missing ${spinosa_cmd}"; return 0; }
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
  spinosa_log_init "install.sh" "$0" "$@"
  spinosa_log INFO "version=${VERSION} home=${SPINOSA_HOME} bin=${SPINOSA_BIN_DIR}"

  init_global_metadata

  if [[ "$YES" -eq 0 ]]; then
    print_banner
  fi
  detect_platform
  resolve_version

  if [[ "${DEV_MODE:-0}" -eq 1 ]]; then
    note "Development mode selected (source-tree install)"
  fi

  INSTALL_LOCKDIR="${SPINOSA_HOME}/versions/.install.lock"
  local lockdir="$INSTALL_LOCKDIR"

  # Stale lock check: reclaim if older than 30 min or PID is dead
  if [ -d "$lockdir" ]; then
    local stale=0
    if [[ "$(find "$lockdir" -maxdepth 0 -mmin +30 2>/dev/null)" == "$lockdir" ]]; then
      stale=1
    elif [ -f "$lockdir/pid" ]; then
      local lock_pid
      lock_pid=$(cat "$lockdir/pid") 2>/dev/null || true
      if [ -n "$lock_pid" ] && ! kill -0 "$lock_pid" 2>/dev/null; then
        stale=1
      fi
    fi
    if [ "$stale" -eq 1 ]; then
      rm -rf "$lockdir"
      info "Removed stale lock from previous install attempt"
    fi
  fi
  mkdir -p "$(dirname "$lockdir")"
  mkdir "$lockdir" 2>/dev/null || die "Another Spinosa installer is running. Wait and retry, or remove stale lock: rm -rf '${lockdir}'"
  printf '%s\n' "$$" > "${lockdir}/pid"
  # Early trap: ensure lock cleanup on any exit before full cleanup trap is registered
  trap 'rm -rf "${INSTALL_LOCKDIR:-}"' EXIT
  trap 'rm -rf "${INSTALL_LOCKDIR:-}"; exit 1' INT TERM HUP

  check_release_age "$VERSION" "$MIN_DAYS"

  local archive_url="https://github.com/${REPO}/archive/refs/tags/v${VERSION}.tar.gz"
  local archive_name="spinosa-v${VERSION}.tar.gz"

  info "Version: ${VERSION}"
  info "Install root: ${SPINOSA_HOME}"
  info "Bin directory: ${SPINOSA_BIN_DIR}"
  echo ""

  should_install "$VERSION" || { rm -rf "$lockdir"; return 0; }
  handle_verify_only "$SPINOSA_HOME" && { rm -rf "$lockdir"; return 0; }
  handle_dry_run "$archive_url" "$archive_name" && { rm -rf "$lockdir"; return 0; }

  mkdir -p "${SPINOSA_HOME}/bin"
  mkdir -p "${SPINOSA_BIN_DIR}"
  check_download_disk_space

  local tmpdir
  tmpdir="$(mktemp -d "${TMPDIR:-/tmp}/spinosa-install.XXXXXX")"
  cleanup() {
    spinner_stop
    rm -rf "$tmpdir" "$lockdir" 2>/dev/null || true
    if [ -n "${INSTALL_BACKUP_DIR:-}" ] && [ -d "${INSTALL_BACKUP_DIR}" ] && ! version_install_complete "$VERSION"; then
      rm -rf "${SPINOSA_HOME}/versions/${VERSION}" 2>/dev/null || true
      mv "${INSTALL_BACKUP_DIR}" "${SPINOSA_HOME}/versions/${VERSION}" 2>/dev/null || true
    fi
    if [ -n "${INSTALL_STAGE_DIR:-}" ]; then
      rm -rf "${INSTALL_STAGE_DIR}" 2>/dev/null || true
    fi
  }
  trap cleanup EXIT INT TERM HUP
  # Download GitHub source tarball
  local framework_dest="${tmpdir}/spinosa-${VERSION}.tar.gz"
  spinner_start "Downloading Spinosa v${VERSION}"
  if download "$archive_url" "$framework_dest"; then
    spinner_stop
  else
    spinner_stop
    die "Failed to download Spinosa v${VERSION}"
  fi

  # Extract — GitHub's tarball has a top-level dir (spinosa-<tag>/)
  local extract_tmp="${tmpdir}/framework-extract"
  safe_untar "$framework_dest" "$extract_tmp"
  local top_dir
  top_dir="$(find "$extract_tmp" -mindepth 1 -maxdepth 1 -type d | head -1)"
  [[ -n "$top_dir" ]] || die "Archive has unexpected structure"
  local version_dir="${SPINOSA_HOME}/versions/${VERSION}"
  INSTALL_STAGE_DIR="${SPINOSA_HOME}/versions/.${VERSION}.staging.$$"
  INSTALL_BACKUP_DIR="${SPINOSA_HOME}/versions/.${VERSION}.backup.$$"
  rm -rf "$INSTALL_STAGE_DIR" "$INSTALL_BACKUP_DIR"
  mkdir -p "$INSTALL_STAGE_DIR"
  cp -R "$top_dir"/. "$INSTALL_STAGE_DIR"/
  clean_macos_metadata "$INSTALL_STAGE_DIR"
  local fw_root="$INSTALL_STAGE_DIR"
  install_bundled_bun "$tmpdir"
  install_bun_dependencies "$fw_root"
  local spinosa_bin="${fw_root}/workspace-template/.bin/spinosa"
  [ -f "$spinosa_bin" ] || die "spinosa CLI not found in archive"
  mkdir -p "${fw_root}/metadata"
  printf '%s\n' "$VERSION" > "${fw_root}/metadata/version"

  if [ -d "$version_dir" ]; then
    mv "$version_dir" "$INSTALL_BACKUP_DIR"
  fi
  if ! mv "$INSTALL_STAGE_DIR" "$version_dir"; then
    [ -d "$INSTALL_BACKUP_DIR" ] && mv "$INSTALL_BACKUP_DIR" "$version_dir"
    die "Failed to promote staged Spinosa v${VERSION} installation"
  fi
  INSTALL_STAGE_DIR=""
  fw_root="$version_dir"
  spinosa_bin="${fw_root}/workspace-template/.bin/spinosa"

  cp "$spinosa_bin" "${SPINOSA_HOME}/bin/.spinosa.tmp"
  chmod +x "${SPINOSA_HOME}/bin/.spinosa.tmp"
  mv "${SPINOSA_HOME}/bin/.spinosa.tmp" "${SPINOSA_HOME}/bin/spinosa"
  ok "Installed spinosa CLI"

  # Vendor bundles — no-op (Python vendor removed)

  install_shims

  mark_version_install_complete "$VERSION"
  INSTALL_COMPLETED=1
  rm -rf "$INSTALL_BACKUP_DIR"
  INSTALL_BACKUP_DIR=""

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
