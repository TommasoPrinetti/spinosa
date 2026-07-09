# shellcheck shell=bash
# Startup prompt command — rerun the startup prompt on an existing workspace.

cmd_startup() {
  header "Spinosa — Startup Prompt"

  local workspace_path=""
  local flag_cli=""
  local flag_launch=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --workspace|-w) workspace_path="$2"; shift 2 ;;
      --cli)          flag_cli="$2"; shift 2 ;;
      --launch)       flag_launch="$2"; shift 2 ;;
      --no-color)     R="" G="" B="" Y="" C="" M="" PG="" DIM="" BOLD="" RESET=""; shift ;;
      --numbered)     NUMBERED="1"; shift ;;
      --help|-h)
        printf '  %s\n' "Usage: spinosa startup [options]"
        printf '    %s\n' "  --workspace, -w  Path to existing Spinosa workspace"
        printf '    %s\n' "  --cli            Preferred LLM CLI (opencode, gemini, qwen, claude_code, codex, hermes, kilo, other)"
        printf '    %s\n' "  --launch         Launch method (copy, run)"
        printf '    %s\n' "  --no-color       Disable colored output"
        return 0
        ;;
      *) die "Unknown option: $1" ;;
    esac
  done

  # ---- Step 1: Workspace selection ------------------------------------------------
  print_step 1 2 "Workspace selection"

  workspace_path="$(require_workspace "$workspace_path")" || die "No workspace selected."
  ok "Selected: ${BOLD}${workspace_path##*/}${RESET}"

  # ---- Read workspace metadata ----------------------------------------------------
  local project_name source_location
  project_name="$(grep 'project_name:' "$workspace_path/.spinosa/workspace" 2>/dev/null | sed 's/project_name: *//' | head -1)"
  source_location="$(grep 'source_location:' "$workspace_path/.spinosa/workspace" 2>/dev/null | sed 's/source_location: *//' | head -1)"
  : "${project_name:=Unnamed}"

  # ---- Step 2: CLI selection ------------------------------------------------
  print_step 2 2 "Tool selection"

  local preferred_cli preferred_cli_label
  if [[ -n "$flag_cli" ]]; then
    preferred_cli="$flag_cli"
    preferred_cli_label="$(preferred_cli_name "$preferred_cli")"
  else
    preferred_cli="$(choose_preferred_cli)" || return 1
    preferred_cli_label="$(preferred_cli_name "$preferred_cli")"
  fi

  # ---- Generate startup prompt ----------------------------------------------------
  local startup_prompt launch_command
  startup_prompt="$(startup_prompt_text "$project_name" "$workspace_path" "$source_location" "$preferred_cli_label")"
  launch_command="$(build_launch_command "$workspace_path" "$preferred_cli" "$startup_prompt")"

  copy_to_clipboard "$startup_prompt" || true

  if [[ "$preferred_cli" == "other" && -z "$flag_launch" ]]; then
    local _psize
    _psize="$(printf '%s' "$startup_prompt" | wc -c | tr -d ' ')"
    printf '\n'
    divider
    printf '\n'
    ok "Startup prompt copied to clipboard ($(format_bytes "$_psize"))"
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
    printf '\n%s%s%s\n\n' "${BOLD}" "$startup_prompt" "${RESET}"

    # ---- Handoff ----------------------------------------------------
    if [[ "$flag_launch" == "copy" ]]; then
      copy_to_clipboard "$launch_command" && ok "Launch command copied to your clipboard." || print_box "Terminal Launch Command -- full text" <<< "$launch_command"
    elif [[ "$flag_launch" == "run" ]] && [[ -n "$preferred_cli" ]]; then
      run_cli_with_prompt "$workspace_path" "$preferred_cli" "$startup_prompt" || {
        warn "Could not run ${preferred_cli_label}. Copying the launch command instead."
        copy_to_clipboard "$launch_command" && ok "Launch command copied to your clipboard." || print_box "Terminal Launch Command -- full text" <<< "$launch_command"
      }
    else
      handoff_selected_cli "$workspace_path" "$preferred_cli" "$preferred_cli_label" "$startup_prompt" "$launch_command"
    fi
  fi

  divider
  ok "Startup prompt ready for: ${BOLD}${workspace_path##*/}${RESET}"
  printf '\n'
}
