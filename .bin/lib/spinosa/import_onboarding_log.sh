# shellcheck shell=bash
# Onboarding import trace (.lgo) and post-copy verification with recovery.

ONBOARDING_LOG_PATH=""
COPY_VERIFY_MISSING_COUNT=0
COPY_VERIFY_RECOVERED_RETRY_COUNT=0
COPY_VERIFY_RECOVERED_COPY_COUNT=0
COPY_VERIFY_STILL_MISSING_COUNT=0

onboarding_log_path_for() {
  local root="$1"
  printf '%s/logs/onboarding.lgo' "$root"
}

onboarding_log_init() {
  local root="$1" flow="${2:-onboarding}" source_path="${3:-}"
  ONBOARDING_LOG_PATH="$(onboarding_log_path_for "$root")"
  mkdir -p "$(dirname "$ONBOARDING_LOG_PATH")"
  {
    printf '[%s] flow=%s event=session_start root=%s source=%s\n' \
      "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$flow" "$root" "$source_path"
  } >> "$ONBOARDING_LOG_PATH"
}

onboarding_log_event() {
  local phase="$1" event="$2"
  shift 2
  [[ -n "${ONBOARDING_LOG_PATH:-}" ]] || return 0
  local ts line
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  line="[$ts] phase=${phase} event=${event}"
  while [[ $# -gt 0 ]]; do
    line="${line} ${1}"
    shift
  done
  printf '%s\n' "$line" >> "$ONBOARDING_LOG_PATH"
}

onboarding_log_import_options() {
  local source_path="${1:-}" flag_extensions="${2:-}"
  [[ -n "${ONBOARDING_LOG_PATH:-}" ]] || return 0
  local ext_label cloud="no"
  ext_label="$(selected_import_extensions_label 2>/dev/null || echo "none")"
  [[ -n "$source_path" ]] && is_cloud_storage_path "$source_path" && cloud="yes"
  onboarding_log_event "options" "configured" \
    "selected_extensions=${ext_label}" \
    "flag_extensions=${flag_extensions:-}" \
    "markitdown=${SCAN_MARKITDOWN_CHOICE:-no}" \
    "ocr=${SCAN_OCR_CHOICE:-no}" \
    "cloud_source=${cloud}" \
    "selected_count=$(selected_import_count 2>/dev/null || echo 0)"
}

onboarding_log_scan_summary() {
  [[ -n "${ONBOARDING_LOG_PATH:-}" ]] || return 0
  onboarding_log_event "scan" "complete" \
    "total=${SCAN_TOTAL_COUNT:-0}" \
    "markdown=${SCAN_MARKDOWN_COUNT:-0}" \
    "markitdown=${SCAN_MARKITDOWN_COUNT:-0}" \
    "native=${SCAN_NATIVE_COUNT:-0}" \
    "ocr_convertible=${SCAN_OCR_CONVERTIBLE_COUNT:-0}" \
    "video=${SCAN_VIDEO_COUNT:-0}" \
    "audio=${SCAN_AUDIO_COUNT:-0}" \
    "unknown=${SCAN_UNKNOWN_COUNT:-0}" \
    "ignored=${SCAN_IGNORED_COUNT:-0}"
}

onboarding_log_copy_summary() {
  [[ -n "${ONBOARDING_LOG_PATH:-}" ]] || return 0
  onboarding_log_event "copy" "complete" \
    "total=${COPY_TOTAL_COUNT:-0}" \
    "imported=${COPY_IMPORTED_COUNT:-0}" \
    "copied=${COPY_COPIED_COUNT:-0}" \
    "skipped=${COPY_SKIPPED_COUNT:-0}" \
    "failed=${COPY_FAILED_COUNT:-0}" \
    "markitdown_converted=${COPY_MARKITDOWN_CONVERTED_COUNT:-0}" \
    "markitdown_skipped=${COPY_MARKITDOWN_SKIPPED_COUNT:-0}" \
    "ocr_converted=${COPY_OCR_CONVERTED_COUNT:-0}" \
    "ocr_skipped=${COPY_OCR_SKIPPED_COUNT:-0}"
}

onboarding_log_verify_summary() {
  [[ -n "${ONBOARDING_LOG_PATH:-}" ]] || return 0
  onboarding_log_event "verify" "complete" \
    "missing=${COPY_VERIFY_MISSING_COUNT:-0}" \
    "recovered_retry=${COPY_VERIFY_RECOVERED_RETRY_COUNT:-0}" \
    "recovered_copy=${COPY_VERIFY_RECOVERED_COPY_COUNT:-0}" \
    "still_missing=${COPY_VERIFY_STILL_MISSING_COUNT:-0}"
}

retry_markitdown_single() {
  local src_file="$1" dest_file="$2"
  local _md_bin="" _md_python="" _md_script="" _md_fifo_dir _md_fifo _md_status="fail"
  _md_bin="$(markitdown_bin)" || _md_bin=""
  if [[ -z "$_md_bin" ]]; then
    _md_python="$(fallback_python_bin)" || return 1
    _md_script="$(markitdown_script_path)" || return 1
  fi
  _md_fifo_dir="$(mktemp -d)"
  _md_fifo="${_md_fifo_dir}/fifo"
  mkfifo "$_md_fifo" 2>/dev/null || { rm -rf "$_md_fifo_dir"; return 1; }
  mkdir -p "$(dirname "$dest_file")"
  remove_converted_output "$dest_file"
  (
    printf '%s\t%s\n' SOURCE "$(dirname "$src_file")"
    printf '%s\t%s\t%s\n' FILE "$src_file" "$dest_file"
  ) | if [[ -n "$_md_bin" ]]; then
        "$_md_bin" --batch
      else
        "$_md_python" "$_md_script" --batch
      fi 2>"$_md_fifo" &
  local _md_pid=$!
  exec 3<"$_md_fifo"
  while IFS= read -r -t 120 -u 3 _line; do
    if [[ "$_line" == END* ]]; then
      local _rest="${_line#END$'\t'}"
      local _end_status="${_rest%%$'\t'*}"
      [[ "$_end_status" == "ok" ]] && _md_status="ok"
    fi
  done
  exec 3<&-
  wait "$_md_pid" 2>/dev/null || true
  rm -rf "$_md_fifo_dir"
  [[ "$_md_status" == "ok" ]] && converted_output_exists "$dest_file"
}

retry_ocr_single() {
  local src_file="$1" dest_file="$2"
  local _ocr_bin _ocr_fifo_dir _ocr_fifo _ocr_status="fail"
  _ocr_bin="$(rapidocr_ocr_bin)" || return 1
  _ocr_fifo_dir="$(mktemp -d)"
  _ocr_fifo="${_ocr_fifo_dir}/fifo"
  mkfifo "$_ocr_fifo" 2>/dev/null || { rm -rf "$_ocr_fifo_dir"; return 1; }
  mkdir -p "$(dirname "$dest_file")"
  remove_converted_output "$dest_file"
  (
    printf '%s\t%s\n' SOURCE "$(dirname "$src_file")"
    printf '%s\t%s\t%s\n' FILE "$src_file" "$dest_file"
  ) | "$_ocr_bin" --batch 2>"$_ocr_fifo" &
  local _ocr_pid=$!
  exec 4<"$_ocr_fifo"
  while IFS= read -r -t 300 -u 4 _line; do
    if [[ "$_line" == END* ]]; then
      local _rest="${_line#END$'\t'}"
      local _end_status="${_rest%%$'\t'*}"
      [[ "$_end_status" == "ok" ]] && _ocr_status="ok"
    fi
  done
  exec 4<&-
  wait "$_ocr_pid" 2>/dev/null || true
  rm -rf "$_ocr_fifo_dir"
  [[ "$_ocr_status" == "ok" ]] && converted_output_exists "$dest_file"
}

recover_missing_import_file() {
  local source_path="$1" dest_dir="$2" src_file="$3" expected_rel="$4" route="$5"
  local dest_file="$dest_dir/$expected_rel" rel_path="${src_file#"$source_path"/}"
  local fallback_dest="$dest_dir/$rel_path"

  case "$route" in
    markdown_rename|native_copy|media_copy|binary_copy)
      mkdir -p "$(dirname "$dest_file")"
      if safe_copy "$src_file" "$dest_file"; then
        [[ "$dest_file" == *.md ]] && inject_cold_frontmatter "$dest_file"
        onboarding_log_event "verify" "recovered" "method=direct_copy" "source=${rel_path}" "dest=${expected_rel}"
        COPY_VERIFY_RECOVERED_COPY_COUNT=$((COPY_VERIFY_RECOVERED_COPY_COUNT + 1))
        return 0
      fi
      ;;
    markitdown)
      if retry_markitdown_single "$src_file" "$dest_file"; then
        inject_cold_frontmatter "$dest_file"
        onboarding_log_event "verify" "recovered" "method=markitdown_retry" "source=${rel_path}" "dest=${expected_rel}"
        COPY_VERIFY_RECOVERED_RETRY_COUNT=$((COPY_VERIFY_RECOVERED_RETRY_COUNT + 1))
        return 0
      fi
      mkdir -p "$(dirname "$fallback_dest")"
      if safe_copy "$src_file" "$fallback_dest"; then
        onboarding_log_event "verify" "recovered" "method=source_copy_fallback" "source=${rel_path}" "dest=${rel_path}" "note=markitdown_retry_failed"
        COPY_VERIFY_RECOVERED_COPY_COUNT=$((COPY_VERIFY_RECOVERED_COPY_COUNT + 1))
        return 0
      fi
      ;;
    ocr)
      if retry_ocr_single "$src_file" "$dest_file"; then
        inject_cold_frontmatter "$dest_file"
        onboarding_log_event "verify" "recovered" "method=ocr_retry" "source=${rel_path}" "dest=${expected_rel}"
        COPY_VERIFY_RECOVERED_RETRY_COUNT=$((COPY_VERIFY_RECOVERED_RETRY_COUNT + 1))
        return 0
      fi
      mkdir -p "$(dirname "$fallback_dest")"
      if safe_copy "$src_file" "$fallback_dest"; then
        onboarding_log_event "verify" "recovered" "method=source_copy_fallback" "source=${rel_path}" "dest=${rel_path}" "note=ocr_retry_failed"
        COPY_VERIFY_RECOVERED_COPY_COUNT=$((COPY_VERIFY_RECOVERED_COPY_COUNT + 1))
        return 0
      fi
      ;;
  esac
  onboarding_log_event "verify" "still_missing" "source=${rel_path}" "expected=${expected_rel}" "route=${route}"
  COPY_VERIFY_STILL_MISSING_COUNT=$((COPY_VERIFY_STILL_MISSING_COUNT + 1))
  return 1
}

verify_and_recover_import() {
  local source_path="$1" dest_dir="$2"
  local missing=0 recovered=0 still_missing=0
  local src_file rel_path expected_rel route dest_file

  COPY_VERIFY_MISSING_COUNT=0
  COPY_VERIFY_RECOVERED_RETRY_COUNT=0
  COPY_VERIFY_RECOVERED_COPY_COUNT=0
  COPY_VERIFY_STILL_MISSING_COUNT=0

  onboarding_log_event "verify" "start" "source=${source_path}" "dest=${dest_dir}"

  while IFS= read -r -d '' src_file; do
    should_skip_source_file "$src_file" && continue
    import_extension_selected "$(file_ext "$src_file")" || continue
    route="$(import_route_for_file "$src_file")" || continue
    expected_rel="$(expected_import_dest_rel "$source_path" "$src_file")" || continue
    dest_file="$dest_dir/$expected_rel"
    if import_output_exists "$dest_dir" "$expected_rel"; then
      continue
    fi
    rel_path="${src_file#"$source_path"/}"
    missing=$((missing + 1))
    COPY_VERIFY_MISSING_COUNT=$((COPY_VERIFY_MISSING_COUNT + 1))
    onboarding_log_event "verify" "missing" "source=${rel_path}" "expected=${expected_rel}" "route=${route}"
    if recover_missing_import_file "$source_path" "$dest_dir" "$src_file" "$expected_rel" "$route"; then
      recovered=$((recovered + 1))
    else
      still_missing=$((still_missing + 1))
    fi
  done < <(find_source_files "$source_path")

  onboarding_log_verify_summary

  if [[ "$missing" -gt 0 ]]; then
    printf '\n'
    if [[ "$recovered" -gt 0 ]]; then
      info "Import verification: ${missing} missing, ${recovered} recovered (${COPY_VERIFY_RECOVERED_RETRY_COUNT} reprocessed, ${COPY_VERIFY_RECOVERED_COPY_COUNT} copied)"
    fi
    if [[ "$still_missing" -gt 0 ]]; then
      warn "Import verification: ${still_missing} file(s) still missing in raw/ — see logs/onboarding.lgo"
    fi
  fi

  COPY_IMPORTED_COUNT=$(( ${COPY_IMPORTED_COUNT:-0} + COPY_VERIFY_RECOVERED_RETRY_COUNT + COPY_VERIFY_RECOVERED_COPY_COUNT ))
  return 0
}

verify_single_import_file() {
  local source_path="$1" dest_dir="$2" src_file="$3"
  local expected_rel route rel_path

  route="$(import_route_for_file "$src_file")" || return 0
  expected_rel="$(expected_import_dest_rel "$source_path" "$src_file")" || return 0
  rel_path="${src_file#"$source_path"/}"
  import_output_exists "$dest_dir" "$expected_rel" && return 0

  COPY_VERIFY_MISSING_COUNT=$((COPY_VERIFY_MISSING_COUNT + 1))
  onboarding_log_event "verify" "missing" "source=${rel_path}" "expected=${expected_rel}" "route=${route}"
  recover_missing_import_file "$source_path" "$dest_dir" "$src_file" "$expected_rel" "$route"
  onboarding_log_verify_summary
}

assert_import_delivered() {
  local source_path="$1" dest_dir="$2"
  local imported="${COPY_IMPORTED_COUNT:-0}"
  local still_missing="${COPY_VERIFY_STILL_MISSING_COUNT:-0}"
  local failed="${COPY_FAILED_COUNT:-0}"
  local expected
  expected="$(selected_import_count 2>/dev/null || echo 0)"

  if [[ "$imported" -gt 0 && "$still_missing" -eq 0 ]]; then
    onboarding_log_event "import" "delivered" "imported=${imported}" "expected=${expected}"
    return 0
  fi

  if [[ "$imported" -gt 0 && "$still_missing" -gt 0 ]]; then
    onboarding_log_event "import" "partial" "imported=${imported}" "expected=${expected}" "still_missing=${still_missing}"
    warn "Only ${imported} of ${expected} selected file(s) reached raw/ — ${still_missing} still missing."
    note "See logs/onboarding.lgo for per-file details."
    return 1
  fi

  onboarding_log_event "import" "blocked" "reason=zero_delivered" "expected=${expected}" "failed=${failed}" "still_missing=${still_missing}"
  warn "No files were imported into raw/ (${expected} were selected)."
  if [[ "$failed" -gt 0 ]]; then
    note "Copy failures (${failed}) — ensure cloud files are synced locally, then retry."
  elif [[ "${SCAN_OCR_CONVERTIBLE_COUNT:-0}" -gt 0 && "${SCAN_OCR_CHOICE:-no}" != "yes" ]]; then
    note "Scanned PDFs and images in this corpus need RapidOCR."
  fi
  note "See logs/onboarding.lgo for details."
  return 1
}