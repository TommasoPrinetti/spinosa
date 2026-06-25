# shellcheck shell=bash
# Bundled document tool discovery, repair, and vendor installation.

SPINOSA_VENDOR_DIR="${SPINOSA_HOME:-$HOME/.spinosa}/vendor/spinosa"
PLATFORM="${OS:-$(uname -s | tr '[:upper:]' '[:lower:]')}-$(uname -m | sed 's/x86_64/amd64/' | sed 's/aarch64/arm64/' | sed 's/i[3-9]86/i386/')"

vendor_python_for_tool() {
  local tool="$1" vendor_dir python_bin
  vendor_dir="$(cd "$(dirname "$tool")" 2>/dev/null && pwd -P)" || return 1
  python_bin="${vendor_dir}/python/bin/python3"
  if [[ -x "$python_bin" ]]; then echo "$python_bin"; return 0; fi
  python_bin="${vendor_dir}/Python.framework/Versions/Current/bin/python3"
  if [[ -x "$python_bin" ]]; then echo "$python_bin"; return 0; fi
  return 1
}


markitdown_tool_available() {
  local tool="$1" output python_bin
  [[ -x "$tool" ]] || return 1
  if output="$("$tool" --check-markitdown 2>&1)"; then
    return 0
  fi
  if [[ "$output" == *"unrecognized arguments: --check-markitdown"* ]]; then
    python_bin="$(vendor_python_for_tool "$tool")" || return 1
    "$python_bin" -c 'from markitdown import MarkItDown' >/dev/null 2>&1
    return $?
  fi
  return 1
}


rapidocr_tool_available() {
  local tool="$1" output python_bin
  [[ -x "$tool" ]] || return 1
  if output="$("$tool" --check-rapidocr 2>&1)"; then
    return 0
  fi
  if [[ "$output" == *"unrecognized arguments: --check-rapidocr"* ]]; then
    python_bin="$(vendor_python_for_tool "$tool")" || return 1
    "$python_bin" -c 'from rapidocr import RapidOCR; import onnxruntime; import pypdfium2' >/dev/null 2>&1
    return $?
  fi
  return 1
}


rapidocr_ocr_available() {
  local unified_bin="${SPINOSA_VENDOR_DIR}-${PLATFORM}/rapidocr-cli"
  rapidocr_tool_available "$unified_bin" && return 0
  local framework_bin="${FRAMEWORK_ROOT:-.}/.bin/lib/vendor/spinosa-${PLATFORM}/rapidocr-cli"
  rapidocr_tool_available "$framework_bin" && return 0
  return 1
}


rapidocr_ocr_bin() {
  local unified_bin="${SPINOSA_VENDOR_DIR}-${PLATFORM}/rapidocr-cli"
  if [[ -x "$unified_bin" ]]; then echo "$unified_bin"; return; fi
  local framework_bin="${FRAMEWORK_ROOT:-.}/.bin/lib/vendor/spinosa-${PLATFORM}/rapidocr-cli"
  if [[ -x "$framework_bin" ]]; then echo "$framework_bin"; return; fi
  return 1
}


pypdfium2_available() {
  local python_bin
  python_bin="$(fallback_python_bin)" || return 1
  "$python_bin" -c 'import pypdfium2' >/dev/null 2>&1
}


pypdf_available() {
  local python_bin
  python_bin="$(fallback_python_bin)" || return 1
  "$python_bin" -c 'import pypdf' >/dev/null 2>&1
}


markitdown_available() {
  local unified_bin="${SPINOSA_VENDOR_DIR}-${PLATFORM}/markitdown-cli"
  markitdown_tool_available "$unified_bin" && return 0
  local framework_bin="${FRAMEWORK_ROOT:-.}/.bin/lib/vendor/spinosa-${PLATFORM}/markitdown-cli"
  markitdown_tool_available "$framework_bin" && return 0
  return 1
}


markitdown_bin() {
  local unified_bin="${SPINOSA_VENDOR_DIR}-${PLATFORM}/markitdown-cli"
  if [[ -x "$unified_bin" ]]; then echo "$unified_bin"; return; fi
  local framework_bin="${FRAMEWORK_ROOT:-.}/.bin/lib/vendor/spinosa-${PLATFORM}/markitdown-cli"
  if [[ -x "$framework_bin" ]]; then echo "$framework_bin"; return; fi
  return 1
}


bundled_python_bin() {
  local vendor_dir="${SPINOSA_VENDOR_DIR}-${PLATFORM}"
  local python_bin="${vendor_dir}/python/bin/python3"
  if [[ -x "$python_bin" ]]; then echo "$python_bin"; return; fi
  python_bin="${vendor_dir}/Python.framework/Versions/Current/bin/python3"
  if [[ -x "$python_bin" ]]; then echo "$python_bin"; return; fi
  return 1
}


fallback_python_bin() {
  local python_bin
  if python_bin="$(bundled_python_bin 2>/dev/null)"; then
    echo "$python_bin"
    return
  fi
  if command -v python3 >/dev/null 2>&1; then
    command -v python3
    return
  fi
  return 1
}


markitdown_script_path() {
  local script="${FRAMEWORK_ROOT:-.}/.bin/lib/markitdown-cli.py"
  [[ -f "$script" ]] || return 1
  echo "$script"
}


structured_fallback_available() {
  fallback_python_bin >/dev/null 2>&1 || return 1
  markitdown_script_path >/dev/null 2>&1 || return 1
}


installed_release_version() {
  local version
  version="$(framework_version "$FRAMEWORK_ROOT")"
  if [[ -n "$version" && "$version" != "dev" ]]; then
    echo "$version"
    return 0
  fi
  if [[ -d "${SPINOSA_HOME}/versions" ]]; then
    if sort -V /dev/null 2>/dev/null; then
      version="$(ls -1 "${SPINOSA_HOME}/versions" 2>/dev/null | sort -V | tail -1)"
    else
      version="$(ls -1 "${SPINOSA_HOME}/versions" 2>/dev/null | sort -t. -k1,1n -k2,2n -k3,3n | tail -1)"
    fi
    if [[ -n "$version" ]]; then
      echo "$version"
      return 0
    fi
  fi
  resolve_latest_release_version
}


verify_downloaded_asset() {
  local file="$1" filename="$2" checksums_file="$3"
  local expected actual
  expected="$(awk -v f="$filename" '$2 == f { print $1; exit }' "$checksums_file" 2>/dev/null || true)"
  [[ -n "$expected" ]] || die "${filename} not found in checksums file."
  actual="$(sha256_file "$file" 2>/dev/null || true)"
  [[ -n "$actual" ]] || die "No SHA-256 tool found. Cannot verify ${filename}."
  [[ "$actual" == "$expected" ]] || die "Checksum mismatch for ${filename}."
}


download_vendor_bundle_direct() {
  local version="$1" suffix="$PLATFORM"
  local base_url="https://github.com/${SPINOSA_REPO}/releases/download/v${version}"
  local vendor_name="spinosa-vendor-${suffix}.tar.gz"
  local vendor_url="${base_url}/${vendor_name}"
  local tmpdir vendor_tmp checksums extract_tmp vendor_dest

  tmpdir="$(mktemp -d "${TMPDIR:-/tmp}/spinosa-vendor-repair.XXXXXX")"
  vendor_tmp="${tmpdir}/${vendor_name}"
  checksums="${tmpdir}/checksums.txt"
  extract_tmp="${tmpdir}/extract"
  vendor_dest="${SPINOSA_VENDOR_DIR}-${suffix}"

  spinner_start "Downloading document tools vendor bundle"
  download_file "$vendor_url" "$vendor_tmp" >/dev/null 2>&1 || { spinner_stop; rm -rf "$tmpdir"; return 1; }
  download_file "${base_url}/checksums.txt" "$checksums" >/dev/null 2>&1 || { spinner_stop; rm -rf "$tmpdir"; return 1; }
  spinner_stop

  verify_downloaded_asset "$vendor_tmp" "$vendor_name" "$checksums"
  mkdir -p "$extract_tmp" "$(dirname "$vendor_dest")"
  safe_untar "$vendor_tmp" "$extract_tmp" --strip-components=1
  rm -rf "$vendor_dest" 2>/dev/null || true
  mv "$extract_tmp" "$vendor_dest"
  chmod +x "${vendor_dest}/markitdown-cli" "${vendor_dest}/rapidocr-cli" 2>/dev/null || true
  rm -rf "$tmpdir"
  ok "Document tools vendor bundle installed"
}


install_document_packages_direct() {
  local vendor_dir="${SPINOSA_VENDOR_DIR}-${PLATFORM}"
  local python_bin="${vendor_dir}/python/bin/python3"
  if [[ ! -x "$python_bin" ]]; then
    python_bin="${vendor_dir}/Python.framework/Versions/Current/bin/python3"
  fi
  [[ -x "$python_bin" ]] || return 1

  spinner_start "Installing document processing packages"
  "$python_bin" -m pip install --upgrade pip --quiet >/dev/null 2>&1 || true

  local pip_ok=0 onnx_ver pip_attempt
  for onnx_ver in 1.23.2 1.23.1 1.23.0 1.22.1 1.22.0; do
    pip_attempt=0
    while [[ "$pip_ok" -eq 0 && "$pip_attempt" -lt 2 ]]; do
      pip_attempt=$((pip_attempt + 1))
      if "$python_bin" -m pip install \
        "markitdown[all]==0.1.6" \
        "rapidocr==3.8.1" \
        "onnxruntime==${onnx_ver}" \
        "pypdfium2==5.9.0" \
        "pypdf" \
        --quiet >/dev/null 2>&1; then
        pip_ok=1
        break
      fi
      [[ "$pip_attempt" -lt 2 ]] && sleep 2
    done
    [[ "$pip_ok" -eq 1 ]] && break
  done
  spinner_stop

  [[ "$pip_ok" -eq 1 ]] || return 1

  if "$python_bin" -c 'from rapidocr import RapidOCR; import onnxruntime; import pypdfium2; from markitdown import MarkItDown; import pypdf' >/dev/null 2>&1; then
    ok "Document processing packages installed"
    return 0
  fi
  return 1
}


repair_document_tools_direct() {
  local version vendor_dir
  version="$(installed_release_version)" || return 1
  vendor_dir="${SPINOSA_VENDOR_DIR}-${PLATFORM}"
  if [[ ! -d "$vendor_dir" ]]; then
    note_cactus "Document processing tools not found — downloading vendor bundle"
    download_vendor_bundle_direct "$version" || return 1
  fi
  install_document_packages_direct || return 1
}


configure_selected_import_tools() {
  SCAN_MARKITDOWN_CHOICE="no"
  SCAN_OCR_CHOICE="no"

  local ext missing_markitdown=() missing_structured=() missing_ocr=() missing_pdf=0
  for ext in "${SELECTED_IMPORT_EXTENSIONS[@]-}"; do
    if ext_in_list "$ext" "$(markitdown_extension_list)"; then
      if markitdown_available; then
        SCAN_MARKITDOWN_CHOICE="yes"
      elif is_structured_fallback_ext "$ext" && structured_fallback_available; then
        SCAN_MARKITDOWN_CHOICE="yes"
      elif is_structured_fallback_ext "$ext"; then
        missing_structured+=(".$ext")
      else
        missing_markitdown+=(".$ext")
      fi
    elif [[ "$ext" == "pdf" ]]; then
      markitdown_available && SCAN_MARKITDOWN_CHOICE="yes"
      rapidocr_ocr_available && SCAN_OCR_CHOICE="yes"
      if ! markitdown_available && ! rapidocr_ocr_available; then
        missing_pdf=1
      fi
    elif ext_in_list "$ext" "$IMAGE_EXTENSIONS"; then
      if rapidocr_ocr_available; then
        SCAN_OCR_CHOICE="yes"
      else
        missing_ocr+=(".$ext")
      fi
    fi
  done

  if [[ ${#missing_markitdown[@]} -gt 0 ]]; then
    warn "MarkItDown is required for $(join_by ", " "${missing_markitdown[@]}") but is not available."
    note_wilted "Run: spinosa upgrade --reinstall"
    return 1
  fi
  if [[ ${#missing_structured[@]} -gt 0 ]]; then
    warn "Structured fallback conversion is required for $(join_by ", " "${missing_structured[@]}") but no usable Python runtime was found."
    note_wilted "Install bundled tools with: spinosa upgrade --reinstall"
    return 1
  fi
  if [[ ${#missing_ocr[@]} -gt 0 ]]; then
    warn "RapidOCR is required for $(join_by ", " "${missing_ocr[@]}") but is not available."
    note_wilted "Run: spinosa upgrade --reinstall"
    return 1
  fi
  if [[ "$missing_pdf" -eq 1 ]]; then
    warn "PDF import requires MarkItDown or RapidOCR, but neither converter is available."
    note_wilted "Run: spinosa upgrade --reinstall"
    return 1
  fi
  return 0
}


repair_vendor_tools() {
  [[ "${SPINOSA_NO_REPAIR:-0}" != "1" ]] || return 0
  local needs_repair=0 pkgs=() vendor_dir="${SPINOSA_VENDOR_DIR}-${PLATFORM}"
  if ! markitdown_available; then needs_repair=1; pkgs+=("markitdown"); fi
  if ! rapidocr_ocr_available; then needs_repair=1; pkgs+=("rapidocr"); fi
  [[ "$needs_repair" -eq 1 ]] || return 0

  echo ""
  note_cactus "$(join_by " and " "${pkgs[@]}") not available — repairing document tools"
  if repair_document_tools_direct && markitdown_available && rapidocr_ocr_available; then
    ok "Document processing tools ready"
  else
    note_wilted "Repair did not make all document tools available — check network or run: spinosa upgrade --reinstall"
  fi
}



is_rapidocr_image() {
  local ext
  ext="$(file_ext "$1")"
  [[ -n "$ext" ]] && ext_in_list "$ext" "$IMAGE_EXTENSIONS"
}


is_rapidocr_pdf() {
  local ext
  ext="$(file_ext "$1")"
  [[ -n "$ext" ]] && ext_in_list "$ext" "pdf"
}

# ── Image File Detection ──────────────────────────────────────────────────────


