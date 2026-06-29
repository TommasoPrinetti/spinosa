# shellcheck shell=bash
# Raw copy and conversion pipeline.

safe_copy() {
  local src="$1" dst="$2"
  local retries="${3:-3}" delay=2 i
  for ((i = 1; i <= retries; i++)); do
    if cp -- "$src" "$dst" 2>/dev/null; then
      return 0
    fi
    [[ "$i" -lt "$retries" ]] || break
    sleep "$delay"
    delay=$((delay * 2))
  done
  return 1
}

# ── Cold frontmatter injection ──────────────────────────────────────────
# Injects frontmatter fields derivable from the file itself (no LLM).
# If the file already has frontmatter, merges missing cold fields into it
# without overwriting existing keys. Split-page files (raw_source_page)
# already have frontmatter — only missing cold fields are added.
# Future agents update the existing frontmatter with semantic fields only.
inject_cold_frontmatter() {
  inject_cold_frontmatter_body "$@" || true
}

inject_cold_frontmatter_body() {
  local md_file="$1"

  [[ -f "$md_file" ]] || return 0

  local today
  today="$(date -u +%Y-%m-%d)"

  # No frontmatter → prepend scaffold
  head -1 -- "$md_file" | grep -q '^---$' || {
    {
      printf -- '---\n'
      printf 'type:\n'
      printf 'summary:\n'
      printf 'concepts:\n'
      printf 'language:\n'
      printf 'people:\n'
      printf 'places:\n'
      printf 'organizations:\n'
      printf 'topics:\n'
      printf 'created: %s\n' "$today"
      printf -- '---\n\n'
      cat -- "$md_file"
    } > "${md_file}.tmp" && mv -- "${md_file}.tmp" "$md_file"
    return
  }

  # Has frontmatter → merge missing scaffold fields
  awk -v today="$today" \
  '
  BEGIN { in_fm = 0; first = 1 }

  /^---$/ && first { print; in_fm = 1; first = 0; next }
  /^---$/ && in_fm {
    if (!seen["type"])            print "type:"
    if (!seen["summary"])         print "summary:"
    if (!seen["concepts"])        print "concepts:"
    if (!seen["language"])        print "language:"
    if (!seen["people"])          print "people:"
    if (!seen["places"])          print "places:"
    if (!seen["organizations"])   print "organizations:"
    if (!seen["topics"])          print "topics:"
    if (!seen["created"])         printf "created: %s\n", today
    print "---"
    in_fm = 0
    next
  }
  in_fm && /^[a-zA-Z_][a-zA-Z0-9_-]*:/ {
    split($0, parts, ":")
    seen[parts[1]] = 1
  }
  { print }
  ' "$md_file" > "${md_file}.tmp" && mv -- "${md_file}.tmp" "$md_file"
}

copy_direct_raw_file() {
  local source_path="$1" dest_dir="$2" src_file="$3" raw_rel_path="$4"
  local rel_path dest_file dest_parent

  rel_path="${src_file#"$source_path"/}"
  dest_file="$dest_dir/$raw_rel_path"
  dest_parent="$(dirname "$dest_file")"
  mkdir -p "$dest_parent"

  render_copy_progress "$copy_processed" "$total_files" "$copied" "$skipped" "$rel_path" "direct-copy"
  if [[ -f "$dest_file" ]]; then
    skipped=$((skipped + 1))
  else
    if safe_copy "$src_file" "$dest_file"; then
      copied=$((copied + 1))
    else
      failed=$((failed + 1))
    fi
  fi
  processed=$((processed + 1))
  copy_processed=$((copy_processed + 1))
  render_copy_progress "$copy_processed" "$total_files" "$copied" "$skipped" "$rel_path" "direct-copied"
}

is_cloud_storage_path() {
  local path="$1"
  case "$path" in
    */Library/CloudStorage/*|*.dropbox*|*Dropbox*|*OneDrive*) return 0 ;;
  esac
  return 1
}

copy_source() {
  local source_path="$1" dest_dir="$2"
  local total_files selected_total copy_processed=0
  selected_total="$(selected_import_count)"
  [[ "$selected_total" -gt 0 ]] || { warn "No selected files found in source location."; return 1; }
  total_files="$(selected_copy_count)"

  local copied=0 skipped=0 failed=0 processed=0 ocr_converted=0 ocr_skipped=0 md_converted=0 md_skipped=0 src_file rel_path raw_rel_path dest_file dest_parent
  local md_name md_dest
  COPY_TOTAL_COUNT="$selected_total"
  COPY_IMPORTED_COUNT=0
  COPY_COPIED_COUNT=0
  COPY_SKIPPED_COUNT=0
  [[ "$total_files" -gt 0 ]] && render_copy_progress 0 "$total_files" 0 0 "" "direct-copy"

  while IFS= read -r -d '' src_file; do
    should_skip_source_file "$src_file" && continue
    is_markdown_convertible_file "$src_file" || continue
    import_extension_selected "$(file_ext "$src_file")" || continue
    rel_path="${src_file#"$source_path"/}"
    raw_rel_path="$(markdown_raw_rel_path "$rel_path")"
    copy_direct_raw_file "$source_path" "$dest_dir" "$src_file" "$raw_rel_path"
    inject_cold_frontmatter "$dest_dir/$raw_rel_path"
  done < <(find_source_files "$source_path")

  while IFS= read -r -d '' src_file; do
    should_skip_source_file "$src_file" && continue
    is_native_readable_file "$src_file" || continue
    import_extension_selected "$(file_ext "$src_file")" || continue
    rel_path="${src_file#"$source_path"/}"
    copy_direct_raw_file "$source_path" "$dest_dir" "$src_file" "$rel_path"
    if [[ "$rel_path" == *.md ]]; then
      inject_cold_frontmatter "$dest_dir/$rel_path"
    fi
  done < <(find_source_files "$source_path")

  while IFS= read -r -d '' src_file; do
    should_skip_source_file "$src_file" && continue
    local src_ext
    src_ext="$(file_ext "$src_file")"
    ext_in_list "$src_ext" "$AUDIO_VIDEO_EXTENSIONS" || continue
    import_extension_selected "$src_ext" || continue
    rel_path="${src_file#"$source_path"/}"
    copy_direct_raw_file "$source_path" "$dest_dir" "$src_file" "$rel_path"
  done < <(find_source_files "$source_path")

  # ── MarkItDown conversion pass — Office docs, EPUB, HTML, text-based PDFs → .md ──
  if [[ "${SCAN_MARKITDOWN_CHOICE:-no}" == "yes" ]]; then
    if ! markitdown_available && ! structured_fallback_available; then
      warn "Markdown converter not available — skipping MarkItDown/structured fallback pass"
    else
      local md_files=()
      while IFS= read -r -d '' src_file; do
        should_skip_source_file "$src_file" && continue
        local md_pass=0
        is_markitdown_convertible_file "$src_file" && md_pass=1
        if [[ "$md_pass" -eq 0 ]] && is_rapidocr_pdf "$src_file" && is_text_based_pdf "$src_file"; then
          md_pass=1
        fi
        [[ "$md_pass" -eq 1 ]] || continue
        import_extension_selected "$(file_ext "$src_file")" || continue
        md_files+=("$src_file")
      done < <(find_source_files "$source_path")

      if [[ ${#md_files[@]} -gt 0 ]]; then
        printf '\n\n'
        info "${G}MarkItDown${RESET} Processing ${#md_files[@]} files with MarkItDown..."
        local _md_log
        _md_log="$dest_dir/../logs/markitdown-processed.ndjson"
        mkdir -p "$(dirname "$_md_log")"
        local _md_debug
        _md_debug="${_md_log%.ndjson}.debug"
        spinosa_debug_md() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >> "$_md_debug"; }
        spinosa_debug_md "MarkItDown pass starting — _md_bin lookup"
        local _md_prev_int _md_prev_term
        _md_prev_int="$(trap -p INT 2>/dev/null || true)"
        _md_prev_term="$(trap -p TERM 2>/dev/null || true)"
        trap 'spinosa_debug_md "ERROR trap fired at line $LINENO exit=$?"; trap - ERR' ERR
        local md_total=${#md_files[@]} md_idx=0
        local _md_bin="" _md_python="" _md_script=""
        _md_bin="$(markitdown_bin)" || _md_bin=""
        if [[ -z "$_md_bin" ]] && structured_fallback_available; then
          _md_python="$(fallback_python_bin)" || _md_python=""
          _md_script="$(markitdown_script_path)" || _md_script=""
        fi
        spinosa_debug_md "md_total=$md_total _md_bin=${_md_bin:-<empty>} _md_python=${_md_python:-<empty>} dest_dir=$dest_dir source_path=$source_path"

        local _md_process_src=()
        local _md_process_rel=()
        spinosa_debug_md "Separating skip vs process: ${#md_files[@]} total files"
        for src_file in "${md_files[@]}"; do
          rel_path="${src_file#"$source_path"/}"
          md_name="$(basename "$rel_path")"
          md_name="${md_name%.*}"
          local _md_out_ext
          _md_out_ext="$(file_ext "$rel_path")"
          [[ "$_md_out_ext" == "md" ]] && _md_out_ext=""
          if [[ -n "$_md_out_ext" && "$_md_out_ext" != "md" ]]; then
            _md_out="${md_name}__${_md_out_ext}.md"
          else
            _md_out="${md_name}.md"
          fi
          md_dest="$dest_dir/$(dirname "$rel_path")/${_md_out}"
          dest_parent="$(dirname "$md_dest")"
          mkdir -p "$dest_parent"

          if converted_output_exists "$md_dest"; then
            md_skipped=$((md_skipped + 1))
            md_idx=$((md_idx + 1))
            printf '{"ts":"%s","status":"skip","source":"%s","output":"%s","engine":"markitdown","pages":"","duration_s":0}\n' \
              "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
              "$rel_path" \
              "$(dirname "$rel_path")/${_md_out}" >> "$_md_log"
            render_ocr_progress "$md_idx" "$md_total" "$md_converted" "$md_skipped" "$rel_path" "" ""
          else
            if [[ -z "$_md_bin" ]] && ! is_structured_fallback_ext "$_md_out_ext"; then
              md_skipped=$((md_skipped + 1))
              md_idx=$((md_idx + 1))
              warn "MarkItDown is not available for $(basename "$rel_path"), skipping"
              render_ocr_progress "$md_idx" "$md_total" "$md_converted" "$md_skipped" "$rel_path" "" ""
            else
              _md_process_src+=("$src_file")
              _md_process_rel+=("$rel_path")
            fi
          fi
        done
        spinosa_debug_md "Separation done — skipped=$md_skipped process=${#_md_process_src[@]}"

        if [[ ${#_md_process_src[@]} -gt 0 ]]; then
          local _md_page="" _md_current_rel=""
	          local _md_fifo _md_fifo_dir
	          _md_fifo_dir="$(mktemp -d)"
	          _md_fifo="${_md_fifo_dir}/fifo"
          spinosa_debug_md "MarkItDown batch starting — ${#_md_process_src[@]} files, fifo=$_md_fifo"

          _markitdown_cleanup() {
            spinner_stop >&2 2>/dev/null || true
            [[ -z "${_md_pid:-}" ]] || kill "$_md_pid" 2>/dev/null || true
	            [[ -z "${_md_fifo_dir:-}" ]] || rm -rf "$_md_fifo_dir" 2>/dev/null || true
            printf '\n  Cancelled.\n' >&2
            exit 1
          }
          trap _markitdown_cleanup INT TERM

          if { [[ -n "$_md_bin" ]] || [[ -n "$_md_python" && -n "$_md_script" ]]; } && mkfifo "$_md_fifo" 2>/dev/null; then
            spinosa_debug_md "FIFO created — starting batch process"
            spinner_start "Loading MarkItDown engine" >&2
            (
              printf '%s\t%s\n' SOURCE "$source_path"
              local _k
              for _k in "${!_md_process_src[@]}"; do
                local _s="${_md_process_src[$_k]}"
                local _r="${_md_process_rel[$_k]}"
                local _m _mout
                _m="$(basename "$_r")"
                _m="${_m%.*}"
                _mout="${_m}.md"
                local _mext
                _mext="$(file_ext "$_r")"
                [[ -n "$_mext" && "$_mext" != "md" ]] && _mout="${_m}__${_mext}.md"
                printf '%s\t%s\t%s\n' FILE "$_s" "$dest_dir/$(dirname "$_r")/${_mout}"
              done
            ) | if [[ -n "$_md_bin" ]]; then
                  "$_md_bin" --batch
                else
                  "$_md_python" "$_md_script" --batch
                fi 2>"$_md_fifo" &
            local _md_pid=$!
            spinosa_debug_md "MarkItDown batch spawned — pid=$_md_pid, reading fifo..."

            local _md_read_exit=0 _md_wait_status=0 _md_idle_ticks=0
            exec 3<"$_md_fifo"
            while true; do
              if IFS= read -r -t 5 -u 3 _line; then
                _md_idle_ticks=0
              else
                _md_read_exit=$?
                if kill -0 "$_md_pid" 2>/dev/null; then
                  if [[ -n "$_md_current_rel" ]]; then
                    local _md_active_idx=$((md_idx < md_total ? md_idx + 1 : md_total))
                    _md_idle_ticks=$((_md_idle_ticks + 1))
                    render_converter_wait "MarkItDown" "$_md_active_idx" "$md_total" "$md_converted" "$md_skipped" "$_md_current_rel" "$((_md_idle_ticks * 5))" "$G" "$_md_current_ext"
                  fi
                  continue
                fi
                break
              fi
              [[ -n "${_line//$'\t'/}" ]] || { spinosa_debug_md "EMPTY fifo line, skipping"; continue; }
              local _type="${_line%%$'\t'*}"
              case "$_type" in
                BEGIN)
                  _md_current_rel="${_line#BEGIN$'\t'}"
                  _md_current_ext="$(file_ext "$_md_current_rel")"
                  [[ -n "$_md_current_ext" ]] && _md_current_ext=" [.${_md_current_ext}]" || _md_current_ext=""
                  spinner_stop >&2 2>/dev/null || true
                  _md_page=""
                  _md_idle_ticks=0
                  spinosa_debug_md "BEGIN $_md_current_rel"
                  local _md_active_idx=$((md_idx < md_total ? md_idx + 1 : md_total))
                  render_ocr_progress "$_md_active_idx" "$md_total" "$md_converted" "$md_skipped" "$_md_current_rel" "" "$md_idx" "$_md_current_ext"
                  ;;
                PROGRESS)
                  _md_page="${_line#PROGRESS$'\t'}"
                  _md_idle_ticks=0
                  local _md_active_idx=$((md_idx < md_total ? md_idx + 1 : md_total))
                  render_ocr_progress "$_md_active_idx" "$md_total" "$md_converted" "$md_skipped" "$_md_current_rel" "$_md_page" "$md_idx" "$_md_current_ext"
                  ;;
                END)
                  md_idx=$((md_idx + 1))
                  _md_idle_ticks=0
                  local _md_rest="${_line#END$'\t'}"
                  local _md_end_status="${_md_rest%%$'\t'*}"
                  _md_rest="${_md_rest#"$_md_end_status"$'\t'}"
                  _md_current_rel="${_md_rest%%$'\t'*}"
                  local _md_end_dur _md_out_log
                  _md_end_dur="${_md_rest#"$_md_current_rel"$'\t'}"
                  local _md_out_log_dir
                  _md_out_log_dir="$(dirname "$_md_current_rel")"
                  local _md_out_log_name
                  _md_out_log_name="$(basename "${_md_current_rel%.*}")"
                  local _md_out_log_ext
                  _md_out_log_ext="$(file_ext "$_md_current_rel")"
                  if [[ -n "$_md_out_log_ext" && "$_md_out_log_ext" != "md" ]]; then
                    _md_out_log="${_md_out_log_dir}/${_md_out_log_name}__${_md_out_log_ext}.md"
                  else
                    _md_out_log="${_md_out_log_dir}/${_md_out_log_name}.md"
                  fi
                  spinosa_debug_md "END $_md_end_status $_md_current_rel dur=${_md_end_dur}s"

                  if [[ "$_md_end_status" == "ok" ]]; then
                    md_converted=$((md_converted + 1))
                    inject_cold_frontmatter "$dest_dir/$_md_out_log"
                    _page_folder="${_md_out_log%.md}"
                    if [[ -n "$_page_folder" && -d "$dest_dir/$_page_folder" ]]; then
                      for _page_file in "$dest_dir/$_page_folder"/page-*.md; do
                        [[ -f "$_page_file" ]] && inject_cold_frontmatter "$_page_file"
                      done
                    fi
                    printf '{"ts":"%s","status":"ok","source":"%s","output":"%s","engine":"markitdown","pages":"%s","duration_s":%s}\n' \
                      "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
                      "$_md_current_rel" \
                      "$_md_out_log" \
                      "${_md_page:-}" \
                      "$_md_end_dur" >> "$_md_log"
                  else
                    spinner_stop >&2
                    printf '\n' >&2
                    warn "MarkItDown failed for $(basename "$_md_current_rel"), skipping"
                    md_skipped=$((md_skipped + 1))
                    printf '{"ts":"%s","status":"fail","source":"%s","output":"%s","engine":"markitdown","pages":"%s","duration_s":%s}\n' \
                      "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
                      "$_md_current_rel" \
                      "$_md_out_log" \
                      "${_md_page:-}" \
                      "$_md_end_dur" >> "$_md_log"
                  fi
                  render_ocr_progress "$md_idx" "$md_total" "$md_converted" "$md_skipped" "$_md_current_rel" "$_md_page" "$md_idx" "$_md_current_ext"
                  _md_page=""
                  ;;
                *)
                  spinosa_debug_md "UNEXPECTED fifo line: $_line"
                  ;;
              esac
            done
            exec 3<&-
            spinosa_debug_md "FIFO read complete — waiting for batch process (pid=$_md_pid)..."
            wait "$_md_pid" 2>/dev/null || _md_wait_status=$?
            spinosa_debug_md "Batch process finished — exit=${_md_wait_status}"
            if [[ "$_md_wait_status" -ne 0 ]]; then
              warn "MarkItDown exited with status ${_md_wait_status} — partial results may be available"
            fi
            rm -f "$_md_fifo"
          elif [[ -n "$_md_bin" || -n "$_md_python" ]]; then
            spinner_stop >&2 2>/dev/null || true
            warn "Could not create MarkItDown FIFO — skipped"
            for _r in "${_md_process_rel[@]}"; do
              md_idx=$((md_idx + 1))
              md_skipped=$((md_skipped + 1))
              render_ocr_progress "$md_idx" "$md_total" "$md_converted" "$md_skipped" "$_r" "" "" ""
            done
          else
            for _r in "${_md_process_rel[@]}"; do
              md_idx=$((md_idx + 1))
              md_skipped=$((md_skipped + 1))
              render_ocr_progress "$md_idx" "$md_total" "$md_converted" "$md_skipped" "$_r" "" "" ""
            done
          fi
          # Restore outer INT/TERM traps
          eval "$_md_prev_int" 2>/dev/null || trap - INT
          eval "$_md_prev_term" 2>/dev/null || trap - TERM
        fi

        printf '\n'
        ok "${G}MarkItDown${RESET} Completed: ${md_converted} converted, ${md_skipped} skipped"
        spinosa_debug_md "MarkItDown pass complete — converted=$md_converted skipped=$md_skipped"
        trap - ERR 2>/dev/null || true
      fi
    fi
  fi

  # RapidOCR OCR pass — scanned PDFs and images → structured Markdown
  if [[ "${SCAN_OCR_CHOICE:-no}" == "yes" ]]; then
    if ! rapidocr_ocr_available; then
      warn "RapidOCR OCR not available — skipping OCR pass"
    else
      local ocr_files=()
      while IFS= read -r -d '' src_file; do
        should_skip_source_file "$src_file" && continue
        # Skip PDFs already handled by MarkItDown (check output .md exists)
        if is_rapidocr_pdf "$src_file"; then
          local _ocr_md_rel="${src_file#"$source_path"/}"
        if converted_output_exists "$dest_dir/$(markdown_raw_rel_path "$_ocr_md_rel")"; then
            continue
          fi
        fi
        if is_rapidocr_pdf "$src_file" || is_rapidocr_image "$src_file"; then
          import_extension_selected "$(file_ext "$src_file")" || continue
          ocr_files+=("$src_file")
        fi
      done < <(find_source_files "$source_path")

      if [[ ${#ocr_files[@]} -gt 0 ]]; then
        printf '\n\n'
        info "${M}OCR${RESET} Processing ${#ocr_files[@]} scanned images and PDFs with RapidOCR..."
        local _ocr_log
        _ocr_log="$dest_dir/../logs/ocr-processed.ndjson"
        mkdir -p "$(dirname "$_ocr_log")"
        local _ocr_debug
        _ocr_debug="${_ocr_log%.ndjson}.debug"
        spinosa_debug() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >> "$_ocr_debug"; }
        spinosa_debug "OCR pass starting — _ocr_bin lookup"
        local _ocr_prev_int _ocr_prev_term
        _ocr_prev_int="$(trap -p INT 2>/dev/null || true)"
        _ocr_prev_term="$(trap -p TERM 2>/dev/null || true)"
        trap 'spinosa_debug "ERROR trap fired at line $LINENO exit=$?"; trap - ERR' ERR
        local ocr_total=${#ocr_files[@]} ocr_idx=0
        local _ocr_bin
        _ocr_bin="$(rapidocr_ocr_bin)" || _ocr_bin=""
        spinosa_debug "ocr_total=$ocr_total _ocr_bin=${_ocr_bin:-<empty>} dest_dir=$dest_dir source_path=$source_path"

        # Separate files already OCR'd (skip) from files needing processing
        local _ocr_process_src=()
        local _ocr_process_rel=()
        spinosa_debug "Separating skip vs process: ${#ocr_files[@]} total files"
        for src_file in "${ocr_files[@]}"; do
          rel_path="${src_file#"$source_path"/}"
          md_name="$(basename "$rel_path")"
          md_name="${md_name%.*}"
          md_dest="$dest_dir/$(dirname "$rel_path")/${md_name}.md"
          dest_parent="$(dirname "$md_dest")"
          mkdir -p "$dest_parent"

          if converted_output_exists "$md_dest"; then
            ocr_skipped=$((ocr_skipped + 1))
            ocr_idx=$((ocr_idx + 1))
            printf '{"ts":"%s","status":"skip","source":"%s","output":"%s","pages":"","duration_s":0}\n' \
              "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
              "$rel_path" \
              "$(dirname "$rel_path")/${md_name}.md" >> "$_ocr_log"
            render_ocr_progress "$ocr_idx" "$ocr_total" "$ocr_converted" "$ocr_skipped" "$rel_path" "" ""
          else
            _ocr_process_src+=("$src_file")
            _ocr_process_rel+=("$rel_path")
          fi
        done
        spinosa_debug "Separation done — skipped=$ocr_skipped process=${#_ocr_process_src[@]}"

        if [[ ${#_ocr_process_src[@]} -gt 0 ]]; then
          local _ocr_page="" _ocr_page_counter=0
          local _current_rel="" _ocr_current_ext=""
	          local _ocr_fifo _ocr_fifo_dir
	          _ocr_fifo_dir="$(mktemp -d)"
	          _ocr_fifo="${_ocr_fifo_dir}/fifo"
          spinosa_debug "Batch starting — ${#_ocr_process_src[@]} files, fifo=$_ocr_fifo"

          _ocr_cleanup() {
            spinner_stop >&2 2>/dev/null || true
            [[ -z "${_ocr_pid:-}" ]] || kill "$_ocr_pid" 2>/dev/null || true
	            [[ -z "${_ocr_fifo_dir:-}" ]] || rm -rf "$_ocr_fifo_dir" 2>/dev/null || true
            printf '\n  Cancelled.\n' >&2
            exit 1
          }
          trap _ocr_cleanup INT TERM

          if [[ -n "$_ocr_bin" ]] && mkfifo "$_ocr_fifo" 2>/dev/null; then
            spinosa_debug "FIFO created — starting batch process"
            spinner_start "Loading OCR engine (one-time model init)" >&2
            (
              printf '%s\t%s\n' SOURCE "$source_path"
              local _i
              for _i in "${!_ocr_process_src[@]}"; do
                local _s="${_ocr_process_src[$_i]}"
                local _r="${_ocr_process_rel[$_i]}"
                local _m
                _m="$(basename "$_r")"
                _m="${_m%.*}"
                printf '%s\t%s\t%s\n' FILE "$_s" "$dest_dir/$(dirname "$_r")/${_m}.md"
              done
            ) | "$_ocr_bin" --batch 2>"$_ocr_fifo" &
            local _ocr_pid=$!
            spinosa_debug "Batch process spawned — pid=$_ocr_pid, reading fifo..."

            local _ocr_read_exit=0 _ocr_wait_status=0 _ocr_idle_ticks=0
            exec 4<"$_ocr_fifo"
            while true; do
              if IFS= read -r -t 5 -u 4 _line; then
                _ocr_idle_ticks=0
              else
                _ocr_read_exit=$?
                if kill -0 "$_ocr_pid" 2>/dev/null; then
                  if [[ -n "$_current_rel" ]]; then
                    local _ocr_active_idx=$((ocr_idx < ocr_total ? ocr_idx + 1 : ocr_total))
                    _ocr_idle_ticks=$((_ocr_idle_ticks + 1))
                    render_converter_wait "OCR" "$_ocr_active_idx" "$ocr_total" "$ocr_converted" "$ocr_skipped" "$_current_rel" "$((_ocr_idle_ticks * 5))" "$M" "$_ocr_current_ext"
                  fi
                  continue
                fi
                break
              fi
              [[ -n "${_line//$'\t'/}" ]] || { spinosa_debug "EMPTY fifo line, skipping"; continue; }
              local _type="${_line%%$'\t'*}"
              case "$_type" in
                BEGIN)
                  _current_rel="${_line#BEGIN$'\t'}"
                  _ocr_current_ext="$(file_ext "$_current_rel")"
                  [[ -n "$_ocr_current_ext" ]] && _ocr_current_ext=" [.${_ocr_current_ext}]" || _ocr_current_ext=""
                  spinner_stop >&2 2>/dev/null || true
                  _ocr_page=""
                  _ocr_page_counter=0
                  _ocr_idle_ticks=0
                  spinosa_debug "BEGIN $_current_rel"
                  local _ocr_active_idx=$((ocr_idx < ocr_total ? ocr_idx + 1 : ocr_total))
                  render_ocr_progress "$_ocr_active_idx" "$ocr_total" "$ocr_converted" "$ocr_skipped" "$_current_rel" "" "$ocr_idx" "$_ocr_current_ext"
                  ;;
                PROGRESS)
                  _ocr_page="${_line#PROGRESS$'\t'}"
                  _ocr_page_counter=$((_ocr_page_counter + 1))
                  _ocr_idle_ticks=0
                  local _ocr_active_idx=$((ocr_idx < ocr_total ? ocr_idx + 1 : ocr_total))
                  render_ocr_progress "$_ocr_active_idx" "$ocr_total" "$ocr_converted" "$ocr_skipped" "$_current_rel" "$_ocr_page" "$_ocr_page_counter" "$_ocr_current_ext"
                  ;;
                END)
                  ocr_idx=$((ocr_idx + 1))
                  _ocr_idle_ticks=0
                  local _rest="${_line#END$'\t'}"
                  local _end_status="${_rest%%$'\t'*}"
                  _rest="${_rest#"$_end_status"$'\t'}"
                  _current_rel="${_rest%%$'\t'*}"
                  local _end_dur _md_out
                  _end_dur="${_rest#"$_current_rel"$'\t'}"
                  _md_out="$(dirname "$_current_rel")/$(basename "${_current_rel%.*}").md"
                  spinosa_debug "END $_end_status $_current_rel dur=${_end_dur}s pages=${_ocr_page:-none}"

                  if [[ "$_end_status" == "ok" ]]; then
                    ocr_converted=$((ocr_converted + 1))
                    local _ocr_format
                    _ocr_format="$(file_ext "$_current_rel")"
                    inject_cold_frontmatter "$dest_dir/$_md_out"
                    _page_folder="${_md_out%.md}"
                    if [[ -n "$_page_folder" && -d "$dest_dir/$_page_folder" ]]; then
                      for _page_file in "$dest_dir/$_page_folder"/page-*.md; do
                        [[ -f "$_page_file" ]] && inject_cold_frontmatter "$_page_file"
                      done
                    fi
                    printf '{"ts":"%s","status":"ok","source":"%s","output":"%s","pages":"%s","duration_s":%s}\n' \
                      "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
                      "$_current_rel" \
                      "$_md_out" \
                      "${_ocr_page:-1/1}" \
                      "$_end_dur" >> "$_ocr_log"
                  else
                    spinner_stop >&2
                    printf '\n' >&2
                    warn "OCR failed for $(basename "$_current_rel"), skipping"
                    ocr_skipped=$((ocr_skipped + 1))
                    printf '{"ts":"%s","status":"fail","source":"%s","output":"%s","pages":"%s","duration_s":%s}\n' \
                      "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
                      "$_current_rel" \
                      "$_md_out" \
                      "${_ocr_page:-}" \
                      "$_end_dur" >> "$_ocr_log"
                  fi
                  render_ocr_progress "$ocr_idx" "$ocr_total" "$ocr_converted" "$ocr_skipped" "$_current_rel" "$_ocr_page" "$_ocr_page_counter" "$_ocr_current_ext"
                  _ocr_page=""
                  _ocr_current_ext=""
                  ;;
                *)
                  spinosa_debug "UNEXPECTED fifo line: $_line"
                  ;;
              esac
            done
            exec 4<&-
            spinosa_debug "FIFO read complete — waiting for batch process (pid=$_ocr_pid)..."
            wait "$_ocr_pid" 2>/dev/null || _ocr_wait_status=$?
            spinosa_debug "Batch process finished — exit=${_ocr_wait_status}"
            if [[ "$_ocr_wait_status" -ne 0 ]]; then
              warn "OCR exited with status ${_ocr_wait_status} — partial results may be available"
            fi
            rm -f "$_ocr_fifo"
          elif [[ -n "$_ocr_bin" ]]; then
            warn "Could not create FIFO — OCR skipped"
            for _r in "${_ocr_process_rel[@]}"; do
              ocr_idx=$((ocr_idx + 1))
              ocr_skipped=$((ocr_skipped + 1))
              render_ocr_progress "$ocr_idx" "$ocr_total" "$ocr_converted" "$ocr_skipped" "$_r" "" ""
            done
          else
            for _r in "${_ocr_process_rel[@]}"; do
              ocr_idx=$((ocr_idx + 1))
              ocr_skipped=$((ocr_skipped + 1))
              render_ocr_progress "$ocr_idx" "$ocr_total" "$ocr_converted" "$ocr_skipped" "$_r" "" ""
            done
          fi
          # Restore outer INT/TERM traps instead of clearing
          eval "$_ocr_prev_int" 2>/dev/null || trap - INT
          eval "$_ocr_prev_term" 2>/dev/null || trap - TERM
        fi

        printf '\n'
        ok "${M}OCR${RESET} Completed: ${ocr_converted} converted, ${ocr_skipped} skipped"
        spinosa_debug "OCR pass complete — converted=$ocr_converted skipped=$ocr_skipped"
        trap - ERR 2>/dev/null || true
      fi
    fi
  fi

  # Binary copyable pass (non-OCR files)
  while IFS= read -r -d '' src_file; do
    should_skip_source_file "$src_file" && continue
    is_binary_copyable_file "$src_file" || continue
    import_extension_selected "$(file_ext "$src_file")" || continue
    rel_path="${src_file#"$source_path"/}"
    copy_direct_raw_file "$source_path" "$dest_dir" "$src_file" "$rel_path"
  done < <(find_source_files "$source_path")

  COPY_COPIED_COUNT="$copied"
  COPY_FAILED_COUNT="$failed"
  COPY_SKIPPED_COUNT="$skipped"
  COPY_MARKITDOWN_CONVERTED_COUNT="${md_converted:-0}"
  COPY_MARKITDOWN_SKIPPED_COUNT="${md_skipped:-0}"
  COPY_OCR_CONVERTED_COUNT="${ocr_converted:-0}"
  COPY_OCR_SKIPPED_COUNT="${ocr_skipped:-0}"
  COPY_IMPORTED_COUNT=$((copied + md_converted + ocr_converted))

  printf '\n'
  if [[ "$failed" -gt 0 ]]; then
    warn "$failed files could not be copied (cloud storage timeout or I/O error). These files are skipped. Run the copy again when all files are synced locally."
  fi
  tree_sep
  tree_row "Workspace copy" "prepared" "${BOLD}$(dirname "$dest_dir")${RESET}"
}

choose_import_batches() {
  [[ ${#IMPORT_BATCH_EXTENSIONS[@]} -gt 0 ]] || return 0

  local -a MULTI_CHOOSE_RESULTS=()
  local options=() i count ext
  options+=("$(option_spec "__all__" "All supported files" "toggle every supported file type on or off")")
  for i in "${!IMPORT_BATCH_EXTENSIONS[@]}"; do
    ext="${IMPORT_BATCH_EXTENSIONS[$i]}"
    count="${IMPORT_BATCH_COUNTS[$i]}"
    local tag=""
    if [[ "$ext" == "pdf" ]]; then
      # PDF routing is content-based: text-based → MarkItDown, scanned → RapidOCR
      local md_ok="" ocr_ok=""
      markitdown_available 2>/dev/null && md_ok="MarkItDown"
      rapidocr_ocr_available 2>/dev/null && ocr_ok="OCR"
      if [[ -n "$md_ok" && -n "$ocr_ok" ]]; then
        tag=" (MarkItDown / OCR)"
      elif [[ -n "$md_ok" ]]; then
        tag=" (MarkItDown)"
      elif [[ -n "$ocr_ok" ]]; then
        tag=" (OCR)"
      fi
    elif ext_in_list "$ext" "$(markitdown_extension_list)"; then
      if markitdown_available 2>/dev/null; then
        tag=" (MarkItDown)"
      elif is_structured_fallback_ext "$ext" && structured_fallback_available 2>/dev/null; then
        tag=" (built-in fallback)"
      fi
    elif rapidocr_ocr_available 2>/dev/null && ext_in_list "$ext" "$IMAGE_EXTENSIONS"; then
      tag=" (OCR)"
    fi
    options+=("$(option_spec "$ext" ".${ext}" "$(plural_count "$count" "file")${tag}")")
  done

  # Audio/video are listed but not selected by default — user must opt in
  MULTI_CHOOSE_EXCLUDE="$AUDIO_VIDEO_EXTENSIONS"

  while true; do
    tree_sep
    tree_row "Selection" "choose file types to import"
    prompt_multi_choose "Selectable file-type batches" "${options[@]}" || return 1
    local -a selected_import_extensions=()
    if [[ ${MULTI_CHOOSE_RESULTS+x} ]]; then
      selected_import_extensions=("${MULTI_CHOOSE_RESULTS[@]}")
    fi
    if [[ ${#selected_import_extensions[@]} -gt 0 ]]; then
      SELECTED_IMPORT_EXTENSIONS=("${selected_import_extensions[@]}")
      return 0
    fi
    warn "Select at least one file type to enable import."
  done
}
