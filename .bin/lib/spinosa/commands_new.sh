# shellcheck shell=bash
# New workspace command and integrated onboarding flow.

choose_preferred_cli() {
  local options=(
    "$(option_spec "opencode" "OpenCode" "run the OpenCode CLI with the startup prompt")"
    "$(option_spec "opencode_desktop" "OpenCode Desktop" "open OpenCode and paste the copied prompt")"
    "$(option_spec "gemini" "Gemini" "run the Gemini CLI in this workspace")"
    "$(option_spec "qwen" "Qwen" "run the Qwen CLI in this workspace")"
    "$(option_spec "claude_code" "Claude Code" "run the terminal CLI in this workspace")"
    "$(option_spec "claude_code_desktop" "Claude Code Desktop" "open the desktop app with the prompt ready")"
    "$(option_spec "codex" "Codex" "run the Codex terminal CLI in this workspace")"
    "$(option_spec "codex_app" "Codex App" "open the Codex app and paste the copied prompt")"
    "$(option_spec "hermes" "Hermes Agent" "run the Hermes CLI in this workspace (merge .hermes/workspace.config.yaml first)")"
    "$(option_spec "kilo" "Kilo" "run the Kilo terminal CLI in this workspace")"
    "$(option_spec "other" "Other" "copy a generic launch command for another tool")"
  )
  prompt_choose "Preferred LLM CLI" "${options[@]}"
}



run_integrated_onboarding() {
  local root="$1" project_title="$2" preselected_source="${3:-}"
  local flag_extensions="${4:-}" flag_cli="${5:-}" flag_launch="${6:-}"
  local source_path="" preferred_cli preferred_cli_label startup_prompt launch_command handoff_action handoff_action_text handoff_result
  local copyable_count estimated_bytes free_bytes source_prompt_shown=0

  # ── Step 1: Source folder ─────────────────────────────────────────────
  if [[ -n "$preselected_source" ]]; then
    source_path="$preselected_source"
  fi

  while true; do
    if [[ -z "$source_path" ]]; then
      print_step 1 3 "Source files folder"
      if [[ "$source_prompt_shown" -eq 0 ]]; then
        note "Select the folder containing your research corpus."
      else
        note "Choose another source folder and Spinosa will rescan it before writing anything."
      fi
      source_prompt_shown=1

      while true; do
        source_path="$(prompt_directory "Source folder" "${preselected_source:-}" "")"
        source_path="$(normalize_path_input "$source_path")"
        source_path="$(expand_home "$source_path")"
        if [[ -z "$source_path" ]]; then
          printf '  %s\n' "${R}Source folder is required.${RESET}" >&2
        elif [[ ! -d "$source_path" ]]; then
          printf '  %s\n' "${R}Source folder does not exist: $(display_path "$source_path")${RESET}" >&2
        else
          break
        fi
      done
    fi

    onboarding_log_init "$root" "onboarding" "$source_path"

    print_step 2 3 "Corpus scan and consent"
    print_onboarding_preflight "$root"
    scan_source "$source_path"
    onboarding_log_scan_summary
    print_scan_summary

    if [[ -n "$flag_extensions" ]]; then
      parse_selected_extensions_from_flag "$flag_extensions"
      validate_selected_extensions_against_scan "$flag_extensions" || return 1
    else
      choose_import_batches || return 1
    fi

    configure_selected_import_tools || return 1
    validate_import_tool_coverage "$source_path" || return 1
    onboarding_log_import_options "$source_path" "$flag_extensions"

    copyable_count="$(selected_import_count)"

    if [[ "$copyable_count" -gt 0 ]]; then
      tree_row "Import" "ready" "${copyable_count} files"
      tree_sep
      if is_cloud_storage_path "$source_path"; then
        tree_row "File types" "$(selected_import_extensions_label)"
      else
        tree_row_last "File types" "$(selected_import_extensions_label)"
      fi
    else
      warn "No file types are selected for import."
    fi
    echo ""

    [[ "$copyable_count" -gt 0 ]] || { warn "No workspace copy was prepared. Onboarding stopped after the scan."; return 1; }
    break
  done

  if is_cloud_storage_path "$source_path"; then
    tree_sep
    tree_row_last "Cloud source" "files not fully synced locally may be skipped"
  fi
  copy_source "$source_path" "$root/raw" || return 1
  assert_import_delivered "$source_path" "$root/raw" || {
    warn "Onboarding stopped — raw/ is empty or incomplete. Fix the import issue and run spinosa new again, or use spinosa add."
    return 1
  }

  print_step 3 3 "Startup prompt"
  reset_terminal
  if [[ -n "$flag_cli" ]]; then
    preferred_cli="$flag_cli"
  else
    preferred_cli="$(choose_preferred_cli)" || return 1
  fi
  preferred_cli_label="$(preferred_cli_name "$preferred_cli")"
  tree_sep
  if [[ "$preferred_cli" == "hermes" ]]; then
    tree_row "CLI" "${BOLD}${preferred_cli_label}${RESET}"
    tree_row_last "Hermes setup" "merge ${root}/.hermes/workspace.config.yaml into ~/.hermes/config.yaml"
  else
    tree_row_last "CLI" "${BOLD}${preferred_cli_label}${RESET}"
  fi

  write_setup_files "$root" "$project_title" "$source_path" "$preferred_cli_label"
  sed -i.bak 's/setup_status: not_started/setup_status: cli_started/' "$root/.spinosa/workspace" 2>/dev/null || \
  sed -i '' 's/setup_status: not_started/setup_status: cli_started/' "$root/.spinosa/workspace" 2>/dev/null || true
  rm -f "$root/.spinosa/workspace.bak"

  startup_prompt="$(startup_prompt_text "$project_title" "$root" "$source_path" "$preferred_cli_label")"
  launch_command="$(build_launch_command "$root" "$preferred_cli" "$startup_prompt")"

  copy_to_clipboard "$startup_prompt" || true

  echo ""
  if [[ -n "$flag_launch" ]]; then
    case "$flag_launch" in
      copy) handoff_action="copy_command" ;;
      run)  handoff_action="run_now" ;;
      *)    die "Invalid --launch value: $flag_launch (valid: copy, run)" ;;
    esac
  else
    handoff_action="selected_cli"
  fi

  if [[ "$preferred_cli" == "other" && "$handoff_action" == "selected_cli" ]]; then
    local _psize
    _psize="$(printf '%s' "$startup_prompt" | wc -c | tr -d ' ')"
    divider
    printf '\n'
    ok "Startup prompt copied to clipboard ($(format_bytes "$_psize"))"
    printf '\n'
    printf '  %sWorkspace:%s  %s\n' "${BOLD}" "${RESET}" "${root##*/}"
    printf '  %sCLI:%s        Other (manual paste)\n' "${BOLD}" "${RESET}"
    printf '\n'
    printf '  %sPress Enter to finish.%s\n' "${DIM}" "${RESET}"
    printf '\n'
    divider
    read_from_tty _ >/dev/null 2>&1 || true
    handoff_action_text="$(handoff_action_label "copy_command")"
    handoff_result="prompt_copied"
  else
    header "Copy this prompt and paste it in your tool"
    printf '\n%s%s%s\n\n' "${BOLD}" "$startup_prompt" "${RESET}"

    handoff_action_text="$(handoff_action_label "$handoff_action")"
    handoff_result="launch_command_copied"
    if [[ "$handoff_action" == "selected_cli" ]]; then
      handoff_selected_cli "$root" "$preferred_cli" "$preferred_cli_label" "$startup_prompt" "$launch_command"
    elif [[ "$handoff_action" == "run_now" ]]; then
      run_cli_with_prompt "$root" "$preferred_cli" "$startup_prompt" || {
        handoff_result="run_failed_command_copied"
        warn "Could not run ${preferred_cli_label}. Copying the launch command instead."
        tree_sep
        copy_to_clipboard "$launch_command" && tree_row "Launch command" "copied to clipboard" || print_box "Terminal Launch Command — full text" <<< "$launch_command"
      }
      [[ "$handoff_result" != "run_failed_command_copied" ]] && handoff_result="run_requested"
    else
      tree_sep
      copy_to_clipboard "$launch_command" && tree_row "Launch command" "copied to clipboard" || print_box "Terminal Launch Command — full text" <<< "$launch_command"
    fi
  fi

  write_onboarding_summary "$root" "$project_title" "$source_path" "$preferred_cli_label" "$handoff_action_text" "$handoff_result"
}

# ── framework manifest reader ──────────────────────────────────────────────

# ── detect installed LLM CLIs ──────────────────────────────────────────────


cmd_new() {
  header "Spinosa — New Workspace"

  local corpus_path=""
  local workspace_path=""
  local flag_extensions=""
  local flag_cli=""
  local flag_launch=""
  local new_args
  new_args=()
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --force) die "--force is not supported for spinosa new." ;;
      --extensions)   flag_extensions="$2"; shift 2 ;;
      --cli)          flag_cli="$2"; shift 2 ;;
      --launch)       flag_launch="$2"; shift 2 ;;
      --numbered) NUMBERED="1"; shift ;;
      --no-color) R="" G="" B="" Y="" C="" M="" PG="" DIM="" BOLD="" RESET=""; shift ;;
      --gum|--no-gum) shift ;;
      --help|-h)
        printf '  %s\n' "Usage: spinosa new [corpus-directory] [options]"
        printf '    %s\n' "  --extensions   Comma-separated file types to import (e.g. txt,pdf)"
        printf '    %s\n' "  --cli          Preferred LLM CLI (opencode, gemini, qwen, claude_code, codex, kilo, other)"
        printf '    %s\n' "  --launch       Launch method (copy, run)"
        printf '    %s\n' "  --numbered     Force numbered menus instead of arrow-key menus"
        printf '    %s\n' "  --no-color     Disable colored output"
        return 0
        ;;
      *)
        new_args+=("$1")
        shift
        ;;
    esac
  done

  # ── Step 1: Corpus root ────────────────────────────────────────────────
  if [[ -n "${new_args[0]:-}" ]]; then
    corpus_path="$(expand_home "${new_args[0]}")"
  else
    note "Select the folder containing your research corpus."
    while true; do
      corpus_path="$(prompt_input "Corpus folder" "" "")"
      corpus_path="$(normalize_path_input "$corpus_path")"
      corpus_path="$(expand_home "$corpus_path")"
      if [[ -z "$corpus_path" ]]; then
        printf '  %s\n' "${R}Corpus folder is required.${RESET}" >&2
      elif [[ ! -d "$corpus_path" ]]; then
        printf '  %s\n' "${R}Not a directory: $(display_path "$corpus_path")${RESET}" >&2
      else
        break
      fi
    done
  fi

  # Validate corpus
  corpus_path="$(cd "$corpus_path" 2>/dev/null && pwd)"

  # ── Step 2: Auto-generate workspace path ────────────────────────────────
  local corpus_name
  corpus_name="$(basename "$corpus_path")"
  local parent_dir
  parent_dir="$(dirname "$corpus_path")"
  local suffix="-spinosa"
  local candidate="${parent_dir}/${corpus_name}${suffix}"
  local n=1
  while [[ -e "$candidate" ]]; do
    n=$((n + 1))
    candidate="${parent_dir}/${corpus_name}${suffix}-${n}"
  done
  workspace_path="$candidate"

  # ── Step 3: Initial workspace label ─────────────────────────────────────
  local project_name="$corpus_name"

  # ── Step 4: Create workspace and copy framework ──────────────────────────
  if [[ -z "$FRAMEWORK_ROOT" ]]; then
    die "Framework not found. Is Spinosa installed? Check ${SPINOSA_HOME}/versions/"
  fi
  if [[ ! -f "${FRAMEWORK_ROOT}/.spinosa/framework-files.tsv" ]]; then
    die "Framework manifest not found: ${FRAMEWORK_ROOT}/.spinosa/framework-files.tsv"
  fi

  mkdir -p "$workspace_path/.spinosa"

  local source_framework_version
  source_framework_version="$(framework_version "$FRAMEWORK_ROOT")"

  # Copy all framework-owned files
  while IFS=$'\t' read -r path role _policy; do
    is_framework_manifest_entry "$path" "$role" || continue

    local src="${FRAMEWORK_ROOT}/${path}"
    local dst="${workspace_path}/${path}"

    if [[ -d "$src" ]]; then
      mkdir -p "$dst"
	      copy_dir_contents "$src" "$dst"
    elif [[ -f "$src" ]]; then
      mkdir -p "$(dirname "$dst")"
      safe_copy "$src" "$dst"
    fi
done < "${FRAMEWORK_ROOT}/.spinosa/framework-files.tsv"

# Clean macOS metadata files from framework copy
find "$workspace_path" -name ".DS_Store" -delete 2>/dev/null || true
find "$workspace_path" -name "._*" -delete 2>/dev/null || true

# ── Sync vendor agent folders ──────────────────────────────────────
if [[ -f "$workspace_path/.bin/sync-agents.sh" ]]; then
  bash "$workspace_path/.bin/sync-agents.sh" >/dev/null 2>&1 || true
fi

# Create empty user-state directories with .gitkeep
for dir in raw maps logs agent_reports .trash; do
  mkdir -p "$workspace_path/$dir"
  touch "$workspace_path/$dir/.gitkeep"
done

# ── Step 5: Write workspace metadata ────────────────────────────────────
  cat > "$workspace_path/.spinosa/workspace" << EOF
workspace_version: 1
framework_version: ${source_framework_version}
created: ${TODAY}
project_name: ${project_name}
source_location: ${corpus_path}
setup_status: not_started
EOF

  # Generate manifest with checksums
  printf 'path\tsha256\n' > "$workspace_path/.spinosa/manifest.tsv"
  while IFS=$'\t' read -r path role _policy; do
    is_framework_manifest_entry "$path" "$role" || continue

    local full_path="${workspace_path}/${path}"
    if [[ -f "$full_path" ]]; then
      local hash
      hash="$(sha256_file "$full_path" 2>/dev/null || echo "none")"
      printf '%s\t%s\n' "$path" "$hash" >> "$workspace_path/.spinosa/manifest.tsv"
    elif [[ -d "$full_path" ]]; then
      printf '%s\tdir\n' "$path" >> "$workspace_path/.spinosa/manifest.tsv"
    fi
  done < "${FRAMEWORK_ROOT}/.spinosa/framework-files.tsv"

  # Register workspace in global registry
  register_workspace "$workspace_path" "$project_name"

  # ── Step 6: Onboarding (continuous flow) ────────────────────────────────
  if run_integrated_onboarding "$workspace_path" "$project_name" "$corpus_path" \
    "$flag_extensions" "$flag_cli" "$flag_launch"; then
    tree_sep
    tree_row_last "Workspace" "ready" "${BOLD}${workspace_path##*/}${RESET}"
    printf '\n'
    exit 0
  else
    warn "Onboarding was cancelled or failed — workspace is partially set up."
    printf '\n'
    exit 1
  fi
}
