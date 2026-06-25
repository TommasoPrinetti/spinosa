# shellcheck shell=bash
# Source scanning summaries and onboarding preflight checks.

scan_source() {
  local source_path="$1" f class size spin=0 frame ext
  reset_import_batches
  SCAN_TOTAL_COUNT=0
  SCAN_MARKDOWN_COUNT=0
  SCAN_MARKITDOWN_COUNT=0
  SCAN_NATIVE_COUNT=0
  SCAN_BINARY_COPYABLE_COUNT=0
  SCAN_OCR_CONVERTIBLE_COUNT=0
  SCAN_VIDEO_COUNT=0
  SCAN_AUDIO_COUNT=0
  SCAN_UNKNOWN_COUNT=0
  SCAN_IGNORED_COUNT=0
  SCAN_MARKDOWN_BYTES=0
  SCAN_MARKITDOWN_BYTES=0
  SCAN_NATIVE_BYTES=0
  SCAN_BINARY_COPYABLE_BYTES=0
  SCAN_OCR_CONVERTIBLE_BYTES=0
  SCAN_VIDEO_BYTES=0
  SCAN_AUDIO_BYTES=0
  SCAN_UNKNOWN_BYTES=0

  printf '\n'
  while IFS= read -r -d '' f; do
    class="$(classify_source_file "$f")"
    if [[ "$class" != "ignored" ]]; then
      SCAN_TOTAL_COUNT=$((SCAN_TOTAL_COUNT + 1))
      size="$(file_size_bytes "$f")"
      frame="$(spinner_frame "$spin")"
      local scan_label_width=$((COLS - 16))
      (( scan_label_width < 8 )) && scan_label_width=8
      render_progress_line "  ${C}${frame}${RESET} ${DIM}scanning${RESET} $(truncate_display_path "$f" "$scan_label_width")"
      spin=$((spin + 1))
    else
      size=0
    fi
    case "$class" in
      markdown)
        SCAN_MARKDOWN_COUNT=$((SCAN_MARKDOWN_COUNT + 1))
        SCAN_MARKDOWN_BYTES=$((SCAN_MARKDOWN_BYTES + size))
        ext="$(file_ext "$f")"
        [[ -n "$ext" ]] && record_import_batch "$ext" "$size"
        ;;
      markitdown)
        SCAN_MARKITDOWN_COUNT=$((SCAN_MARKITDOWN_COUNT + 1))
        SCAN_MARKITDOWN_BYTES=$((SCAN_MARKITDOWN_BYTES + size))
        ext="$(file_ext "$f")"
        [[ -n "$ext" ]] && record_import_batch "$ext" "$size"
        ;;
      native)
        SCAN_NATIVE_COUNT=$((SCAN_NATIVE_COUNT + 1))
        SCAN_NATIVE_BYTES=$((SCAN_NATIVE_BYTES + size))
        ext="$(file_ext "$f")"
        [[ -n "$ext" ]] && record_import_batch "$ext" "$size"
        ;;
      binary_copyable) SCAN_BINARY_COPYABLE_COUNT=$((SCAN_BINARY_COPYABLE_COUNT + 1)); SCAN_BINARY_COPYABLE_BYTES=$((SCAN_BINARY_COPYABLE_BYTES + size)) ;;
      ocr_convertible)
        SCAN_OCR_CONVERTIBLE_COUNT=$((SCAN_OCR_CONVERTIBLE_COUNT + 1))
        SCAN_OCR_CONVERTIBLE_BYTES=$((SCAN_OCR_CONVERTIBLE_BYTES + size))
        ext="$(file_ext "$f")"
        [[ -n "$ext" ]] && record_import_batch "$ext" "$size"
        ;;
      video)
        SCAN_VIDEO_COUNT=$((SCAN_VIDEO_COUNT + 1))
        SCAN_VIDEO_BYTES=$((SCAN_VIDEO_BYTES + size))
        ext="$(file_ext "$f")"
        [[ -n "$ext" ]] && record_import_batch "$ext" "$size"
        ;;
      audio)
        SCAN_AUDIO_COUNT=$((SCAN_AUDIO_COUNT + 1))
        SCAN_AUDIO_BYTES=$((SCAN_AUDIO_BYTES + size))
        ext="$(file_ext "$f")"
        [[ -n "$ext" ]] && record_import_batch "$ext" "$size"
        ;;
      unknown) SCAN_UNKNOWN_COUNT=$((SCAN_UNKNOWN_COUNT + 1)); SCAN_UNKNOWN_BYTES=$((SCAN_UNKNOWN_BYTES + size)) ;;
      ignored) SCAN_IGNORED_COUNT=$((SCAN_IGNORED_COUNT + 1)) ;;
    esac
  done < <(find_source_files "$source_path")
  sort_import_batches
  select_all_import_batches
  [[ -t 2 ]] && printf '\r\033[2K' >&2
  return 0
}

print_scan_summary() {
  local _scan_first=0

  _scan_print_row() {
    [[ "$_scan_first" -eq 1 ]] || tree_sep
    _scan_first=1
    tree_row "$1" "$2"
  }

  tree_row "Source scan" "complete"

  # Copy-first: files that don't need conversion
  [[ "$SCAN_NATIVE_COUNT" -gt 0 ]] && _scan_print_row "$(file_type_label native "$(plural_count "$SCAN_NATIVE_COUNT" "native-readable file")") to copy unchanged" "$(format_bytes "$SCAN_NATIVE_BYTES")"
  [[ "$SCAN_BINARY_COPYABLE_COUNT" -gt 0 ]] && _scan_print_row "$(file_type_label pdf "$(plural_count "$SCAN_BINARY_COPYABLE_COUNT" "PDF")") to copy as-is" "$(format_bytes "$SCAN_BINARY_COPYABLE_BYTES")"

  # Convert-first: files that need conversion tools
  [[ "$SCAN_MARKDOWN_COUNT" -gt 0 ]] && _scan_print_row "$(file_type_label markdown "$(plural_count "$SCAN_MARKDOWN_COUNT" "text-based file")") to rename to .md" "$(format_bytes "$SCAN_MARKDOWN_BYTES")"
  if [[ "$SCAN_MARKITDOWN_COUNT" -gt 0 ]]; then
    if markitdown_available; then
      _scan_print_row "$(file_type_label markitdown "$(plural_count "$SCAN_MARKITDOWN_COUNT" "MarkItDown/structured file")") available for Markdown conversion" "$(format_bytes "$SCAN_MARKITDOWN_BYTES")"
    elif structured_fallback_available; then
      _scan_print_row "$(file_type_label markitdown "$(plural_count "$SCAN_MARKITDOWN_COUNT" "MarkItDown/structured file")") available only for csv/json/xml fallback" "$(format_bytes "$SCAN_MARKITDOWN_BYTES")"
    else
      _scan_print_row "$(file_type_label markitdown "$(plural_count "$SCAN_MARKITDOWN_COUNT" "MarkItDown/structured file")") skipped — converter not available" "$(format_bytes "$SCAN_MARKITDOWN_BYTES")"
    fi
  fi
  if [[ "$SCAN_OCR_CONVERTIBLE_COUNT" -gt 0 ]]; then
    if rapidocr_ocr_available; then
      _scan_print_row "$(file_type_label image "$(plural_count "$SCAN_OCR_CONVERTIBLE_COUNT" "scanned PDF and image")") available for OCR" "$(format_bytes "$SCAN_OCR_CONVERTIBLE_BYTES")"
    else
      _scan_print_row "$(file_type_label image "$(plural_count "$SCAN_OCR_CONVERTIBLE_COUNT" "scanned PDF and image")") skipped — RapidOCR not available" "$(format_bytes "$SCAN_OCR_CONVERTIBLE_BYTES")"
    fi
  fi

  # Skip/optional: files not processed (or unselected by default)
  [[ "$SCAN_VIDEO_COUNT" -gt 0 ]] && _scan_print_row "$(file_type_label video "$(plural_count "$SCAN_VIDEO_COUNT" "video")") available (not selected by default)" "$(format_bytes "$SCAN_VIDEO_BYTES")"
  [[ "$SCAN_AUDIO_COUNT" -gt 0 ]] && _scan_print_row "$(file_type_label audio "$(plural_count "$SCAN_AUDIO_COUNT" "audio file")") available (not selected by default)" "$(format_bytes "$SCAN_AUDIO_BYTES")"
  [[ "$SCAN_UNKNOWN_COUNT" -gt 0 ]] && _scan_print_row "$(file_type_label unknown "$(plural_count "$SCAN_UNKNOWN_COUNT" "file")") unsupported or unknown" "$(format_bytes "$SCAN_UNKNOWN_BYTES")"
  if [[ "$SCAN_IGNORED_COUNT" -gt 0 ]]; then
    _scan_print_row "$(file_type_label ignored "$(plural_count "$SCAN_IGNORED_COUNT" "file")") skipped — system/dotfile" "0 B"
  fi
}

scan_copyable_bytes() {
  printf '%d' "$(selected_import_bytes)"
}

print_onboarding_preflight() {
  local root="$1"
  local raw_dir="$root/raw"
  local free_bytes cli_output
  local cli_labels=()

  [[ -d "$raw_dir" ]] || die "Workspace raw/ directory is missing: $raw_dir"
  [[ -w "$raw_dir" ]] || die "Workspace raw/ directory is not writable: $raw_dir"

  # Determine last item for └─ rendering
  free_bytes="$(available_disk_bytes "$root")"
  cli_output="$(detect_llm_clis)"
  while IFS= read -r line; do
    [[ -n "$line" ]] && cli_labels+=("$line")
  done <<< "$cli_output"
  local _last_is_tools=0 _last_is_free=0
  [[ ${#cli_labels[@]} -gt 0 ]] && _last_is_tools=1
  [[ "$_last_is_tools" -eq 0 && "$free_bytes" -gt 0 ]] && _last_is_free=1

  local _fn="tree_row"
  tree_row "Workspace" "writable" "${BOLD}$(display_path "$root")${RESET}"
  repair_vendor_tools
  if rapidocr_ocr_available; then
    tree_sep; tree_row "${M}RapidOCR${RESET}" "available" "scanned PDFs and images"
  else
    tree_sep; tree_row "${R}RapidOCR${RESET}" "missing" "scanned PDFs and images skipped" >&2
  fi
  if markitdown_available; then
    tree_sep; tree_row "MarkItDown" "available" "Office docs, structured data, EPUB, HTML, text PDFs"
  elif structured_fallback_available; then
    tree_sep; tree_row "MarkItDown" "fallback" "CSV, JSON, and XML use built-in Markdown"
  else
    tree_sep; tree_row "${R}MarkItDown${RESET}" "missing" "Office docs, EPUB, HTML, and text PDFs skipped" >&2
  fi
  if pypdfium2_available; then
    tree_sep; tree_row "${C}pypdfium2${RESET}" "available" "scanned PDF rendering"
  else
    tree_sep; tree_row "${R}pypdfium2${RESET}" "missing" "scanned PDF rendering unavailable" >&2
  fi
  if pypdf_available; then
    tree_sep
    if [[ "$_last_is_free" -eq 0 && "$_last_is_tools" -eq 0 ]]; then
      tree_row_last "${C}pypdf${RESET}" "available" "text PDF splitting"
    else
      tree_row "${C}pypdf${RESET}" "available" "text PDF splitting"
    fi
  else
    tree_sep
    if [[ "$_last_is_free" -eq 0 && "$_last_is_tools" -eq 0 ]]; then
      tree_row_last "${R}pypdf${RESET}" "missing" "multi-page text PDFs not split" >&2
    else
      tree_row "${R}pypdf${RESET}" "missing" "multi-page text PDFs not split" >&2
    fi
  fi

  if [[ "$free_bytes" -gt 0 ]]; then
    tree_sep
    if [[ "$_last_is_tools" -eq 0 ]]; then
      tree_row_last "Free space" "$(format_bytes "$free_bytes")"
    else
      tree_row "Free space" "$(format_bytes "$free_bytes")"
    fi
  fi

  if [[ ${#cli_labels[@]} -gt 0 ]]; then
    tree_sep
    tree_row_last "Tools" "$(join_by ", " "${cli_labels[@]}")"
  fi
}
