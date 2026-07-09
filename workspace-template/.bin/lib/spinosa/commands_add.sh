# shellcheck shell=bash
# Add files command.

cmd_add() {
  header "Spinosa -- Add Files"

  local workspace_path=""
  local source_path=""
  local source_is_dir=0
  local flag_cli=""
  local flag_launch=""
  local flag_extensions=""
  local add_args
  add_args=()

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --workspace|-w)     workspace_path="$2"; shift 2 ;;
      --file|-f)          source_path="$2"; shift 2 ;;
      --dir|-d)           source_path="$2"; source_is_dir=1; shift 2 ;;
      --extensions)       flag_extensions="$2"; shift 2 ;;
      --cli)              flag_cli="$2"; shift 2 ;;
      --launch)           flag_launch="$2"; shift 2 ;;
      --no-color)         R="" G="" B="" Y="" C="" M="" PG="" DIM="" BOLD="" RESET=""; shift ;;
      --help|-h)
        printf '  %s\n' "Usage: spinosa add [options]"
        printf '    %s\n' "  --workspace, -w  Path to existing Spinosa workspace"
        printf '    %s\n' "  --file, -f       Single file to add to the workspace"
        printf '    %s\n' "  --dir, -d        Directory of files to add (scanned and batch-converted)"
        printf '    %s\n' "  --extensions     Comma-separated file types to import (e.g. txt,pdf)"
        printf '    %s\n' "  --cli            Preferred LLM CLI (opencode, gemini, qwen, claude_code, codex, hermes, kilo, other)"
        printf '    %s\n' "  --launch         Launch method (copy, run)"
        printf '    %s\n' "  --no-color       Disable colored output"
        return 0
        ;;
      *)
        add_args+=("$1")
        shift
        ;;
    esac
  done

  # ---- Step 1: Workspace selection ------------------------------------------------
  print_step 1 3 "Workspace selection"

  if [[ -n "$workspace_path" ]]; then
    workspace_path="$(expand_home "$workspace_path")"
    if ! validate_workspace "$workspace_path"; then
      die "Not a valid Spinosa workspace: $workspace_path"
    fi
    ok "Workspace: ${BOLD}${workspace_path##*/}${RESET}"
  elif [[ ${#add_args[@]} -gt 0 && -f "$(expand_home "${add_args[0]}")/.spinosa/workspace" ]]; then
    workspace_path="$(expand_home "${add_args[0]}")"
    add_args=("${add_args[@]:1}")
    ok "Workspace: ${BOLD}${workspace_path##*/}${RESET}"
  else
    workspace_path="$(require_workspace)" || die "No workspace selected."
    ok "Workspace: ${BOLD}${workspace_path##*/}${RESET}"
  fi

  # ---- Step 2: Source path collection -------------------------------------------------
  print_step 2 3 "Source selection"

  if [[ -z "$source_path" ]]; then
    if [[ ${#add_args[@]} -gt 0 ]]; then
      source_path="${add_args[0]}"
      source_path="$(expand_home "$source_path")"
      if [[ -d "$source_path" ]]; then
        source_is_dir=1
      elif [[ -f "$source_path" ]]; then
        source_is_dir=0
      else
        die "Not a valid file or directory: $source_path"
      fi
    else
      local source_options=(
        "$(option_spec "file" "A single file" "import one file")"
        "$(option_spec "dir" "A directory of files" "scan and batch-import a folder")"
      )
      local source_type
      source_type="$(prompt_choose "What do you want to add?" "${source_options[@]}")" || die "Cancelled."

      if [[ "$source_type" == "file" ]]; then
        while true; do
          source_path="$(prompt_input "File path" "" "absolute path to a single file")"
          source_path="$(expand_home "$source_path")"
          if [[ -z "$source_path" ]]; then
            printf '  %s\n' "${R}File path is required.${RESET}" >&2
          elif [[ ! -f "$source_path" ]]; then
            printf '  %s\n' "${R}Not a file: $(display_path "$source_path")${RESET}" >&2
          else
            source_is_dir=0
            break
          fi
        done
      else
        while true; do
          source_path="$(prompt_directory "Folder path" "" "absolute path to a directory")"
          source_path="$(expand_home "$source_path")"
          if [[ -z "$source_path" ]]; then
            printf '  %s\n' "${R}Folder path is required.${RESET}" >&2
          elif [[ ! -d "$source_path" ]]; then
            printf '  %s\n' "${R}Not a directory: $(display_path "$source_path")${RESET}" >&2
          else
            source_is_dir=1
            break
          fi
        done
      fi
    fi
  else
    source_path="$(expand_home "$source_path")"
    if [[ "$source_is_dir" -eq 1 ]]; then
      [[ -d "$source_path" ]] || die "Not a directory: $(display_path "$source_path")"
    else
      [[ -f "$source_path" ]] || die "Not a file: $(display_path "$source_path")"
    fi
  fi

  ok "Source: ${BOLD}$(display_path "$source_path")${RESET}"

  local raw_dir="$workspace_path/raw"
  [[ -d "$raw_dir" ]] || mkdir -p "$raw_dir"


  # ---- Step 3: File intake -------------------------------------------------
  print_step 3 3 "File import"

  local add_copied=0 add_skipped=0 add_failed=0
  local add_md_converted=0 add_md_skipped=0
  local add_ocr_converted=0 add_ocr_skipped=0
  local ADD_TOTAL_COUNT=0

  onboarding_log_init "$workspace_path" "add" "$source_path"

  if [[ "$source_is_dir" -eq 1 ]]; then
    # ---- Folder mode: full scan + batch import -----------------------------
    print_onboarding_preflight "$workspace_path"
    reset_import_batches
    scan_source "$source_path"
    onboarding_log_scan_summary
    print_scan_summary

    if [[ -n "${flag_extensions:-}" ]]; then
      parse_selected_extensions_from_flag "${flag_extensions:-}"
      validate_selected_extensions_against_scan "${flag_extensions:-}" || die "Selected extensions do not match this corpus."
    else
      choose_import_batches || die "No file types selected."
    fi

    configure_selected_import_tools || die "Selected file types require unavailable conversion tools."
    validate_import_tool_coverage "$source_path" || die "Selected files require unavailable conversion tools."
    onboarding_log_import_options "$source_path" "${flag_extensions:-}"

    local copyable_count
    copyable_count="$(selected_import_count)"
    if [[ "$copyable_count" -eq 0 ]]; then
      die "No files selected for import."
    fi
    note "Importing ${copyable_count} files..."
    copy_source "$source_path" "$raw_dir" || die "Import copy failed."
    assert_import_delivered "$source_path" "$raw_dir" || die "No files were delivered to raw/."

    add_copied="${COPY_COPIED_COUNT:-0}"
    add_skipped="${COPY_SKIPPED_COUNT:-0}"
    add_failed="${COPY_FAILED_COUNT:-0}"
    add_md_converted="${COPY_MARKITDOWN_CONVERTED_COUNT:-0}"
    add_md_skipped="${COPY_MARKITDOWN_SKIPPED_COUNT:-0}"
    add_ocr_converted="${COPY_OCR_CONVERTED_COUNT:-0}"
    add_ocr_skipped="${COPY_OCR_SKIPPED_COUNT:-0}"
    ADD_TOTAL_COUNT="$copyable_count"
  else
    # ---- Single file mode: classify and process one file ---------------
    local src_file="$source_path"
    local file_class
    file_class="$(classify_source_file "$src_file")"

    case "$file_class" in
      ignored)
        die "File is a protected Spinosa file and will not be imported: $(basename "$src_file")"
        ;;
      markdown|native)
        local rel_path dest_file dest_name
        rel_path="$(basename "$src_file")"
        if [[ "$file_class" == "markdown" ]]; then
          dest_name="$(markdown_raw_rel_path "$rel_path")"
          dest_file="$raw_dir/$dest_name"
        else
          dest_name="$rel_path"
          dest_file="$raw_dir/$dest_name"
        fi
        mkdir -p "$(dirname "$dest_file")"
        if [[ -f "$dest_file" ]]; then
          warn "Already exists in raw/: $dest_name"
          if confirm "Overwrite?" "n"; then
            safe_copy "$src_file" "$dest_file" && add_copied=1 || add_failed=1
          else
            add_skipped=1
          fi
        else
          safe_copy "$src_file" "$dest_file" && add_copied=1 || add_failed=1
        fi
        if [[ "$dest_file" == *.md ]] && [[ -f "$dest_file" ]]; then
          inject_cold_frontmatter "$dest_file"
        fi
        ADD_TOTAL_COUNT=1
        ;;
      markitdown)
        local _src_ext
        _src_ext="$(file_ext "$src_file")"
        if ! markitdown_available && ! { is_structured_fallback_ext "$_src_ext" && structured_fallback_available; }; then
          die "MarkItDown is not available. Cannot convert: $(basename "$src_file"). Run: spinosa upgrade --reinstall"
        fi
        local rel_path stem dest_name dest_file
        rel_path="$(basename "$src_file")"
        stem="${rel_path%.*}"
        dest_name="${stem}__$(file_ext "$src_file").md"
        dest_file="$raw_dir/$dest_name"
        mkdir -p "$(dirname "$dest_file")"
        if converted_output_exists "$dest_file" && ! confirm "Overwrite?" "n"; then
          add_skipped=1
          ADD_TOTAL_COUNT=1
        else
          remove_converted_output "$dest_file"
          local _md_log="$workspace_path/logs/markitdown-processed.ndjson"
          mkdir -p "$(dirname "$_md_log")"
          local _md_bin="" _md_python="" _md_script=""
          _md_bin="$(markitdown_bin)" || _md_bin=""
          if [[ -z "$_md_bin" ]]; then
            _md_python="$(fallback_python_bin)" || die "Python runtime not found for structured fallback conversion."
            _md_script="$(markitdown_script_path)" || die "Structured fallback converter script not found."
          fi
          local _md_fifo_dir _md_fifo
          _md_fifo_dir="$(mktemp -d)"
          _md_fifo="${_md_fifo_dir}/fifo"
          mkfifo "$_md_fifo" 2>/dev/null || die "Could not create FIFO for MarkItDown."
          (
            printf '%s\t%s\n' SOURCE "$(dirname "$src_file")"
            printf '%s\t%s\t%s\n' FILE "$src_file" "$dest_file"
          ) | if [[ -n "$_md_bin" ]]; then
                "$_md_bin" --batch
              else
                "$_md_python" "$_md_script" --batch
              fi 2>"$_md_fifo" &
          local _md_pid=$!
          local _md_status="fail"
          exec 3<"$_md_fifo"
          while IFS= read -r -t 30 -u 3 _line; do
            if [[ "$_line" == END* ]]; then
              local _rest="${_line#END$'\t'}"
              local _end_status="${_rest%%$'\t'*}"
              [[ "$_end_status" == "ok" ]] && _md_status="ok"
            fi
          done
          exec 3<&-
          wait "$_md_pid" 2>/dev/null || true
          rm -rf "$_md_fifo_dir"
          if [[ "$_md_status" == "ok" ]]; then
            add_md_converted=1
            inject_cold_frontmatter "$dest_file"
          else
            add_skipped=1
            add_md_skipped=1
          fi
          ADD_TOTAL_COUNT=1
        fi
        ;;
      ocr_convertible)
        if ! rapidocr_ocr_available; then
          die "RapidOCR is not available. Cannot convert: $(basename "$src_file")"
        fi
        local rel_path stem dest_file
        rel_path="$(basename "$src_file")"
        stem="${rel_path%.*}"
        dest_file="$raw_dir/${stem}.md"
        mkdir -p "$(dirname "$dest_file")"
        if converted_output_exists "$dest_file" && ! confirm "Overwrite?" "n"; then
          add_skipped=1
          ADD_TOTAL_COUNT=1
        else
          remove_converted_output "$dest_file"
          local _ocr_log="$workspace_path/logs/ocr-processed.ndjson"
          mkdir -p "$(dirname "$_ocr_log")"
          local _ocr_bin
          _ocr_bin="$(rapidocr_ocr_bin)" || die "OCR binary not found."
          local _ocr_fifo_dir _ocr_fifo
          _ocr_fifo_dir="$(mktemp -d)"
          _ocr_fifo="${_ocr_fifo_dir}/fifo"
          mkfifo "$_ocr_fifo" 2>/dev/null || die "Could not create FIFO for OCR."
          (
            printf '%s\t%s\n' SOURCE "$(dirname "$src_file")"
            printf '%s\t%s\t%s\n' FILE "$src_file" "$dest_file"
          ) | "$_ocr_bin" --batch 2>"$_ocr_fifo" &
          local _ocr_pid=$!
          local _ocr_status="fail"
          exec 4<"$_ocr_fifo"
          while IFS= read -r -t 60 -u 4 _line; do
            if [[ "$_line" == END* ]]; then
              local _rest="${_line#END$'\t'}"
              local _end_status="${_rest%%$'\t'*}"
              [[ "$_end_status" == "ok" ]] && _ocr_status="ok"
            fi
          done
          exec 4<&-
          wait "$_ocr_pid" 2>/dev/null || true
          rm -rf "$_ocr_fifo_dir"
          if [[ "$_ocr_status" == "ok" ]]; then
            add_ocr_converted=1
            inject_cold_frontmatter "$dest_file"
          else
            add_skipped=1
            add_ocr_skipped=1
          fi
          ADD_TOTAL_COUNT=1
        fi
        ;;
      video|audio)
        local dest_file
        dest_file="$raw_dir/$(basename "$src_file")"
        mkdir -p "$(dirname "$dest_file")"
        if [[ -f "$dest_file" ]]; then
          warn "Already exists in raw/: $(basename "$src_file")"
          if confirm "Overwrite?" "n"; then
            safe_copy "$src_file" "$dest_file" && add_copied=1 || add_failed=1
          else
            add_skipped=1
          fi
        else
          safe_copy "$src_file" "$dest_file" && add_copied=1 || add_failed=1
        fi
        ADD_TOTAL_COUNT=1
        ;;
      unknown)
        die "Unsupported file type and no import route is available: $(basename "$src_file")"
        ;;
    esac
    onboarding_log_import_options "$source_path" "${flag_extensions:-}"
    onboarding_log_event "add" "single_file" "source=$(display_path "$source_path")" "class=${file_class}"
    verify_single_import_file "$(dirname "$src_file")" "$raw_dir" "$src_file"
  fi

  printf '\n'
  if [[ "$add_failed" -gt 0 ]]; then
    warn "$add_failed file(s) could not be copied."
  fi
  local add_imported=$((add_copied + add_md_converted + add_ocr_converted))
  if [[ "$add_imported" -gt 0 ]]; then
    ok "Imported ${add_imported} file(s): ${add_copied} direct, ${add_md_converted} MarkItDown, ${add_ocr_converted} OCR"
    [[ "$add_skipped" -gt 0 ]] && note "${add_skipped} file(s) skipped (already exist)"
  else
    warn "No files were added."
  fi

  # ---- Step 4: Write add summary -------------------------------------------------
  local summary_path="$workspace_path/.spinosa/add-summary.md"
  local preferred_cli_label="OpenCode"
  if [[ -n "$flag_cli" ]]; then
    preferred_cli_label="$(preferred_cli_name "$flag_cli")"
  fi

  local add_mode="folder"
  [[ "$source_is_dir" -eq 0 ]] && add_mode="single_file"

  mkdir -p "$(dirname "$summary_path")"
  cat > "$summary_path" << SUMMARY_EOF
---
type: add_summary
created: $TODAY
add_timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)
---

# Add Summary

## Source
- Source path: $(display_path "$source_path")
- Add mode: ${add_mode}
- Workspace: $(display_path "$workspace_path")

## Import Result
- Total files targeted: ${ADD_TOTAL_COUNT:-0}
- Direct copies: ${add_copied:-0}
- Files skipped: ${add_skipped:-0}
- Files failed: ${add_failed:-0}
- MarkItDown converted: ${add_md_converted:-0}
- MarkItDown skipped: ${add_md_skipped:-0}
- OCR converted: ${add_ocr_converted:-0}
- OCR skipped: ${add_ocr_skipped:-0}
- Post-import verification missing: ${COPY_VERIFY_MISSING_COUNT:-0}
- Post-import recovered (reprocess): ${COPY_VERIFY_RECOVERED_RETRY_COUNT:-0}
- Post-import recovered (source copy): ${COPY_VERIFY_RECOVERED_COPY_COUNT:-0}
- Post-import still missing: ${COPY_VERIFY_STILL_MISSING_COUNT:-0}
- Import trace log: logs/onboarding.log

## Post-Add Status
- Post-add action: re-mapper prompt generated
- Preferred CLI: ${preferred_cli_label}
- Pending: mapper extraction, dictionary update, map update, verification
SUMMARY_EOF

  ok "Add summary written"

  # ---- Step 5: Generate re-mapper prompt -------------------------------------------------
  local add_prompt
  add_prompt="$(prompt_add_text "$workspace_path" "$preferred_cli_label")"

  local launch_command
  launch_command="$(build_launch_command "$workspace_path" "${flag_cli:-other}" "$add_prompt")"

  copy_to_clipboard "$add_prompt" || true

  local _effective_cli="${flag_cli:-other}"
  local handoff_action
  if [[ -n "$flag_launch" ]]; then
    case "$flag_launch" in
      copy) handoff_action="copy_command" ;;
      run)  handoff_action="run_now" ;;
      *)    die "Invalid --launch value: $flag_launch (valid: copy, run)" ;;
    esac
  else
    handoff_action="selected_cli"
  fi

  if [[ "$_effective_cli" == "other" && "$handoff_action" != "run_now" ]]; then
    local _psize
    _psize="$(printf '%s' "$add_prompt" | wc -c | tr -d ' ')"
    printf '\n'
    divider
    printf '\n'
    ok "Re-mapper prompt copied to clipboard ($(format_bytes "$_psize"))"
    printf '\n'
    printf '  %sWorkspace:%s  %s\n' "${BOLD}" "${RESET}" "${workspace_path##*/}"
    printf '  %sCLI:%s        Other (manual paste)\n' "${BOLD}" "${RESET}"
    printf '\n'
    printf '  %sPress Enter to finish.%s\n' "${DIM}" "${RESET}"
    printf '\n'
    divider
    read_from_tty _ >/dev/null 2>&1 || true
  else
    printf '\n'
    header "Copy this prompt and paste it in your tool"
    printf '\n%s%s%s\n\n' "${BOLD}" "$add_prompt" "${RESET}"

    if [[ "$handoff_action" == "selected_cli" && -n "$flag_cli" ]]; then
      handoff_selected_cli "$workspace_path" "$flag_cli" "$preferred_cli_label" "$add_prompt" "$launch_command"
    elif [[ "$handoff_action" == "run_now" ]] && [[ -n "$flag_cli" ]]; then
      run_cli_with_prompt "$workspace_path" "$flag_cli" "$add_prompt" || {
        warn "Could not run ${preferred_cli_label}. Copying the launch command instead."
        copy_to_clipboard "$launch_command" && ok "Launch command copied to your clipboard." || print_box "Terminal Launch Command -- full text" <<< "$launch_command"
      }
    else
      copy_to_clipboard "$launch_command" && ok "Launch command copied to your clipboard." || print_box "Terminal Launch Command -- full text" <<< "$launch_command"
    fi
  fi

  divider
  ok "Add complete: ${BOLD}${workspace_path##*/}${RESET}"
  printf '\n'
}
