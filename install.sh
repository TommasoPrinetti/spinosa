#!/bin/sh
# ── install.sh — Pilosa Framework Installer (auto-re-execs with bash) ──────

if [ -z "${BASH_VERSION-}" ]; then
  if command -v bash >/dev/null 2>&1; then
    if [ -n "${0-}" ] && [ -f "${0-}" ]; then
      exec bash "$0" "$@"
    fi
    # Piped mode — bash is available but we're in sh
    TMP_SCRIPT="$(mktemp /tmp/pilosa-install.XXXXXX)"
    trap 'rm -f "$TMP_SCRIPT"' EXIT
    cat > "$TMP_SCRIPT"
    exec bash "$TMP_SCRIPT" "$@"
  fi
  echo "" >&2
  echo "  Pilosa requires bash. Install it first:" >&2
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

# ── defaults ────────────────────────────────────────────────────────────────
# Pinned stable version. Update this when cutting a new release.
PINNED_VERSION="0.4.6"
VERSION="${VERSION:-$PINNED_VERSION}"
DRY_RUN=0
VERIFY_ONLY=0
NO_GUM=0
UPGRADE=0
REINSTALL=0
MIN_DAYS=""
YES=0
PILOSA_HOME="${PILOSA_HOME:-$HOME/.pilosa}"
PILOSA_BIN_DIR="${PILOSA_BIN_DIR:-$HOME/.local/bin}"
REPO="TommasoPrinetti/pilosa"

# ── colors (only if terminal) ──────────────────────────────────────────────
if [ -t 2 ] && [ "${NO_COLOR:-}" != "1" ]; then
  R='' G='' B='' Y='' C='' DIM='' BOLD='' RESET=''
  R=$'\033[31m' G=$'\033[32m' Y=$'\033[33m'
  C=$'\033[36m' DIM=$'\033[2m' BOLD=$'\033[1m' RESET=$'\033[0m'
else
  R='' G='' B='' Y='' C='' DIM='' BOLD='' RESET=''
fi

info()  { printf '  %s %s\n' "${DIM}→${RESET}" "$1"; }
ok()    { printf '  %s %s\n' "${G}✦${RESET}" "$1"; }
warn()  { printf '  %s %s\n' "${Y}⚠${RESET}" "$1"; }
die()   { printf '\n  %s %s\n\n' "${R}✗${RESET}" "$1" >&2; exit 1; }

# ── read from TTY (works with piped input) ──────────────────────────────────
read_from_tty() {
  if [ -t 0 ]; then
    IFS= read -r "$@"
  elif [ -r /dev/tty ]; then
    IFS= read -r "$@" < /dev/tty
  else
    return 1
  fi
}

spinner_start() {
  local msg="$1"
  SPINNER_PID=""
  [ -t 1 ] || return 0
  (
    local frames=("▁" "▃" "▄" "▅" "▆" "▇" "█" "▇" "▆" "▅" "▄" "▃")
    local i=0
    while true; do
      printf '\r\033[2K  %s%s%s %s' "${C}" "${frames[$((i % 12))]}" "${RESET}" "$msg" >&2
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
}

# ── parse flags ─────────────────────────────────────────────────────────────
while [ $# -gt 0 ]; do
  case "$1" in
    --version)    VERSION="$2"; shift 2 ;;
    --latest)     VERSION="latest"; shift ;;
    --dry-run)    DRY_RUN=1; shift ;;
    --verify-only) VERIFY_ONLY=1; shift ;;
    --upgrade)    UPGRADE=1; shift ;;
    --reinstall)  REINSTALL=1; shift ;;
    --no-gum)     NO_GUM=1; shift ;;
    --no-modify-path) NO_MODIFY_PATH=true; shift ;;
    --min-days)   MIN_DAYS="$2"; shift 2 ;;
    --prefix)     PILOSA_HOME="$2"; shift 2 ;;
    --bin-dir)    PILOSA_BIN_DIR="$2"; shift 2 ;;
    --yes|-y)     YES=1; shift ;;
    --help|-h)
      echo "Usage: bash install-pilosa.sh [options]"
      echo ""
      echo "Install / Upgrade:"
      echo "  --version X.Y.Z   Install specific version (default: $PINNED_VERSION)"
      echo "  --latest          Use latest release instead of pinned version"
      echo "  --upgrade         Upgrade if a newer version is available"
      echo "  --reinstall       Reinstall even if same version"
      echo "  --dry-run         Show what would happen without doing it"
      echo "  --verify-only     Verify installed binaries, do not install"
      echo "  --yes             Skip all confirmation prompts (for automation)"
      echo ""
      echo "Security:"
      echo "  --min-days N      Reject releases newer than N days old"
      echo ""
      echo "Paths:"
      echo "  --no-gum          Skip bundled binary installation (Gum)"
      echo "  --no-modify-path  Don't modify shell config files (~/.zshrc, etc.)"
      echo "  --prefix PATH     Install root (default: ~/.pilosa)"
      echo "  --bin-dir PATH    Shim directory (default: ~/.local/bin)"
      exit 0
      ;;
    *) die "Unknown option: $1" ;;
  esac
done

# ── detect OS and architecture ─────────────────────────────────────────────
detect_platform() {
  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Darwin)  OS="darwin" ;;
    Linux)   OS="linux" ;;
    *)       die "Unsupported OS: $os (Pilosa supports macOS and Linux)" ;;
  esac

  case "$arch" in
    arm64|aarch64) ARCH="arm64" ;;
    x86_64|amd64)  ARCH="amd64" ;;
    *)             die "Unsupported architecture: $arch" ;;
  esac

  PLATFORM="${OS}-${ARCH}"
  info "Platform: ${PLATFORM}"
}

# ── download helper ─────────────────────────────────────────────────────────
download() {
  local url="$1" dest="$2"

  if command -v curl >/dev/null 2>&1; then
    curl -fSL --silent --show-error "$url" -o "$dest"
  elif command -v wget >/dev/null 2>&1; then
    wget -q --show-progress "$url" -O "$dest"
  else
    die "Neither curl nor wget found. Please install one."
  fi
}

# ── safe untar ──────────────────────────────────────────────────────────────
# Extracts a tarball after scanning for path traversal and symlink attacks.
# Usage: safe_untar <archive> <destination> [extra tar args...]
safe_untar() {
  local archive="$1" dest="$2"
  shift 2

  local listing
  listing="$(tar -tzf "$archive" 2>/dev/null)" || die "Cannot read archive: $archive"

  if printf '%s\n' "$listing" | grep -qE '(^|[^a-zA-Z0-9./_-])(\.\./)'; then
    die "Archive contains path traversal entries — aborting for safety"
  fi

  if printf '%s\n' "$listing" | grep -qE ' -> /'; then
    die "Archive contains absolute symlinks — aborting for safety"
  fi

  tar -xzf "$archive" -C "$dest" --no-same-owner "$@"
}

# ── checksum helper ─────────────────────────────────────────────────────────
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
  file="$1"
  expected="$2"

  actual="$(sha256_file "$file")"
  if [ "$actual" = "$expected" ]; then
    return 0
  else
    return 1
  fi
}

# ── release age check ───────────────────────────────────────────────────────
# Rejects releases that are too fresh. Helps avoid zero-day compromised uploads.
check_release_age() {
  local version="$1" min_days="$2"
  [ -n "$min_days" ] || return 0
  [ "$min_days" -gt 0 ] 2>/dev/null || die "--min-days must be a positive integer"

  local api_url="https://api.github.com/repos/${REPO}/releases/tags/v${version}"
  local published_at
  published_at="$(curl -fsSL "$api_url" 2>/dev/null | grep '"published_at":' | head -1 | sed 's/.*"published_at": "\([^"]*\)".*/\1/')"

  if [ -z "$published_at" ]; then
    if [ "$VERSION" = "latest" ] || [ -n "$MIN_DAYS" ]; then
      die "Could not verify release age. GitHub API may be rate-limited. Retry later, or omit --min-days."
    fi
    warn "Could not verify release age — skipping check"
    return 0
  fi

  local release_ts current_ts
  release_ts="$(date -d "$published_at" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%SZ" "$published_at" +%s 2>/dev/null)"
  if [ -z "$release_ts" ]; then
    warn "Could not parse release date '$published_at' — skipping age check"
    return 0
  fi

  current_ts="$(date +%s)"
  local days_old=$(( (current_ts - release_ts) / 86400 ))

  if [ "$days_old" -lt "$min_days" ]; then
    die "Release v${version} is only ${days_old} day(s) old. Minimum required: ${min_days} day(s). Use --latest to override, or wait."
  fi

  ok "Release age verified: ${days_old} day(s) old (minimum: ${min_days})"
}

# ── vendor binary verification ────────────────────────────────────────────────
# Verifies SHA-256 checksums of installed vendor binaries against the manifest
# bundled in the framework release.
verify_vendor_binaries() {
  local framework_root="$1"
  local checksums_file="${framework_root}/metadata/vendor-checksums.txt"

  if [ ! -f "$checksums_file" ]; then
    warn "No vendor checksums found in release — skipping binary verification"
    return 0
  fi

  # Determine current platform suffix to match the right checksum entry
  local os arch suffix
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
  suffix="${os}-${arch}"

  info "Verifying vendor binary checksums..."
  local verified=0 failed=0

  while IFS= read -r line; do
    # Skip comments and blank lines
    case "$line" in
      ''|\#*) continue ;;
    esac

    local expected_hash bin_name plat_suffix
    expected_hash="$(printf '%s' "$line" | awk '{print $1}')"
    bin_name="$(printf '%s' "$line" | awk '{print $2}')"
    plat_suffix="$(printf '%s' "$line" | awk '{print $3}')"

    # Only verify binaries for this platform
    [ "$plat_suffix" = "$suffix" ] || continue

    local installed_bin="${PILOSA_HOME}/bin/${bin_name}"
    if [ ! -f "$installed_bin" ]; then
      continue
    fi

    if verify_checksum "$installed_bin" "$expected_hash"; then
      verified=$((verified + 1))
    else
      failed=$((failed + 1))
      warn "Checksum mismatch: ${bin_name} (${plat_suffix})"
    fi
  done < "$checksums_file"

  if [ "$failed" -gt 0 ]; then
    die "${failed} vendor binary checksum(s) failed. Remove ${PILOSA_HOME} and re-install, or use --no-gum."
  fi

  if [ "$verified" -gt 0 ]; then
    ok "${verified} vendor binary checksum(s) verified"
  fi
}

# ── resolve version ────────────────────────────────────────────────────────
resolve_version() {
  if [ "$VERSION" = "latest" ]; then
    info "Resolving latest version..."
    # GitHub redirects /latest to the tag
    VERSION="$(curl -fsSL -o /dev/null -w '%{url_effective}' "https://github.com/${REPO}/releases/latest" 2>/dev/null | sed 's|.*/tag/||' | sed 's/^v//')"
    if [ -z "$VERSION" ]; then
      die "Could not resolve latest version. Use --version to specify."
    fi
    info "Latest version: ${VERSION}"
  fi
}

# ── version comparison ──────────────────────────────────────────────────────
# Compare two dot-separated version strings.
# Returns 0 if $1 == $2, 1 if $1 > $2, 2 if $1 < $2
compare_versions() {
  local a="$1" b="$2"
  local IFS=.
  set -- $a
  local av=($@)
  set -- $b
  local bv=($@)
  local i max
  max=${#av[@]}
  [ ${#bv[@]} -gt $max ] && max=${#bv[@]}
  for ((i=0; i<max; i++)); do
    local an=${av[$i]:-0} bn=${bv[$i]:-0}
    if [ "$an" -gt "$bn" ]; then
      return 1
    elif [ "$an" -lt "$bn" ]; then
      return 2
    fi
  done
  return 0
}

get_installed_version() {
  if [ -d "${PILOSA_HOME}/versions" ]; then
    ls -1 "${PILOSA_HOME}/versions" 2>/dev/null | sort -t. -k1,1n -k2,2n -k3,3n | tail -1
  fi
}

prompt_upgrade() {
  local installed="$1" target="$2"
  local action=""

  compare_versions "$target" "$installed"
  local cmp=$?

  if [ "$cmp" -eq 0 ]; then
    # Same version
    if [ "$REINSTALL" -eq 1 ]; then
      if [ "$YES" -eq 1 ]; then
        info "Reinstalling v${target} (--yes)..."
        return 0
      fi
      info "Reinstalling v${target}..."
      return 0
    fi
    if [ "$UPGRADE" -eq 1 ]; then
      info "Already on v${target}. No upgrade needed."
      return 1
    fi
    printf '  %sPilosa v%s is already installed.%s\n' "${Y}" "$installed" "${RESET}"
    if [ "$YES" -eq 1 ]; then
      info "Skipping reinstall prompt (--yes)."
      return 1
    fi
    printf '  %sReinstall?%s [y/N]: ' "${BOLD}" "${RESET}"
    local reply
    if ! read_from_tty reply; then
      die "Cannot read from terminal. Use --yes to skip prompts."
    fi
    case "$reply" in
      y|Y|yes|YES) return 0 ;;
      *) info "Install cancelled." ; return 1 ;;
    esac
  elif [ "$cmp" -eq 1 ]; then
    # Target is newer
    if [ "$UPGRADE" -eq 1 ]; then
      if [ "$YES" -eq 1 ]; then
        info "Upgrading v${installed} → v${target} (--yes)..."
        return 0
      fi
      info "Upgrading v${installed} → v${target}..."
      return 0
    fi
    if [ "$REINSTALL" -eq 1 ]; then
      info "Installing v${target} (over v${installed})..."
      return 0
    fi
    printf '  %sPilosa v%s is installed. v%s is available.%s\n' "${G}" "$installed" "$target" "${RESET}"
    if [ "$YES" -eq 1 ]; then
      info "Auto-upgrading (--yes)."
      return 0
    fi
    printf '  %sUpgrade?%s [Y/n]: ' "${BOLD}" "${RESET}"
    local reply
    if ! read_from_tty reply; then
      die "Cannot read from terminal. Use --yes to skip prompts."
    fi
    reply="${reply:-Y}"
    case "$reply" in
      n|N|no|NO) info "Upgrade cancelled." ; return 1 ;;
      *) return 0 ;;
    esac
  else
    # Target is older
    if [ "$UPGRADE" -eq 1 ]; then
      warn "Installed v${installed} is newer than target v${target}. Skipping upgrade."
      return 1
    fi
    if [ "$REINSTALL" -eq 1 ]; then
      if [ "$YES" -eq 1 ]; then
        info "Downgrading v${installed} → v${target} (--yes)..."
        return 0
      fi
      info "Downgrading v${installed} → v${target}..."
      return 0
    fi
    printf '  %sInstalled v%s is newer than target v%s.%s\n' "${Y}" "$installed" "$target" "${RESET}"
    if [ "$YES" -eq 1 ]; then
      info "Skipping downgrade (--yes)."
      return 1
    fi
    printf '  %sDowngrade?%s [y/N]: ' "${BOLD}" "${RESET}"
    local reply
    if ! read_from_tty reply; then
      die "Cannot read from terminal. Use --yes to skip prompts."
    fi
    case "$reply" in
      y|Y|yes|YES) return 0 ;;
      *) info "Install cancelled." ; return 1 ;;
    esac
  fi
}

# ── main install flow ──────────────────────────────────────────────────────
main() {
  echo ""
  printf '  %s%sPilosa Framework Installer%s\n\n' "${BOLD}" "${C}" "${RESET}"

  detect_platform
  resolve_version
  check_release_age "$VERSION" "$MIN_DAYS"

  local base_url="https://github.com/${REPO}/releases/download/v${VERSION}"
  local archive_name="pilosa-framework-${VERSION}.tar.gz"

  info "Version: ${VERSION}"
  info "Install root: ${PILOSA_HOME}"
  info "Bin directory: ${PILOSA_BIN_DIR}"
  echo ""

  # ── check for existing installation ────────────────────────────────────
  if [ "$DRY_RUN" -eq 0 ] && [ "$VERIFY_ONLY" -eq 0 ]; then
    local installed_version
    installed_version="$(get_installed_version)"
    if [ -n "$installed_version" ]; then
      if ! prompt_upgrade "$installed_version" "$VERSION"; then
        return 0
      fi
    else
      # Fresh install — confirm unless --yes
      if [ "$YES" -eq 0 ]; then
        printf '  %sInstall Pilosa v%s?%s [Y/n]: ' "${BOLD}" "$VERSION" "${RESET}"
        local reply
        if ! read_from_tty reply; then
          die "Cannot read from terminal. Use --yes to skip prompts."
        fi
        reply="${reply:-Y}"
        case "$reply" in
          n|N|no|NO) info "Install cancelled." ; return 0 ;;
        esac
      fi
    fi
  fi

  # ── verify-only mode ──────────────────────────────────────────────────
  if [ "$VERIFY_ONLY" -eq 1 ]; then
    local existing_version
    existing_version="$(ls -1 "${PILOSA_HOME}/versions" 2>/dev/null | sort -t. -k1,1n -k2,2n -k3,3n | tail -1)"
    if [ -z "$existing_version" ]; then
      die "No Pilosa installation found at ${PILOSA_HOME}"
    fi
    local fw_dir="${PILOSA_HOME}/versions/${existing_version}"
    local fw_subdir
    fw_subdir="$(find "$fw_dir" -maxdepth 1 -type d -name 'pilosa-framework-*' 2>/dev/null | head -1)"
    if [ -z "$fw_subdir" ]; then
      die "Could not find installed framework"
    fi
    verify_vendor_binaries "$fw_subdir"
    ok "Verification complete"
    return 0
  fi

  if [ "$DRY_RUN" -eq 1 ]; then
    info "Dry run — would download:"
    info "  ${base_url}/${archive_name}"
    info "  ${base_url}/checksums.txt"
    info "Would install to: ${PILOSA_HOME}/versions/${VERSION}/"
    info "Would create shim: ${PILOSA_BIN_DIR}/pilosa"
    echo ""
    return 0
  fi

  # ── create directories ──────────────────────────────────────────────────
  mkdir -p "${PILOSA_HOME}/bin"
  mkdir -p "${PILOSA_HOME}/versions/${VERSION}"
  mkdir -p "${PILOSA_BIN_DIR}"

  # ── download framework ──────────────────────────────────────────────────
  local tmpdir
  tmpdir="$(mktemp -d)"
  trap 'rm -rf "$tmpdir"' EXIT
  printf '\n' >&2
  spinner_start "Downloading framework v${VERSION}"
  download "${base_url}/${archive_name}" "${tmpdir}/${archive_name}" 2>/dev/null
  spinner_stop

  # ── verify checksum ─────────────────────────────────────────────────────
  download "${base_url}/checksums.txt" "${tmpdir}/checksums.txt" 2>/dev/null
  if [ -f "${tmpdir}/checksums.txt" ]; then
    local expected_hash
    expected_hash="$(grep "${archive_name}" "${tmpdir}/checksums.txt" 2>/dev/null | awk '{print $1}')"
    if [ -n "$expected_hash" ]; then
      if verify_checksum "${tmpdir}/${archive_name}" "$expected_hash"; then
        ok "Framework checksum verified"
      else
        die "Framework checksum mismatch — aborting for safety"
      fi
    else
      die "Archive not found in checksums file — aborting for safety"
    fi
  else
    die "No checksums.txt available — aborting for safety"
  fi

  # ── unpack framework ────────────────────────────────────────────────────
  info "Unpacking framework..."
  safe_untar "${tmpdir}/${archive_name}" "${PILOSA_HOME}/versions/${VERSION}"

  # ── install pilosa CLI ──────────────────────────────────────────────────
  local pilosa_bin="${PILOSA_HOME}/versions/${VERSION}/pilosa-framework-${VERSION}/.bin/pilosa"
  if [ -f "$pilosa_bin" ]; then
    cp "$pilosa_bin" "${PILOSA_HOME}/bin/pilosa"
    chmod +x "${PILOSA_HOME}/bin/pilosa"
    ok "Installed pilosa CLI"
  else
    die "pilosa CLI not found in archive"
  fi

  # ── install bundled binaries ───────────────────────────────────────────
  if [ "$NO_GUM" -eq 0 ]; then
    local vendor_src="${PILOSA_HOME}/versions/${VERSION}/pilosa-framework-${VERSION}/.bin/lib/vendor"

    # Detect platform suffix (e.g. darwin-arm64, linux-amd64)
    local os arch suffix
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
    suffix="${os}-${arch}"

    if [[ -d "$vendor_src" ]]; then

      for bin_name in gum; do
        local src_bin="${vendor_src}/${bin_name}-${suffix}"
        if [[ -f "$src_bin" ]]; then
          cp "$src_bin" "${PILOSA_HOME}/bin/${bin_name}"
          chmod +x "${PILOSA_HOME}/bin/${bin_name}"
          ok "Installed ${bin_name}"
        else
          warn "No ${bin_name} binary for ${suffix}"
        fi
      done
    fi

    # ── install Pilosa vendor (RapidOCR + MarkItDown) ────────────────────
    local pilosa_vendor_dest="${PILOSA_HOME}/vendor/pilosa-${suffix}"
    local vendor_url="${base_url}/pilosa-vendor-${suffix}.tar.gz"
    local vendor_tmp="${tmpdir}/pilosa-vendor-${suffix}.tar.gz"

    spinner_start "Downloading Pilosa vendor for ${suffix}"
    if download "$vendor_url" "$vendor_tmp" 2>/dev/null; then
      spinner_stop

      spinner_start "Installing Pilosa vendor (Python + wrappers)"
      mkdir -p "$pilosa_vendor_dest"
      safe_untar "$vendor_tmp" "$pilosa_vendor_dest" --strip-components=1
      chmod +x "${pilosa_vendor_dest}/rapidocr-cli" 2>/dev/null || true
      chmod +x "${pilosa_vendor_dest}/markitdown-cli" 2>/dev/null || true
      spinner_stop

      # ── Install Python packages via pip ──────────────────────────
      local pilosa_python="${pilosa_vendor_dest}/python/bin/python3"
      if [[ ! -x "$pilosa_python" ]]; then
        pilosa_python="${pilosa_vendor_dest}/Python.framework/Versions/Current/bin/python3"
      fi
      if [[ -x "$pilosa_python" ]]; then
        spinner_start "Installing Python packages (MarkItDown + RapidOCR)"
        local pip_ok=0
        "$pilosa_python" -m pip install --upgrade pip --quiet 2>/dev/null || true
        if "$pilosa_python" -m pip install \
          "markitdown[docx,pptx,xlsx,xls,outlook,pdf]==0.1.6" \
          "rapidocr==3.8.1" \
          "onnxruntime==1.26.0" \
          "pypdfium2==5.9.0" \
          --quiet 2>/dev/null; then
          pip_ok=1
        fi
        spinner_stop

        if [[ $pip_ok -eq 1 ]]; then
          # Remove Chinese OCR models (English only, saves ~100 MB)
          spinner_start "Cleaning up unused models"
          "$pilosa_python" -c "
import rapidocr, os
models_dir = os.path.join(os.path.dirname(rapidocr.__file__), 'models')
for f in os.listdir(models_dir):
    if f.startswith('ch_'):
        os.remove(os.path.join(models_dir, f))
for f in ['ppocr_keys_v1.txt', 'ppocrv5_dict.txt']:
    path = os.path.join(models_dir, f)
    if os.path.exists(path): os.remove(path)
" 2>/dev/null || true
          spinner_stop

          # Pre-download English OCR models (avoids delay on first use)
          spinner_start "Downloading OCR models"
          "$pilosa_python" -c "
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
print('English models ready')
" 2>/dev/null || warn "Model download will happen on first use"
          spinner_stop
          ok "Python packages installed"
        else
          warn "pip install failed — PDF/image OCR and Office doc conversion will not be available"
        fi
      else
        warn "Bundled Python not found — PDF/image OCR and Office doc conversion will not be available"
      fi
    else
      spinner_stop
      warn "No Pilosa vendor for ${suffix} (PDF/image OCR and Office doc conversion will not be available)"
    fi

    # Verify vendor binary checksums against the release manifest
    local fw_root="${PILOSA_HOME}/versions/${VERSION}/pilosa-framework-${VERSION}"
    verify_vendor_binaries "$fw_root"
  fi

  # ── create shim ─────────────────────────────────────────────────────────
  local shim="${PILOSA_BIN_DIR}/pilosa"
  cat > "$shim" << SHIM_EOF
#!/bin/sh
exec "${PILOSA_HOME}/bin/pilosa" "\$@"
SHIM_EOF
  chmod +x "$shim"
  ok "Created shim: ${shim}"

  # ── clean up, check PATH, launch dashboard ──────────────────────────────
  trap - EXIT
  rm -rf "$tmpdir"

  # ── smoke test ──────────────────────────────────────────────────────────
  echo ""
  info "Running smoke test..."
  if "${PILOSA_BIN_DIR}/pilosa" help >/dev/null 2>&1; then
    ok "Smoke test passed"
  else
    warn "Smoke test failed — pilosa may need PATH update"
  fi

  #
  # ── PATH setup — opencode pattern: shell detection + deduplication ──────
  #
  if [[ "${NO_MODIFY_PATH:-false}" != "true" ]]; then
    local current_shell
    current_shell="$(basename "${SHELL:-/bin/sh}")"
    local candidates=()

    case "$current_shell" in
      fish) candidates=("$HOME/.config/fish/config.fish") ;;
      zsh)  candidates=("${ZDOTDIR:-$HOME}/.zshrc" "${ZDOTDIR:-$HOME}/.zshenv") ;;
      bash) candidates=("$HOME/.bashrc" "$HOME/.bash_profile" "$HOME/.profile") ;;
      *)    candidates=("$HOME/.profile") ;;
    esac

    local config_file=""
    for cf in "${candidates[@]}"; do
      if [[ -f "$cf" ]]; then config_file="$cf"; break; fi
    done

    local path_line=""
    case "$current_shell" in
      fish) path_line="fish_add_path $PILOSA_BIN_DIR" ;;
      *)    path_line="export PATH=\"$PILOSA_BIN_DIR:\$PATH\"" ;;
    esac

    if [[ -n "$config_file" ]]; then
      if [[ -w "$config_file" ]]; then
        if ! grep -Fxq "$path_line" "$config_file" 2>/dev/null; then
          printf '\n# Pilosa\n%s\n' "$path_line" >> "$config_file"
          ok "Added ${PILOSA_BIN_DIR} to ${config_file}"
        fi
      else
        info "Cannot write to ${config_file} — add it manually:"
        info "  ${path_line}"
      fi
    else
      info "No shell config found for ${current_shell}."
      info "Add this to your shell config:"
      info "  ${path_line}"
    fi
  fi

  echo ""
  divider
  printf '\n  %s%sPilosa installed successfully!%s\n\n' "${BOLD}" "${G}" "${RESET}"

  # Source the right profile so PATH is live for the dashboard launch
  if [[ "${NO_MODIFY_PATH:-false}" != "true" ]] && [[ -n "${config_file:-}" ]] && [[ -f "${config_file:-}" ]]; then
    source "${config_file}" 2>/dev/null || true
  fi

  info "Launching Pilosa dashboard..."
  sleep 1
  exec "${PILOSA_BIN_DIR}/pilosa" </dev/tty
}

# ── helpers ─────────────────────────────────────────────────────────────────
divider() {
  printf '%s\n' "${DIM}$(printf '%.0s─' 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 41 42 43 44 45 46 47 48 49 50 51 52 53 54 55 56 57 58 59 60 61 62 63 64 65 66 67 68 69 70 71 72 73 74 75 76 77 78)${RESET}"
}

main "$@"
