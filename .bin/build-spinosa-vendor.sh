#!/usr/bin/env bash
# build-spinosa-vendor.sh — Build Spinosa vendor bundle (Python + wrappers only)
#
# Creates a self-contained vendor directory with:
#   - Standalone Python 3.11 (no system Python needed, includes pip + SSL)
#   - CLI wrappers (batch protocol)
#   - markitdown-cli.py wrapper (batch protocol)
#
# Packages (markitdown[all], rapidocr, onnxruntime, pypdfium2, pypdf) and OCR models
# are NOT bundled — they install via pip at install time. This keeps the
# vendor tarball small (~26 MB) and cross-platform compatible.
#
# Usage:
#   ./build-spinosa-vendor.sh [platform]
#
# Platforms: darwin-arm64, darwin-amd64, linux-amd64, linux-arm64
# If omitted, builds for current platform.
#
# Output:
#   .bin/lib/vendor/spinosa-vendor-<platform>.tar.gz

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SPINOSA_LOG_COMPONENT="build-spinosa-vendor"
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/lib/spinosa/logging_bootstrap.sh" "$@"
FRAMEWORK_ROOT="$(dirname "$SCRIPT_DIR")"
VENDOR_BASE="${FRAMEWORK_ROOT}/.bin/lib/vendor"
MARKITDOWN_CLI="${FRAMEWORK_ROOT}/.bin/lib/markitdown-cli.py"
RAPIDOCR_CLI="${FRAMEWORK_ROOT}/.bin/lib/rapidocr-cli.py"

PYTHON_VERSION="3.11.15"
PYTHON_BUILD_VERSION="20260602"

VENDOR_PIP_MARKITDOWN='markitdown[all]==0.1.6'
VENDOR_PIP_RAPIDOCR='rapidocr==3.8.1'
VENDOR_PIP_PYPDFIUM2='pypdfium2==5.9.0'
VENDOR_PIP_PYPDF='pypdf==5.1.0'
VENDOR_PIP_ONNX_VERSIONS=(1.23.2 1.23.1 1.23.0 1.22.1 1.22.0)

R=$'\033[31m' G=$'\033[32m' Y=$'\033[33m'
RESET=$'\033[0m'

log() { printf '  %s %s\n' "${G}✓${RESET}" "$*"; }
warn() { printf '  %s %s\n' "${Y}⚠${RESET}" "$*"; }
err() { printf '  %s %s\n' "${R}✗${RESET}" "$*" >&2; exit 1; }

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
        darwin-arm64) os="apple-darwin"; arch="aarch64" ;;
        darwin-amd64) os="apple-darwin"; arch="x86_64" ;;
        linux-amd64)  os="unknown-linux-gnu"; arch="x86_64" ;;
        linux-arm64)  os="unknown-linux-gnu"; arch="aarch64" ;;
        *) err "Unsupported platform: $platform" ;;
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

host_python_bin() {
    if command -v python3 >/dev/null 2>&1; then
        command -v python3
    elif command -v python >/dev/null 2>&1; then
        command -v python
    else
        err "python3 or python is required to generate locked requirements"
    fi
}

pip_platform_args() {
    local platform="$1"
    case "$platform" in
        darwin-arm64)
            printf '%s\n' \
                --platform macosx_11_0_arm64 \
                --platform macosx_11_0_universal2
            ;;
        darwin-amd64)
            printf '%s\n' \
                --platform macosx_10_9_x86_64 \
                --platform macosx_11_0_x86_64 \
                --platform macosx_11_0_universal2
            ;;
        linux-amd64)
            printf '%s\n' \
                --platform manylinux_2_17_x86_64 \
                --platform manylinux2014_x86_64 \
                --platform manylinux_2_28_x86_64
            ;;
        linux-arm64)
            printf '%s\n' \
                --platform manylinux_2_17_aarch64 \
                --platform manylinux2014_aarch64 \
                --platform manylinux_2_28_aarch64
            ;;
        *) err "Unsupported platform for requirements lock: $platform" ;;
    esac
}

generate_requirements_lock() {
    local platform="$1"
    local vendor_dir="$2"
    local wheel_dir requirements_file onnx_ver lock_resolved=0 lock_python
    wheel_dir="$(mktemp -d "${TMPDIR:-/tmp}/spinosa-vendor-wheels-XXXXXX")"
    requirements_file="${vendor_dir}/requirements.txt"
    lock_python="$(host_python_bin)"

    local platform_args
    platform_args=()
    while IFS= read -r _arg; do
        platform_args+=("$_arg")
    done < <(pip_platform_args "$platform")

    log "Resolving vendor Python package lock for ${platform}..."
    for onnx_ver in "${VENDOR_PIP_ONNX_VERSIONS[@]}"; do
        rm -rf "${wheel_dir:?}/"*
        if "${lock_python}" -m pip download \
            --dest "${wheel_dir}" \
            --implementation cp \
            --python-version 311 \
            --abi cp311 \
            --only-binary=:all: \
            "${platform_args[@]}" \
            "${VENDOR_PIP_MARKITDOWN}" \
            "${VENDOR_PIP_RAPIDOCR}" \
            "onnxruntime==${onnx_ver}" \
            "${VENDOR_PIP_PYPDFIUM2}" \
            "${VENDOR_PIP_PYPDF}" >/dev/null; then
            lock_resolved=1
            log "Locked onnxruntime version: ${onnx_ver}"
            break
        fi
    done

    [[ "${lock_resolved}" -eq 1 ]] || err "Failed to resolve vendor wheels for a locked requirements file"
    compgen -G "${wheel_dir}/*.whl" >/dev/null || err "Failed to resolve vendor wheels for a locked requirements file"

    "${lock_python}" - <<'PY' "${wheel_dir}" "${requirements_file}"
import hashlib
import sys
import zipfile
from email.parser import Parser
from pathlib import Path

wheel_dir = Path(sys.argv[1])
requirements_file = Path(sys.argv[2])
entries = []

for wheel_path in sorted(wheel_dir.glob("*.whl")):
    with zipfile.ZipFile(wheel_path) as zf:
        metadata_name = next(
            (name for name in zf.namelist() if name.endswith(".dist-info/METADATA")),
            None,
        )
        if metadata_name is None:
            raise SystemExit(f"Missing wheel metadata: {wheel_path.name}")
        metadata = Parser().parsestr(zf.read(metadata_name).decode("utf-8", "replace"))
    name = metadata["Name"]
    version = metadata["Version"]
    digest = hashlib.sha256(wheel_path.read_bytes()).hexdigest()
    entries.append((name.lower(), f"{name}=={version} --hash=sha256:{digest}"))

entries.sort(key=lambda item: item[0])
with requirements_file.open("w", encoding="utf-8", newline="\n") as fh:
    fh.write("# Generated by .bin/build-spinosa-vendor.sh\n")
    for _, line in entries:
        fh.write(line + "\n")
PY

    rm -rf "${wheel_dir}" 2>/dev/null || true
    log "Wrote locked requirements: ${requirements_file}"
}

build_platform() {
    local platform="$1"
    local vendor_dir="${VENDOR_BASE}/spinosa-vendor-${platform}"
    local python_dir="${vendor_dir}/python"

    log "Building Spinosa vendor bundle for: ${platform}"
    log "Python version: ${PYTHON_VERSION}"

    rm -rf "${vendor_dir}"
    mkdir -p "${vendor_dir}"

    local python_url python_tar python_checksums
    python_url="$(get_python_url "$platform")"
    python_tar="$(mktemp "${TMPDIR:-/tmp}/python-standalone-${platform}-XXXXXX.tar.gz")"
    python_checksums="$(mktemp "${TMPDIR:-/tmp}/python-checksums-${platform}-XXXXXX.txt")"

    # Ensure temps are removed on exit from this build
    trap 'rm -f "$python_tar" "$python_checksums" 2>/dev/null || true' EXIT

    log "Downloading standalone Python..."
    curl -L --retry 3 --retry-delay 5 -o "${python_tar}" "${python_url}" || err "Failed to download Python"

    # Verify Python standalone checksum
    local python_checksums_url
    python_checksums_url="https://github.com/astral-sh/python-build-standalone/releases/download/${PYTHON_BUILD_VERSION}/SHA256SUMS"
    if curl -fsSL "$python_checksums_url" -o "$python_checksums" 2>/dev/null; then
      local _expected_hash
      _expected_hash="$(grep "$(basename "$python_url" | sed 's/%2B/+/')" "$python_checksums" 2>/dev/null | awk '{print $1}')"
      if [[ -n "$_expected_hash" ]]; then
        local _actual_hash
        _actual_hash="$(shasum -a 256 "$python_tar" 2>/dev/null | awk '{print $1}' || sha256sum "$python_tar" 2>/dev/null | awk '{print $1}')"
        if [[ "$_actual_hash" != "$_expected_hash" ]]; then
          err "Python standalone checksum mismatch — aborting for safety"
        fi
        log "Python standalone checksum verified"
      else
        warn "Python standalone not found in checksums — skipping verification"
      fi
    else
      warn "Could not download Python checksums — skipping verification"
    fi

    log "Extracting Python..."
    mkdir -p "${python_dir}"
    local _listing _verbose_listing
    _listing="$(tar -tzf "${python_tar}" 2>/dev/null)" || err "Cannot read Python archive"
    _verbose_listing="$(tar -tzvf "${python_tar}" 2>/dev/null)" || err "Cannot inspect Python archive"
    if printf '%s\n' "$_listing" | grep -qE '(^|/)\.\.(/|$)|^/'; then
        err "Unsafe paths in Python archive"
    fi
    local _line _target
    while IFS= read -r _line; do
        [[ "$_line" == l* && "$_line" == *" -> "* ]] || continue
        _target="${_line##* -> }"
        if [[ "$_target" == /* ]] || [[ "$_target" =~ (^|/)\.\.(/|$) ]]; then
            warn "Python archive contains external symlink: ${_target} — extracting anyway (harmless in python-build-standalone)"
        fi
    done <<< "$_verbose_listing"
    tar -xzf "${python_tar}" -C "${python_dir}" --no-same-owner --strip-components=1 || err "Failed to extract Python archive"
    # temp tar cleaned by trap on EXIT

    # Clean macOS metadata files from extraction
    find "$vendor_dir" -name ".DS_Store" -delete 2>/dev/null || true
    find "$vendor_dir" -name "._*" -delete 2>/dev/null || true

    local python_bin
    if ! python_bin="$(find_python_bin "${python_dir}")"; then
        err "Python binary not found after extraction"
    fi
    log "Python binary: ${python_bin}"

    generate_requirements_lock "${platform}" "${vendor_dir}"

    # Copy CLI wrappers
    log "Copying CLI wrappers..."
    cp "${MARKITDOWN_CLI}" "${vendor_dir}/markitdown-cli.py"
    cp "${RAPIDOCR_CLI}" "${vendor_dir}/rapidocr-cli.py"

    # Create markitdown-cli bash launcher
    cat > "${vendor_dir}/markitdown-cli" << 'MDWRAP_EOF'
#!/usr/bin/env bash
# MarkItDown CLI wrapper for Spinosa
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

    # Create rapidocr-cli bash launcher
    cat > "${vendor_dir}/rapidocr-cli" << 'RAPIDWRAP_EOF'
#!/usr/bin/env bash
# RapidOCR CLI wrapper for Spinosa
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
RAPIDWRAP_EOF
    chmod +x "${vendor_dir}/rapidocr-cli"

    # Package
    log "Creating archive..."
    cd "${VENDOR_BASE}"
    COPYFILE_DISABLE=1 tar --no-xattrs -czf "spinosa-vendor-${platform}.tar.gz" "spinosa-vendor-${platform}/"

    local archive_size vendor_size
    archive_size=$(du -h "spinosa-vendor-${platform}.tar.gz" | cut -f1)
    vendor_size=$(du -sh "spinosa-vendor-${platform}" | cut -f1)
    log "Archive created: spinosa-vendor-${platform}.tar.gz (${archive_size} compressed, ${vendor_size} uncompressed)"

    rm -rf "spinosa-vendor-${platform}"
    trap - EXIT
    log "Build complete for ${platform}"
}

main() {
    local platform
    if [[ -n "${1:-}" ]]; then
        platform="$1"
    else
        platform="$(detect_platform)" || return $?
    fi

    log "Spinosa Vendor Builder"
    log "====================="
    log "Platform: ${platform}"
    log "Python: ${PYTHON_VERSION}"
    log "Output: ${VENDOR_BASE}/spinosa-vendor-${platform}.tar.gz"
    echo ""

    mkdir -p "${VENDOR_BASE}"
    build_platform "${platform}"

    echo ""
    log "Done! Archive ready for distribution."
}

main "$@"
