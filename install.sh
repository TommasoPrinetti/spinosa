#!/usr/bin/env bash
set -eu

# ── install.sh — Pilosa Framework Installer ─────────────────────────────────
# Curl-installable installer for the Pilosa research framework.
#
# Usage:
#   curl -fsSL https://github.com/.../install.sh -o install-pilosa.sh
#   sh install-pilosa.sh
#
# Or with options:
#   sh install-pilosa.sh --version 0.1.0
#   sh install-pilosa.sh --dry-run
#   sh install-pilosa.sh --no-gum
#   sh install-pilosa.sh --prefix /custom/path
#   sh install-pilosa.sh --bin-dir /custom/bin
#
# Requirements: sh, curl or wget, tar, basic Unix utils.
# Zero npm, zero Python, zero Go, zero Homebrew, zero Git.

# ── defaults ────────────────────────────────────────────────────────────────
VERSION="${VERSION:-latest}"
DRY_RUN=0
NO_GUM=0
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

# ── parse flags ─────────────────────────────────────────────────────────────
while [ $# -gt 0 ]; do
  case "$1" in
    --version)   VERSION="$2"; shift 2 ;;
    --dry-run)   DRY_RUN=1; shift ;;
    --no-gum)    NO_GUM=1; shift ;;
    --prefix)    PILOSA_HOME="$2"; shift 2 ;;
    --bin-dir)   PILOSA_BIN_DIR="$2"; shift 2 ;;
    --help|-h)
      echo "Usage: sh install-pilosa.sh [options]"
      echo "  --version X.Y.Z   Install specific version (default: latest)"
      echo "  --dry-run         Show what would happen without doing it"
      echo "  --no-gum          Skip bundled binary installation (Gum, pdf2md)"
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
  url="$1"
  dest="$2"

  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$dest"
  elif command -v wget >/dev/null 2>&1; then
    wget -q "$url" -O "$dest"
  else
    die "Neither curl nor wget found. Please install one."
  fi
}

# ── checksum helper ─────────────────────────────────────────────────────────
sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    echo "no_checksum_tool"
  fi
}

verify_checksum() {
  file="$1"
  expected="$2"

  if [ "$expected" = "no_checksum_tool" ]; then
    warn "No checksum tool available — skipping verification for $(basename "$file")"
    return 0
  fi

  actual="$(sha256_file "$file")"
  if [ "$actual" = "$expected" ]; then
    return 0
  else
    return 1
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

# ── main install flow ──────────────────────────────────────────────────────
main() {
  echo ""
  printf '  %s%sPilosa Framework Installer%s\n\n' "${BOLD}" "${C}" "${RESET}"

  detect_platform
  resolve_version

  local base_url="https://github.com/${REPO}/releases/download/v${VERSION}"
  local archive_name="pilosa-framework-${VERSION}.tar.gz"

  info "Version: ${VERSION}"
  info "Install root: ${PILOSA_HOME}"
  info "Bin directory: ${PILOSA_BIN_DIR}"
  echo ""

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
  info "Downloading framework archive..."
  local tmpdir
  tmpdir="$(mktemp -d)"
  download "${base_url}/${archive_name}" "${tmpdir}/${archive_name}"

  # ── verify checksum ─────────────────────────────────────────────────────
  info "Downloading checksums..."
  if download "${base_url}/checksums.txt" "${tmpdir}/checksums.txt" 2>/dev/null; then
    local expected_hash
    expected_hash="$(grep "${archive_name}" "${tmpdir}/checksums.txt" 2>/dev/null | awk '{print $1}')"
    if [ -n "$expected_hash" ]; then
      if verify_checksum "${tmpdir}/${archive_name}" "$expected_hash"; then
        ok "Framework checksum verified"
      else
        die "Framework checksum mismatch — aborting for safety"
      fi
    else
      warn "Archive not found in checksums file — skipping verification"
    fi
  else
    warn "No checksums.txt available — skipping verification"
  fi

  # ── unpack framework ────────────────────────────────────────────────────
  info "Unpacking framework..."
  tar -xzf "${tmpdir}/${archive_name}" -C "${PILOSA_HOME}/versions/${VERSION}"

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
    if [[ -d "$vendor_src" ]]; then
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

      for bin_name in gum pdf2md; do
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
  fi

  # ── create shim ─────────────────────────────────────────────────────────
  local shim="${PILOSA_BIN_DIR}/pilosa"
  cat > "$shim" << SHIM_EOF
#!/bin/sh
exec "${PILOSA_HOME}/bin/pilosa" "\$@"
SHIM_EOF
  chmod +x "$shim"
  ok "Created shim: ${shim}"

  # ── cleanup ─────────────────────────────────────────────────────────────
  rm -rf "$tmpdir"

  # ── PATH check ──────────────────────────────────────────────────────────
  echo ""
  case ":${PATH}:" in
    *":${PILOSA_BIN_DIR}:"*)
      ok "Pilosa is on your PATH"
      ;;
    *)
      warn "${PILOSA_BIN_DIR} is not on your PATH"
      echo ""
      info "Add this to your shell profile (~/.zshrc, ~/.bashrc, etc.):"
      echo ""
      echo "    export PATH=\"${PILOSA_BIN_DIR}:\$PATH\""
      echo ""
      ;;
  esac

  # ── smoke test ──────────────────────────────────────────────────────────
  echo ""
  info "Running smoke test..."
  if "${PILOSA_BIN_DIR}/pilosa" help >/dev/null 2>&1; then
    ok "Smoke test passed"
  else
    warn "Smoke test failed — pilosa may need PATH update"
  fi

  echo ""
  divider
  printf '\n  %s%sPilosa installed successfully!%s\n\n' "${BOLD}" "${G}" "${RESET}"
  info "Run ${BOLD}pilosa new${RESET} to create a research workspace"
  info "Run ${BOLD}pilosa help${RESET} to see available commands"
  echo ""
}

# ── helpers ─────────────────────────────────────────────────────────────────
divider() {
  printf '%s\n' "${DIM}$(printf '%.0s─' 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 41 42 43 44 45 46 47 48 49 50 51 52 53 54 55 56 57 58 59 60 61 62 63 64 65 66 67 68 69 70 71 72 73 74 75 76 77 78)${RESET}"
}

main "$@"
