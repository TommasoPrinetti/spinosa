#!/usr/bin/env bash
# build-pilosa-vendor.sh — Build unified Pilosa vendor bundle
#
# Creates a self-contained vendor directory with:
#   - Standalone Python 3.11 (no system Python needed)
#   - RapidOCR + onnxruntime + pypdfium2 (offline OCR engine)
#   - MarkItDown + python-docx + python-pptx + openpyxl + xlrd + olefile (Office doc converter)
#   - PaddleOCR ONNX models (pre-downloaded, English only)
#   - rapidocr-cli.py wrapper (batch protocol)
#   - markitdown-cli.py wrapper (batch protocol)
#
# Usage:
#   ./build-pilosa-vendor.sh [platform]
#
# Platforms: darwin-arm64, linux-amd64, linux-arm64, darwin-amd64
# If omitted, builds for current platform.
#
# Cross-platform builds (e.g. linux-amd64 on macOS) skip pip install
# and model download — those happen on first run on the target machine.
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

# Pinned dependency versions
ONNXRUNTIME_VERSION="1.26.0"
RAPIDOCR_VERSION="3.8.1"
PDFIUM_VERSION="5.9.0"
MARKITDOWN_VERSION="0.1.6"

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

can_execute() {
    local platform="$1"
    local host_platform
    host_platform="$(detect_platform)"
    [[ "$platform" == "$host_platform" ]]
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

    if can_execute "$platform"; then
        log "Native build — installing packages and downloading models..."
        "${python_bin}" --version || err "Python not working"

        log "Upgrading pip..."
        "${python_bin}" -m pip install --upgrade pip --quiet

        log "Installing onnxruntime ${ONNXRUNTIME_VERSION} (anchor first)..."
        "${python_bin}" -m pip install "onnxruntime==${ONNXRUNTIME_VERSION}" --quiet

        log "Installing RapidOCR ${RAPIDOCR_VERSION} + pypdfium2 ${PDFIUM_VERSION}..."
        "${python_bin}" -m pip install "rapidocr==${RAPIDOCR_VERSION}" "pypdfium2==${PDFIUM_VERSION}" --quiet

        log "Installing MarkItDown ${MARKITDOWN_VERSION} [docx,pptx,xlsx,xls,outlook,pdf]..."
        "${python_bin}" -m pip install "markitdown[docx,pptx,xlsx,xls,outlook,pdf]==${MARKITDOWN_VERSION}" --quiet

        # Remove Chinese models (only English needed)
        log "Removing Chinese OCR models..."
        "${python_bin}" -c "
import rapidocr
import os
models_dir = os.path.join(os.path.dirname(rapidocr.__file__), 'models')
for f in os.listdir(models_dir):
    if f.startswith('ch_'):
        path = os.path.join(models_dir, f)
        os.remove(path)
        print(f'Removed: {f}')
" 2>/dev/null || warn "Could not remove Chinese models"

        # Remove unnecessary text files
        log "Removing unnecessary model files..."
        "${python_bin}" -c "
import rapidocr
import os
models_dir = os.path.join(os.path.dirname(rapidocr.__file__), 'models')
for f in ['ppocr_keys_v1.txt', 'ppocrv5_dict.txt']:
    path = os.path.join(models_dir, f)
    if os.path.exists(path):
        os.remove(path)
        print(f'Removed: {f}')
" 2>/dev/null || true

        log "Pre-downloading OCR models..."
        "${python_bin}" -c "
from rapidocr import RapidOCR, EngineType, LangDet, LangRec, ModelType, OCRVersion
engine = RapidOCR(
    params={
        'Det.engine_type': EngineType.ONNXRUNTIME,
        'Det.lang_type': LangDet.EN,
        'Det.model_type': ModelType.MOBILE,
        'Det.ocr_version': OCRVersion.PPOCRV4,
        'Rec.engine_type': EngineType.ONNXRUNTIME,
        'Rec.lang_type': LangRec.EN,
        'Rec.model_type': ModelType.MOBILE,
        'Rec.ocr_version': OCRVersion.PPOCRV4,
    }
)
print('English models downloaded')
" 2>/dev/null || warn "Model download will happen on first run"

        log "Verifying both engines import..."
        "${python_bin}" -c "from rapidocr import RapidOCR; print('RapidOCR OK')" || warn "RapidOCR import failed"
        "${python_bin}" -c "from markitdown import MarkItDown; print('MarkItDown OK')" || warn "MarkItDown import failed"
    else
        warn "Cross-platform build — packages and models will install on first run"
    fi

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
    log "RapidOCR: ${RAPIDOCR_VERSION} (onnxruntime ${ONNXRUNTIME_VERSION})"
    log "MarkItDown: ${MARKITDOWN_VERSION}"
    log "Output: ${VENDOR_BASE}/pilosa-vendor-${platform}.tar.gz"
    echo ""

    mkdir -p "${VENDOR_BASE}"
    build_platform "${platform}"

    echo ""
    log "Done! Archive ready for distribution."
}

main "$@"
