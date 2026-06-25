# shellcheck shell=bash
# Help, uninstall, upgrade, and auto-upgrade commands.

cmd_uninstall() {
  local FORCE_YES=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --no-color) R="" G="" B="" Y="" C="" M="" PG="" DIM="" BOLD="" RESET=""; shift ;;
      --yes|-y) FORCE_YES="1"; shift ;;
      --help|-h) echo "Usage: spinosa uninstall [--yes] [--no-color]" >&2; return 0 ;;
      -*) die "Unknown option: $1. Valid: --yes, --no-color, --help" ;; 
      *) shift ;;
    esac
  done

  local bin_dir="${SPINOSA_BIN_DIR:-$HOME/.local/bin}"

  title "Uninstall"

  if [[ ! -d "$SPINOSA_HOME" ]]; then
    info "Spinosa is not installed (${SPINOSA_HOME} not found)."
    [[ -f "$bin_dir/spinosa" ]] && info "Found stray shim at ${bin_dir}/spinosa" || return 0
  fi

  echo ""
  info "This will remove:"
  [[ -d "$SPINOSA_HOME" ]] && info "  ${SPINOSA_HOME}/  (framework + binary; metadata kept)"
  [[ -f "$bin_dir/spinosa" ]] && info "  ${bin_dir}/spinosa  (shim)"
  echo ""
  warn "Research workspaces are NOT affected."
  echo ""

  if [[ "${FORCE_YES:-}" != "1" ]]; then
    if ! confirm "Remove Spinosa from this system?"; then
      info "Uninstall cancelled."
      return 0
    fi
  fi

  if [[ -d "$SPINOSA_HOME" ]]; then
    ensure_global_metadata
    find "$SPINOSA_HOME" -mindepth 1 -maxdepth 1 ! -name "metadata" -exec rm -rf {} + 2>/dev/null || true
    ok "Removed Spinosa runtime files from ${SPINOSA_HOME}"
    info "Kept metadata registry: ${SPINOSA_METADATA_DIR}"
  fi
  [[ -f "$bin_dir/spinosa" ]] && rm -f "$bin_dir/spinosa" && ok "Removed ${bin_dir}/spinosa"

  divider
  ok "Spinosa uninstalled"
  echo ""
  info "Any research workspaces you created are still intact."
  info "To remove a workspace, delete its directory."
  echo ""
}

# ═══════════════════════════════════════════════════════════════════════════
# COMMAND: help
# ═══════════════════════════════════════════════════════════════════════════


cmd_help() {
  title "Spinosa — Research Framework CLI"

  printf '  %s\n' "${BOLD}Usage:${RESET}"
  printf '  %s\n' "spinosa new [directory]    Create a new workspace and run setup"
  printf '  %s\n' "spinosa add [options]     Add files to an existing workspace"
  printf '  %s\n' "spinosa upgrade           Upgrade Spinosa CLI to latest release"
  printf '  %s\n' "spinosa uninstall         Remove Spinosa from this system"
  printf '  %s\n' "spinosa help              Show this help"
  printf '\n'

  # Detect workspace
  if [[ -f ".spinosa/workspace" ]]; then
    local fw_version project_name setup_status
    fw_version="$(grep 'framework_version:' .spinosa/workspace | awk '{print $2}')"
    project_name="$(grep 'project_name:' .spinosa/workspace | sed 's/project_name: *//')"
    setup_status="$(grep 'setup_status:' .spinosa/workspace | awk '{print $2}')"
    divider
    printf '\n  %s %s\n' "${BOLD}Current workspace:${RESET}" "${project_name:-unknown}"
    printf '  %s %s\n' "${DIM}framework:${RESET}" "${fw_version:-unknown}"
    printf '  %s %s\n' "${DIM}status:${RESET}" "${setup_status:-unknown}"
    printf '\n'
  fi

  # Detect LLM CLIs
  local clis_str
  clis_str="$(detect_llm_clis)"
  if [[ -n "$clis_str" ]]; then
    divider
    printf '\n  %s\n' "${BOLD}Detected LLM CLIs:${RESET}"
    while IFS= read -r cli; do
      printf '    %s %s\n' "${G}✓${RESET}" "$cli"
    done <<< "$clis_str"
    printf '\n'
  fi
}



# ═══════════════════════════════════════════════════════════════════════════
# COMMAND: new
# ═══════════════════════════════════════════════════════════════════════════
# Flow: select corpus root → auto-create sibling workspace → project name → onboard


fetch_release_notes() {
  local version="${1:-latest}"
  local api_url
  
  if [[ "$version" == "latest" ]]; then
    api_url="https://api.github.com/repos/TommasoPrinetti/spinosa/releases/latest"
  else
    api_url="https://api.github.com/repos/TommasoPrinetti/spinosa/releases/tags/v${version}"
  fi
  
  # Use Python for reliable JSON parsing
  local _py=python3
  command -v python3 >/dev/null 2>&1 || _py=python
  curl -fsSL "$api_url" 2>/dev/null | "$_py" -c "
import sys, json
try:
    data = json.load(sys.stdin)
    tag = data.get('tag_name', '')
    published = data.get('published_at', '').replace('T', ' ').replace('Z', '')
    body = data.get('body', '')
    print(f'{tag}|{published}|{body}')
except:
    pass
" 2>/dev/null
}

# Display release notes in a formatted way


display_release_notes() {
  local release_data="$1"
  local tag_name
  
  tag_name="$(echo "$release_data" | cut -d'|' -f1)"

  printf '\n'
  printf '  %s  %s  %s\n' " " " " "A new version is available (${tag_name})."
  printf '  %s  %s  %s\n' " " " " "Run the installer to upgrade."
  echo ""
}

# ═══════════════════════════════════════════════════════════════════════════
# COMMAND: upgrade
# ═══════════════════════════════════════════════════════════════════════════


cmd_upgrade() {
  local target_version="latest"
  local auto_yes=0
  local reinstall=0
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --version) target_version="$2"; shift 2 ;;
      --yes|-y) auto_yes=1; shift ;;
      --reinstall) reinstall=1; shift ;;
      --help|-h)
        printf '  %s\n' "Usage: spinosa upgrade [options]"
        printf '    %s\n' "  --version X.Y.Z   Upgrade to specific version (default: latest)"
        printf '    %s\n' "  --yes             Skip confirmation prompt"
        printf '    %s\n' "  --reinstall       Reinstall current version"
        printf '    %s\n' "  --help            Show this help"
        return 0
        ;;
      -*) die "Unknown upgrade option: $1. Valid: --version, --yes, --reinstall, --help" ;;
      *) shift ;;
    esac
  done

  title "Upgrade"

  # ── resolve target version early ───────────────────────────────────────
  # SPINOSA_REPO env var is intentionally NOT used — self-upgrade
  # must always point to the canonical upstream to prevent supply-chain attacks
  # via compromised environment variables.
  local resolved_version
  if [[ -n "$target_version" && "$target_version" != "latest" ]]; then
    resolved_version="$target_version"
  else
    spinner_start "Resolving latest version"
    resolved_version="$(curl -fsSL "https://api.github.com/repos/TommasoPrinetti/spinosa/releases/latest" 2>/dev/null \
      | grep '"tag_name"' | sed 's/.*"v//;s/".*//' || echo "")"
    spinner_stop
  fi

  # ── check if already on this version ──────────────────────────────────
  local installed_version
  installed_version="$(framework_version "$FRAMEWORK_ROOT")"
  [[ "$installed_version" == "dev" || -z "$installed_version" ]] && installed_version=""

  if [[ "$reinstall" -ne 1 ]]; then
    if [[ -n "$installed_version" && "$resolved_version" == "$installed_version" ]]; then
      info "Already on the latest version (v${installed_version}). Nothing to upgrade."
      return 0
    fi
  fi

  # ── release notes ──────────────────────────────────────────────────────
  if [[ "$auto_yes" -ne 1 ]]; then
    spinner_start "Fetching release notes"
    local release_data
    release_data="$(fetch_release_notes "$resolved_version")"
    spinner_stop

    if [[ -n "$release_data" ]]; then
      display_release_notes "$release_data"
    else
      warn "Could not fetch release notes"
      printf '\n'
    fi

    if ! confirm "Download and run the Spinosa installer to upgrade?" "y"; then
      info "Upgrade cancelled."
      return 0
    fi
  fi

  # ── download installer ──────────────────────────────────────────────────
  info "Downloading installer..."

  local tmpdir
  tmpdir="$(mktemp -d)"
  local installer="${tmpdir}/install-spinosa.sh"

  spinner_start "Downloading installer v${resolved_version}"
	  curl -fsSL "https://github.com/TommasoPrinetti/spinosa/releases/download/v${resolved_version}/install.sh" -o "$installer" 2>/dev/null \
	    || { spinner_stop; die "Could not download release installer for v${resolved_version}. Aborting rather than falling back to an unpinned branch."; }
	  spinner_stop
	  ok "Installer downloaded"

  local upgrade_args=("--upgrade" "--version" "$resolved_version" "--no-launch")
  if [[ "$auto_yes" -eq 1 ]]; then
    upgrade_args+=("--yes")
  fi
  if [[ "$reinstall" -eq 1 ]]; then
    upgrade_args+=("--reinstall")
  fi

  bash "$installer" "${upgrade_args[@]}"

  rm -rf "$tmpdir"
}

# ═══════════════════════════════════════════════════════════════════════════
# COMMAND: dashboard
# ═══════════════════════════════════════════════════════════════════════════
# shellcheck disable=SC2120


auto_upgrade_check() {
  [[ "${SPINOSA_NO_UPGRADE_CHECK:-0}" != "1" ]] || return 0
  [[ -t 0 ]] || return 0
  local installed_version
  installed_version="$(framework_version "$FRAMEWORK_ROOT")"
  [[ "$installed_version" != "dev" ]] || return 0

  ensure_global_metadata
  local cache_file="$SPINOSA_VERSION_CACHE"
  local now
  now="$(date +%s)"
  if [[ -f "$cache_file" ]]; then
    local skip_until
    skip_until="$(sed -n '3p' "$cache_file" 2>/dev/null || echo 0)"
    [[ "$now" -lt "$skip_until" ]] && return 0
  fi

  local latest
  if ! command -v curl >/dev/null 2>&1; then return 0; fi
  latest="$(curl -fsSL --connect-timeout 5 --max-time 15 "https://api.github.com/repos/TommasoPrinetti/spinosa/releases/latest" 2>/dev/null \
    | grep '"tag_name"' | sed 's/.*"v//;s/".*//')"
  [[ -n "$latest" ]] || return 0

  printf '%s\n%s\n0\n' "$now" "$latest" > "$cache_file"

  [[ "$latest" != "$installed_version" ]] || return 0

  printf '\n  %sSpinosa v%s is installed. v%s is available.%s\n\n' "${BOLD}" "$installed_version" "$latest" "${RESET}"
  if confirm "Upgrade now?" "y"; then
    info "Running upgrade..."
    cmd_upgrade --version "$latest" --yes
  else
    printf '%s\n%s\n%d\n' "$now" "$latest" "$(( now + 604800 ))" > "$cache_file"
    info "Upgrade skipped. You can upgrade anytime with: spinosa upgrade"
  fi
}
