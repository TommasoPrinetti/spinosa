#!/usr/bin/env bash
# build-pilosa-vendor.sh — Build unified Pilosa vendor bundle
#
# Creates a self-contained vendor directory with:
#   - Standalone Python 3.11 (no system Python needed)
#   - rapidocr-cli.py wrapper (batch protocol)
#   - markitdown-cli.py wrapper (batch protocol)
#
# Pip packages (RapidOCR, MarkItDown, onnxruntime, pypdfium2)
# are installed at install time by install.sh.
#
# Cross-platform builds work from any host — only Python binary
# + wrappers are packaged. No pip install at build time.
#
# Usage:
#   ./build-pilosa-vendor.sh [platform]
#
# Platforms: darwin-arm64, linux-amd64, linux-arm64, darwin-amd64
# If omitted, builds for current platform.
#
# Output:
#   .bin/lib/vendor/pilosa-vendor-<platform>.tar.gz

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRAMEWORK_ROOT="$(dirname "$SCRIPT_DIR")"
VENDOR_BASE="${FRAMEWORK_ROOT}/.bin/lib/vendor"
RAPIDOCR_CLI="${FRAMEWORK_ROOT}/.bin/lib/rapidocr-cli.py"
MARKITDOWN_CLI="${FRAMEWORK_ROOT}/.bin/lib/markitdown-cli.py"

PYTHON_VERSION="3.11.15"
PYTHON_BUILD_VERSION="20260602"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC} $*"; }
err() { echo -e "${RED}✗${NC} $*" >&2; exit 1; }

detect_platform() {
    local os arch
    os="$(uname -s)"
    arch="$(uname -m)"
    case "$os" in
        Darwin) os="darwin" ;;
        Linux) os="linux" ;;
        *) err "Unsupported OS: $os" ;;
    esac
    case "$arch" in
        arm64|aarch64) arch="arm64" ;;
        x86_64|amd64) arch="amd64" ;;
        *) err "Unsupported architecture: $arch" ;;
    esac
    echo "${os}-${arch}"
}

get_python_url() {
    local platform="$1"
    local os arch
    case "$platform" in
        darwin-arm64)
            os="apple-darwin"
            arch="aarch64"
            ;;
        darwin-amd64)
            os="apple-darwin"
            arch="x86_64"
            ;;
        linux-amd64)
            os="unknown-linux-gnu"
            arch="x86_64"
            ;;
        linux-arm64)
            os="unknown-linux-gnu"
            arch="aarch64"
            ;;
        *)
            err "Unsupported platform: $platform"
            ;;
    esac
    echo "https://github.com/astral-sh/python-build-standalone/releases/download/${PYTHON_BUILD_VERSION}/cpython-${PYTHON_VERSION}%2B${PYTHON_BUILD_VERSION}-${arch}-${os}-install_only.tar.gz"
}

find_python_bin() {
    local python_dir="$1"
    for bin in "${python_dir}/bin/python3" "${python_dir}/Python.framework/Versions/Current/bin/python3"; do
        if [[ -x "$bin" ]]; then
            echo "$bin"
            return 0
        fi
    done
    return 1
}

build_platform() {
    local platform="$1"
    local vendor_dir="${VENDOR_BASE}/pilosa-vendor-${platform}"
    local python_dir="${vendor_dir}/python"

    log "Building Pilosa unified vendor for: ${platform}"
    log "Python version: ${PYTHON_VERSION}"

    rm -rf "${vendor_dir}"
    mkdir -p "${vendor_dir}"

    local python_url python_tar
    python_url="$(get_python_url "$platform")"
    python_tar="/tmp/python-standalone-${platform}.tar.gz"

    log "Downloading standalone Python..."
    curl -L -o "${python_tar}" "${python_url}" || err "Failed to download Python"

    log "Extracting Python..."
    mkdir -p "${python_dir}"
    tar -xzf "${python_tar}" -C "${python_dir}" --strip-components=1
    rm "${python_tar}"

    local python_bin
    if ! python_bin="$(find_python_bin "${python_dir}")"; then
        err "Python binary not found after extraction"
    fi
    log "Python binary: ${python_bin}"

    # Copy both CLI wrappers
    log "Copying CLI wrappers..."
    cp "${RAPIDOCR_CLI}" "${vendor_dir}/rapidocr-cli.py"
    cp "${MARKITDOWN_CLI}" "${vendor_dir}/markitdown-cli.py"

    # Create rapidocr-cli bash launcher
    cat > "${vendor_dir}/rapidocr-cli" << 'WRAPPER_EOF'
#!/usr/bin/env bash
# RapidOCR CLI wrapper for Pilosa
# Uses bundled standalone Python — no system Python required
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_BIN="${SCRIPT_DIR}/python/bin/python3"
if [[ ! -x "${PYTHON_BIN}" ]]; then
    PYTHON_BIN="${SCRIPT_DIR}/Python.framework/Versions/Current/bin/python3"
fi
if [[ ! -x "${PYTHON_BIN}" ]]; then
    echo "ERROR: Bundled Python not found in ${SCRIPT_DIR}/python/" >&2
    exit 1
fi
exec "${PYTHON_BIN}" "${SCRIPT_DIR}/rapidocr-cli.py" "$@"
WRAPPER_EOF
    chmod +x "${vendor_dir}/rapidocr-cli"

    # Create markitdown-cli bash launcher
    cat > "${vendor_dir}/markitdown-cli" << 'MDWRAP_EOF'
#!/usr/bin/env bash
# MarkItDown CLI wrapper for Pilosa
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_BIN="${SCRIPT_DIR}/python/bin/python3"
if [[ ! -x "${PYTHON_BIN}" ]]; then
    PYTHON_BIN="${SCRIPT_DIR}/Python.framework/Versions/Current/bin/python3"
fi
if [[ ! -x "${PYTHON_BIN}" ]]; then
    echo "ERROR: Bundled Python not found in ${SCRIPT_DIR}/python/" >&2
    exit 1
fi
exec "${PYTHON_BIN}" "${SCRIPT_DIR}/markitdown-cli.py" "$@"
MDWRAP_EOF
    chmod +x "${vendor_dir}/markitdown-cli"

    # Package
    log "Creating archive..."
    cd "${VENDOR_BASE}"
    tar -czf "pilosa-vendor-${platform}.tar.gz" "pilosa-vendor-${platform}/"

    local archive_size vendor_size
    archive_size=$(du -h "pilosa-vendor-${platform}.tar.gz" | cut -f1)
    vendor_size=$(du -sh "pilosa-vendor-${platform}" | cut -f1)
    log "Archive created: pilosa-vendor-${platform}.tar.gz (${archive_size} compressed, ${vendor_size} uncompressed)"

    rm -rf "pilosa-vendor-${platform}/"
    log "Build complete for ${platform}"
}

main() {
    local platform
    if [[ -n "${1:-}" ]]; then
        platform="$1"
    else
        platform="$(detect_platform)" || return $?
    fi

    log "Pilosa Unified Vendor Builder"
    log "============================="
    log "Platform: ${platform}"
    log "Python: ${PYTHON_VERSION}"
    log "Output: ${VENDOR_BASE}/pilosa-vendor-${platform}.tar.gz"
    echo ""

    mkdir -p "${VENDOR_BASE}"
    build_platform "${platform}"

    echo ""
    log "Done! Archive ready for distribution."
}

main "$@"
