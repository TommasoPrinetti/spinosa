#!/usr/bin/env bash
# build-rapidocr-vendor.sh — Build RapidOCR vendor bundle for Pilosa
#
# Creates a self-contained vendor directory with:
#   - Standalone Python 3.11 (no system Python needed)
#   - rapidocr + onnxruntime + pypdfium2 (CPU-only)
#   - PaddleOCR ONNX models (pre-downloaded)
#   - rapidocr-cli.py wrapper
#
# Usage:
#   ./build-rapidocr-vendor.sh [platform]
#
# Platforms: darwin-arm64, linux-amd64, linux-arm64, darwin-amd64
# If omitted, builds for current platform.
#
# Cross-platform builds (e.g. linux-amd64 on macOS) skip pip install
# and model download — those happen on first run on the target machine.
#
# Output:
#   .bin/lib/vendor/rapidocr-<platform>.tar.gz

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRAMEWORK_ROOT="$(dirname "$SCRIPT_DIR")"
VENDOR_BASE="${FRAMEWORK_ROOT}/.bin/lib/vendor"
RAPIDOCR_CLI="${FRAMEWORK_ROOT}/.bin/lib/rapidocr-cli.py"

# Python standalone build version
PYTHON_VERSION="3.11.15"
PYTHON_BUILD_VERSION="20260602"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC} $*"; }
err() { echo -e "${RED}✗${NC} $*" >&2; exit 1; }

# Detect current platform
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

# Check if we can execute binaries for the target platform
can_execute() {
    local platform="$1"
    local host_platform
    host_platform="$(detect_platform)"

    # Same platform = can execute
    [[ "$platform" == "$host_platform" ]]
}

# Get standalone Python download URL for platform
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

# Find the python3 binary in the extracted standalone Python
find_python_bin() {
    local python_dir="$1"
    local candidates=(
        "${python_dir}/bin/python3"
        "${python_dir}/Python.framework/Versions/Current/bin/python3"
    )
    for bin in "${candidates[@]}"; do
        if [[ -x "$bin" ]]; then
            echo "$bin"
            return 0
        fi
    done
    return 1
}

# Build for a specific platform
build_platform() {
    local platform="$1"
    local vendor_dir="${VENDOR_BASE}/rapidocr-${platform}"
    local python_dir="${vendor_dir}/python"

    log "Building RapidOCR vendor for: ${platform}"
    log "Python version: ${PYTHON_VERSION}"

    # Clean previous build
    rm -rf "${vendor_dir}"
    mkdir -p "${vendor_dir}"

    # Download standalone Python
    local python_url
    python_url="$(get_python_url "$platform")"
    local python_tar="/tmp/python-standalone-${platform}.tar.gz"

    log "Downloading standalone Python..."
    curl -L -o "${python_tar}" "${python_url}" || err "Failed to download Python"

    # Extract Python
    log "Extracting Python..."
    mkdir -p "${python_dir}"
    tar -xzf "${python_tar}" -C "${python_dir}" --strip-components=1
    rm "${python_tar}"

    # Find Python binary
    local python_bin
    if ! python_bin="$(find_python_bin "${python_dir}")"; then
        err "Python binary not found after extraction"
    fi
    log "Python binary: ${python_bin}"

    # Install packages + models only if we can execute the target binary
    if can_execute "$platform"; then
        log "Native build — installing packages and downloading models..."
        "${python_bin}" --version || err "Python not working"

        log "Upgrading pip..."
        "${python_bin}" -m pip install --upgrade pip --quiet

        log "Installing rapidocr + onnxruntime + pypdfium2..."
        "${python_bin}" -m pip install rapidocr onnxruntime pypdfium2 --quiet

        log "Pre-downloading OCR models..."
        "${python_bin}" -c "
from rapidocr import RapidOCR
engine = RapidOCR()
print('Models downloaded successfully')
" 2>/dev/null || warn "Model download will happen on first run"
    else
        warn "Cross-platform build — packages and models will install on first run"
    fi

    # Copy CLI wrapper
    log "Copying rapidocr-cli.py..."
    cp "${RAPIDOCR_CLI}" "${vendor_dir}/rapidocr-cli.py"

    # Create the main wrapper script (uses bundled Python)
    cat > "${vendor_dir}/rapidocr-cli" << 'WRAPPER_EOF'
#!/usr/bin/env bash
# RapidOCR CLI wrapper for Pilosa
# Uses bundled standalone Python — no system Python required
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Find Python binary (handle both Linux and macOS layouts)
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

    # Package
    log "Creating archive..."
    cd "${VENDOR_BASE}"
    tar -czf "rapidocr-${platform}.tar.gz" "rapidocr-${platform}/"

    # Calculate sizes
    local archive_size vendor_size
    archive_size=$(du -h "rapidocr-${platform}.tar.gz" | cut -f1)
    vendor_size=$(du -sh "rapidocr-${platform}" | cut -f1)
    log "Archive created: rapidocr-${platform}.tar.gz (${archive_size} compressed, ${vendor_size} uncompressed)"

    # Cleanup extracted directory (keep only archive)
    rm -rf "rapidocr-${platform}/"

    log "Build complete for ${platform}"
}

# Main
main() {
    local platform="${1:-$(detect_platform)}"

    log "RapidOCR Vendor Builder"
    log "======================="
    log "Platform: ${platform}"
    log "Python: ${PYTHON_VERSION}"
    log "Output: ${VENDOR_BASE}/rapidocr-${platform}.tar.gz"
    echo ""

    # Ensure vendor base exists
    mkdir -p "${VENDOR_BASE}"

    # Build
    build_platform "${platform}"

    echo ""
    log "Done! Archive ready for distribution."
}

main "$@"
