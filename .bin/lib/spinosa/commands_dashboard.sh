# shellcheck shell=bash
# Dashboard command palette.

cmd_dashboard() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --no-color) R="" G="" B="" Y="" C="" M="" PG="" DIM="" BOLD="" RESET=""; shift ;;
      --numbered) NUMBERED="1"; shift ;;
      --help|-h) cmd_help; return 0 ;;
      -*) shift ;;
    esac
  done
  local version
  version="$(framework_version "$FRAMEWORK_ROOT")"
  [[ -z "$version" || "$version" == "dev" ]] && version="dev"
  local in_workspace=0
  local project_name="" setup_status="" fw_version=""

  print_spinosa_banner "$version"

  # ── Workspace context ─────────────────────────────────────────────────
  if [[ -f ".spinosa/workspace" ]]; then
    in_workspace=1
    project_name="$(grep 'project_name:' .spinosa/workspace 2>/dev/null | sed 's/project_name: *//' | head -1)"
    setup_status="$(grep 'setup_status:' .spinosa/workspace 2>/dev/null | sed 's/setup_status: *//' | head -1)"
    fw_version="$(grep 'framework_version:' .spinosa/workspace 2>/dev/null | sed 's/framework_version: *//' | head -1)"
  fi

  if [[ "$in_workspace" -eq 1 ]]; then
    printf '  %sWorkspace:%s %s\n' "${BOLD}" "${RESET}" "${project_name:-unknown}"
    printf '  %sStatus:%s    %s\n' "${BOLD}" "${RESET}" "${setup_status:-unknown}"
    printf '  %sFramework:%s v%s\n' "${BOLD}" "${RESET}" "${fw_version:-unknown}"
  fi

  printf '\n'
  divider
  printf '\n'

  # ── Menu ──────────────────────────────────────────────────────────────
  while true; do
    local options=()
    options+=("$(option_spec "new" "New workspace" "Create a new workspace and run onboarding")")
    options+=("$(option_spec "add" "Add files" "Import files into an existing workspace")")
    options+=("$(option_spec "startup" "Startup prompt" "Re-run startup prompt on a workspace")")
    options+=("$(option_spec "upgrade" "Upgrade Spinosa" "Upgrade to latest release")")
    options+=("$(option_spec "update" "Update workspace" "Update workspace framework files")")
    options+=("$(option_spec "uninstall" "Uninstall" "Remove Spinosa from this system")")
    options+=("$(option_spec "help" "Help" "Show help information")")
    options+=("$(option_spec "quit" "Quit" "Exit Spinosa")")

    local choice
    choice="$(prompt_choose "What would you like to do?" "${options[@]}")" || return 0

    printf '\n'

    case "$choice" in
      new)       cmd_new "$@" ;;
      add)       cmd_add "$@" ;;
      startup)   cmd_startup "$@" ;;
      upgrade)   cmd_upgrade "$@" ;;
      update)    cmd_update "$@" ;;
      uninstall) cmd_uninstall "$@" ;;
      help)      cmd_help ;;
      quit)      return 0 ;;
      *)         return 0 ;;
    esac

    printf '\n'
  done
}



# ═══════════════════════════════════════════════════════════════════════════
# Auto-upgrade check — runs before every command except upgrade itself
# ═══════════════════════════════════════════════════════════════════════════
