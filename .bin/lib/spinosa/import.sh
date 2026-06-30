# shellcheck shell=bash
# Source file classification and import batch selection.
#
# Initialized at file scope so they're safe under set -u even if reset_import_batches() hasn't run yet
IMPORT_BATCH_EXTENSIONS=()
IMPORT_BATCH_COUNTS=()
IMPORT_BATCH_BYTES=()

should_skip_source_file() {
  local name lower_name
  is_tcc_sensitive_source_path "$1" && return 0
  name="$(basename "$1")"
  lower_name="$(printf '%s' "$name" | tr '[:upper:]' '[:lower:]')"
  [[ "$lower_name" == "agents.md" ]] && return 0
  case "$1" in
    */.DS_Store|*/._*|*/.localized|*/__MACOSX/*|*/.gitkeep|*/node_modules/*|*/.git/*) return 0 ;;
    *) return 1 ;;
  esac
}



is_tcc_sensitive_source_path() {
  local path="${1%/}"
  case "$path" in
    /System|/System/*|/private|/private/*|*.app|*.app/*|*.photoslibrary|*.photoslibrary/*) return 0 ;;
  esac
  if [[ -n "${HOME:-}" ]]; then
    case "$path" in
      "$HOME/Music"|"$HOME/Music"/*|\
      "$HOME/Library/Calendar"|"$HOME/Library/Calendar"/*|\
      "$HOME/Library/Calendars"|"$HOME/Library/Calendars"/*|\
      "$HOME/Library/Mail"|"$HOME/Library/Mail"/*|\
      "$HOME/Library/Messages"|"$HOME/Library/Messages"/*|\
      "$HOME/Library/Safari"|"$HOME/Library/Safari"/*|\
      "$HOME/Pictures/Photos Library.photoslibrary"|"$HOME/Pictures/Photos Library.photoslibrary"/*) return 0 ;;
    esac
  fi
  return 1
}



find_source_files() {
  local source_path="$1"
  find "$source_path" \
    \( \
      -path /System -o -path '/System/*' -o \
      -path /private -o -path '/private/*' -o \
      -path "$HOME/Music" -o -path "$HOME/Music/*" -o \
      -path "$HOME/Library/Calendar" -o -path "$HOME/Library/Calendar/*" -o \
      -path "$HOME/Library/Calendars" -o -path "$HOME/Library/Calendars/*" -o \
      -path "$HOME/Library/Mail" -o -path "$HOME/Library/Mail/*" -o \
      -path "$HOME/Library/Messages" -o -path "$HOME/Library/Messages/*" -o \
      -path "$HOME/Library/Safari" -o -path "$HOME/Library/Safari/*" -o \
      -path "$HOME/Pictures/Photos Library.photoslibrary" -o -path "$HOME/Pictures/Photos Library.photoslibrary/*" -o \
      -name '*.app' -o -name '*.photoslibrary' \
    \) -prune -o -type f -print0 2>/dev/null
}



file_ext() {
  local name ext
  name="$(basename "$1")"
  [[ "$name" == *.* ]] || { echo ""; return; }
  ext="${name##*.}"
  printf '%s' "$ext" | tr '[:upper:]' '[:lower:]'
}



ext_in_list() {
  local ext="$1" list="$2"
  case "|$list|" in
    *"|$ext|"*) return 0 ;;
    *) return 1 ;;
  esac
}



is_markdown_convertible_file() { local ext; ext="$(file_ext "$1")"; [[ -n "$ext" ]] && ext_in_list "$ext" "$MARKDOWN_EXTENSIONS"; }


is_native_readable_file() { local ext; ext="$(file_ext "$1")"; [[ -n "$ext" ]] && ext_in_list "$ext" "$NATIVE_EXTENSIONS"; }


is_binary_copyable_file() { local ext; ext="$(file_ext "$1")"; [[ -n "$ext" ]] && ext_in_list "$ext" "$BINARY_COPYABLE_EXTENSIONS"; }


markitdown_extension_list() {
  local list="$MARKITDOWN_EXTENSIONS" raw item
  raw="${SPINOSA_MARKITDOWN_EXTRA_EXTENSIONS:-}"
  raw="${raw//,/|}"
  raw="${raw// /}"
  while [[ "$raw" == *"||"* ]]; do raw="${raw//||/|}"; done
  raw="${raw#|}"
  raw="${raw%|}"
  if [[ -n "$raw" ]]; then
    IFS='|' read -ra _spinosa_extra_md_exts <<< "$raw"
    for item in "${_spinosa_extra_md_exts[@]}"; do
      item="${item#.}"
      [[ -n "$item" ]] || continue
      ext_in_list "$item" "$list" || list="${list}|${item}"
    done
  fi
  printf '%s' "$list"
}


is_markitdown_convertible_file() { local ext; ext="$(file_ext "$1")"; [[ -n "$ext" ]] && ext_in_list "$ext" "$(markitdown_extension_list)"; }


is_structured_fallback_ext() { local ext="$1"; [[ -n "$ext" ]] && ext_in_list "$ext" "$STRUCTURED_FALLBACK_EXTENSIONS"; }

# ── PDF classification (text-based vs scanned) ──────────────────────────────



is_text_based_pdf() {
  local pdf="$1"
  [[ "$(file_ext "$pdf")" == "pdf" ]] || return 1

  # Tier 1: Reject encrypted PDFs — /Font keys visible but content unreadable
  if grep -q -a -m1 -F '/Encrypt' "$pdf" 2>/dev/null; then
    return 1   # → OCR
  fi

  # Tier 2: Quick scan of first 256 KB for /Font or /CIDFont dictionaries
  if head -c 262144 "$pdf" 2>/dev/null | grep -q -a -E '/(Font|CIDFont)\b' 2>/dev/null; then
    return 0   # → MarkItDown
  fi

  # Tier 3: Full scan for late-appearing font dictionaries
  if grep -q -a -m1 -E '/(Font|CIDFont)\b' "$pdf" 2>/dev/null; then
    return 0   # → MarkItDown
  fi

  # Tier 4: pdftotext first-page fallback (handles ObjStm-compressed dicts)
  if command -v pdftotext >/dev/null 2>&1; then
    local text_sample
    text_sample="$(pdftotext -l 1 -q "$pdf" - 2>/dev/null | tr -d '[:space:]' | head -c 1)"
    [[ -n "$text_sample" ]] && return 0
  fi

  return 1  # → OCR (scanned / image-based)
}

# ── Centralized engine routing ──────────────────────────────────────────────



markdown_raw_rel_path() {
  local rel_path="$1" name dir stem ext
  name="$(basename "$rel_path")"
  dir="$(dirname "$rel_path")"
  ext="$(file_ext "$rel_path")"
  [[ "$ext" == "md" ]] && { echo "$rel_path"; return; }
  stem="${name%.*}"
  if [[ "$dir" == "." ]]; then
    echo "${stem}__${ext}.md"
  else
    echo "${dir}/${stem}__${ext}.md"
  fi
}



converted_output_exists() {
  local output_path="$1" page_dir="$1"
  if [[ "$page_dir" == *.md ]]; then
    page_dir="${page_dir%.md}"
  else
    page_dir="${page_dir}_pages"
  fi
  [[ -f "$output_path" || -d "$page_dir" ]]
}



remove_converted_output() {
  local output_path="$1" page_dir="$1"
  if [[ "$page_dir" == *.md ]]; then
    page_dir="${page_dir%.md}"
  else
    page_dir="${page_dir}_pages"
  fi
  rm -f "$output_path" 2>/dev/null || true
  rm -rf "$page_dir" 2>/dev/null || true
}



reset_import_batches() {
  IMPORT_BATCH_EXTENSIONS=()
  IMPORT_BATCH_COUNTS=()
  IMPORT_BATCH_BYTES=()
  SELECTED_IMPORT_EXTENSIONS=()
}



import_batch_index() {
  local ext="$1" i
  for i in "${!IMPORT_BATCH_EXTENSIONS[@]}"; do
    [[ "${IMPORT_BATCH_EXTENSIONS[$i]}" == "$ext" ]] && { printf '%s' "$i"; return 0; }
  done
  return 1
}



record_import_batch() {
  local ext="$1" size="$2" idx=""
  idx="$(import_batch_index "$ext" 2>/dev/null || true)"
  if [[ -n "$idx" ]]; then
    IMPORT_BATCH_COUNTS[$idx]=$((IMPORT_BATCH_COUNTS[$idx] + 1))
    IMPORT_BATCH_BYTES[$idx]=$((IMPORT_BATCH_BYTES[$idx] + size))
  else
    IMPORT_BATCH_EXTENSIONS+=("$ext")
    IMPORT_BATCH_COUNTS+=("1")
    IMPORT_BATCH_BYTES+=("$size")
  fi
}



sort_import_batches() {
  local i j tmp_ext tmp_count tmp_bytes
  for ((i = 1; i < ${#IMPORT_BATCH_EXTENSIONS[@]}; i++)); do
    tmp_ext="${IMPORT_BATCH_EXTENSIONS[$i]}"
    tmp_count="${IMPORT_BATCH_COUNTS[$i]}"
    tmp_bytes="${IMPORT_BATCH_BYTES[$i]}"
    j=$i
    while (( j > 0 )) && [[ "${IMPORT_BATCH_EXTENSIONS[$((j-1))]}" > "$tmp_ext" ]]; do
      IMPORT_BATCH_EXTENSIONS[$j]="${IMPORT_BATCH_EXTENSIONS[$((j-1))]}"
      IMPORT_BATCH_COUNTS[$j]="${IMPORT_BATCH_COUNTS[$((j-1))]}"
      IMPORT_BATCH_BYTES[$j]="${IMPORT_BATCH_BYTES[$((j-1))]}"
      j=$((j - 1))
    done
    IMPORT_BATCH_EXTENSIONS[$j]="$tmp_ext"
    IMPORT_BATCH_COUNTS[$j]="$tmp_count"
    IMPORT_BATCH_BYTES[$j]="$tmp_bytes"
  done
}



select_all_import_batches() {
  SELECTED_IMPORT_EXTENSIONS=(${IMPORT_BATCH_EXTENSIONS[@]+"${IMPORT_BATCH_EXTENSIONS[@]}"})
}



import_extension_selected() {
  local ext="$1"
  multi_values_contains "$ext" "${SELECTED_IMPORT_EXTENSIONS[@]-}"
}



selected_import_count() {
  local total=0 i
  for i in "${!IMPORT_BATCH_EXTENSIONS[@]}"; do
    if import_extension_selected "${IMPORT_BATCH_EXTENSIONS[$i]}"; then
      total=$((total + IMPORT_BATCH_COUNTS[$i]))
    fi
  done
  printf '%d' "$total"
}



selected_copy_count() {
  local total=0 i ext
  for i in "${!IMPORT_BATCH_EXTENSIONS[@]}"; do
    ext="${IMPORT_BATCH_EXTENSIONS[$i]}"
    if import_extension_selected "$ext"; then
      if [[ "$ext" != "pdf" ]] && ! ext_in_list "$ext" "$IMAGE_EXTENSIONS" && ! ext_in_list "$ext" "$(markitdown_extension_list)"; then
        total=$((total + IMPORT_BATCH_COUNTS[$i]))
      fi
    fi
  done
  printf '%d' "$total"
}



selected_import_bytes() {
  local total=0 i
  for i in "${!IMPORT_BATCH_EXTENSIONS[@]}"; do
    if import_extension_selected "${IMPORT_BATCH_EXTENSIONS[$i]}"; then
      total=$((total + IMPORT_BATCH_BYTES[$i]))
    fi
  done
  printf '%d' "$total"
}



selected_import_extensions_label() {
  local labels=() ext
  for ext in "${SELECTED_IMPORT_EXTENSIONS[@]-}"; do
    labels+=(".${ext}")
  done
  join_by ", " "${labels[@]}"
}



classify_source_file() {
  local path="$1" ext
  should_skip_source_file "$path" && { echo "ignored"; return; }
  is_markdown_convertible_file "$path" && { echo "markdown"; return; }
  is_markitdown_convertible_file "$path" && { echo "markitdown"; return; }
  is_native_readable_file "$path" && { echo "native"; return; }
  # PDF: text-based → MarkItDown, scanned/image-based → RapidOCR
  if is_rapidocr_pdf "$path"; then
    if is_text_based_pdf "$path"; then
      echo "markitdown"
    else
      echo "ocr_convertible"
    fi
    return
  fi
  ext="$(file_ext "$path")"
  case "$ext" in
    jpg|jpeg|png|gif|webp|heic|heif|tif|tiff|bmp|svg) echo "ocr_convertible" ;;
    mp4|mov|m4v|avi|mkv|webm|wmv) echo "video" ;;
    mp3|wav|m4a|aac|flac|ogg|opus|aiff) echo "audio" ;;
    *) echo "unknown" ;;
  esac
}
