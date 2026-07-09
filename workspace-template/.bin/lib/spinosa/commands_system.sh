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
  printf '  %s\n' "spinosa [<global-flags>] <command> [<args>]"
  printf '  %s\n' "spinosa <command> --help"
  printf '\n'

  printf '  %s\n' "${BOLD}Conventions:${RESET}"
  printf '  %s\n' "<required> is a positional argument you must supply."
  printf '  %s\n' "[optional] may be omitted."
  printf '\n'

  printf '  %s\n' "${BOLD}Global flags:${RESET}"
  printf '  %s\n' "spinosa --no-upgrade-check  Skip the startup upgrade reminder"
  printf '  %s\n' "spinosa --no-color          Disable colored output"
  printf '  %s\n' "spinosa --numbered          Force numbered menus"
  printf '\n'

  printf '  %s\n' "${BOLD}Commands:${RESET}"
  printf '  %s\n' "spinosa                    Open Spinosa TUI (requires OpenCode)"
  printf '  %s\n' "spinosa cli                Open the terminal dashboard (CLI menu)"
  printf '  %s\n' "spinosa new [<corpus-directory>] [--extensions LIST] [--cli CLI] [--launch MODE]"
  printf '  %s\n' "spinosa add [--workspace PATH] [--file PATH | --dir PATH] [--extensions LIST]"
  printf '  %s\n' "spinosa upgrade [--channel stable|beta] [--version X.Y.Z] [--yes] [--reinstall]"
  printf '  %s\n' "spinosa update [<workspace-path>] [--yes] [--dry-run] [--force]"
  printf '  %s\n' "spinosa startup [--workspace PATH] [--cli CLI] [--launch MODE]"
  printf '  %s\n' "spinosa doctor [--workspace PATH] [--yes]"
  printf '  %s\n' "spinosa uninstall [--yes]"
  printf '  %s\n' "spinosa version"
  printf '  %s\n' "spinosa help"
  printf '\n'

  printf '  %s\n' "${BOLD}Examples:${RESET}"
  printf '  %s\n' "spinosa new ./corpus"
  printf '  %s\n' "spinosa upgrade --channel beta --version 1.2.3 --yes"
  printf '  %s\n' "spinosa update ./workspace --dry-run"
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
  local api_url tag

  if [[ "$version" == "latest" ]]; then
    api_url="https://api.github.com/repos/${SPINOSA_RELEASE_REPO}/releases/latest"
  else
    tag="v${version}"
    api_url="https://api.github.com/repos/${SPINOSA_RELEASE_REPO}/releases/tags/${tag}"
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
  
  tag_name="$(echo "$release_data" | awk -F'|' '{print $1; exit}')"

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
  local explicit_channel=0
  local channel
  channel="$(spinosa_release_channel)"
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --version) target_version="$2"; shift 2 ;;
      --channel) channel="$2"; explicit_channel=1; shift 2 ;;
      --yes|-y) auto_yes=1; shift ;;
      --reinstall) reinstall=1; shift ;;
      --help|-h)
        printf '  %s\n' "Usage: spinosa upgrade [--channel NAME] [--version X.Y.Z] [--yes] [--reinstall]"
        printf '    %s\n' "  --channel NAME    Release channel: stable (default) or beta (prereleases)"
        printf '    %s\n' "  --version X.Y.Z   Upgrade to a specific version instead of the latest on the channel"
        printf '    %s\n' "  --yes             Skip the confirmation prompt"
        printf '    %s\n' "  --reinstall       Reinstall the currently installed version"
        printf '    %s\n' "  --help            Show this help"
        return 0
        ;;
      -*) die "Unknown upgrade option: $1. Valid: --version, --channel, --yes, --reinstall, --help" ;;
      *) shift ;;
    esac
  done
  case "$channel" in
    stable|beta|dev) ;;
    *) die "Unknown release channel: ${channel} (use stable or beta)" ;;
  esac
  [[ "$channel" == "dev" ]] && channel="beta"
  [[ "$explicit_channel" -eq 1 ]] && set_release_channel "$channel"

  title "Upgrade"

  # ── resolve target version early ───────────────────────────────────────
  # SPINOSA_REPO env var is intentionally NOT used — self-upgrade
  # must always point to the canonical upstream to prevent supply-chain attacks
  # via compromised environment variables.
  local resolved_version installer_url
  if [[ -n "$target_version" && "$target_version" != "latest" ]]; then
    resolved_version="$target_version"
    installer_url="$(install_url_for_channel "$channel" "$resolved_version")"
  else
    spinner_start "Resolving latest ${channel} version"
    resolved_version="$(resolve_release_version_for_channel "$channel")"
    spinner_stop
    installer_url="$(install_url_for_channel "$channel" "latest")"
  fi

  # ── check if already on this version ──────────────────────────────────
  local installed_version
  installed_version="$(framework_version "$TEMPLATE_ROOT")"
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
  trap 'rm -rf "$tmpdir" 2>/dev/null || true' EXIT INT TERM
  tmpdir="$(mktemp -d)"
  local installer="${tmpdir}/install-spinosa.sh"

  spinner_start "Downloading installer v${resolved_version} (${channel})"
  if [[ "$channel" == "beta" && "$target_version" == "latest" ]]; then
    curl -fsSL "$installer_url" -o "$installer" 2>/dev/null \
      || { spinner_stop; die "Could not download beta installer from ${installer_url}. Publish a prerelease first."; }
  else
    curl -fsSL "$installer_url" -o "$installer" 2>/dev/null \
      || { spinner_stop; die "Could not download release installer for v${resolved_version}. Aborting rather than falling back to an unpinned branch."; }
  fi
  spinner_stop
  ok "Installer downloaded (${channel})"

  local upgrade_args=("--upgrade" "--version" "$resolved_version" "--no-launch")
  if [[ "$auto_yes" -eq 1 ]]; then
    upgrade_args+=("--yes")
  fi
  if [[ "$reinstall" -eq 1 ]]; then
    upgrade_args+=("--reinstall")
  fi

  spinosa_log INFO "upgrade installer=${installer} args=${upgrade_args[*]}"
  if ! bash "$installer" "${upgrade_args[@]}"; then
    spinosa_log ERROR "installer exited non-zero"
    die "Installer failed. Existing CLI may still be present, but workspace update was not run. See $(spinosa_log_file)"
  fi

  rm -f "$SPINOSA_VERSION_CACHE" "$SPINOSA_VERSION_CACHE"_* 2>/dev/null || true
  rm -rf "$tmpdir"

  # Re-resolve framework root so post-upgrade operations see the new version
  TEMPLATE_ROOT="$(resolve_template_root)"
  local post_install_version
  post_install_version="$(framework_version "$TEMPLATE_ROOT")"
  if [[ "$post_install_version" != "$resolved_version" ]]; then
    die "Installer completed but active framework is v${post_install_version:-unknown}; expected v${resolved_version}. Aborting workspace update."
  fi

  # Libraries were sourced at process start (pre-upgrade). Workspace update must
  # run under the new framework on disk — re-exec or migrate/cloud fixes are skipped.
  if [[ -z "${SPINOSA_POST_UPGRADE_REEXEC:-}" ]]; then
    export SPINOSA_POST_UPGRADE_REEXEC=1
    export SPINOSA_NO_UPGRADE_CHECK=1
    exec "${SPINOSA_HOME}/bin/spinosa" __post_upgrade_workspaces
  fi

  prompt_upgrade_workspaces
}

# ═══════════════════════════════════════════════════════════════════════════
# Upgraded-workspace update flow
# ═══════════════════════════════════════════════════════════════════════════

# Called after a successful spinosa upgrade. Loads all registered workspaces,
# presents a multi-select toggle list, and runs cmd_update on each selection.

prompt_upgrade_workspaces() {
  # ── load registered workspaces ───────────────────────────────────────────
  local workspace_data
  workspace_data="$(discover_registered_workspaces 2>/dev/null || true)"
  [[ -n "$workspace_data" ]] || return 0

  local workspace_entries=()
  local ws_path ws_project
  while IFS='|' read -r ws_path ws_project; do
    [[ -n "$ws_path" ]] || continue
    workspace_entries+=("$ws_path|$ws_project")
  done <<< "$workspace_data"

  [[ ${#workspace_entries[@]} -gt 0 ]] || return 0

  # ── build options ────────────────────────────────────────────────────────
  local options=()
  options+=("$(option_spec "__all__" "All workspaces" "toggle all on or off")")
  local entry _path _project _ws_name _setup_status
  for entry in "${workspace_entries[@]}"; do
    _path="${entry%%|*}"
    _project="${entry#*|}"
    _ws_name="$(basename "$_path")"
    _setup_status="$(grep -m1 'setup_status:' "$_path/.spinosa/workspace" 2>/dev/null | sed 's/setup_status: *//')"
    options+=("$(option_spec "$_path" "$_project" "$_ws_name — ${_setup_status:-unknown}")")
  done

  # ── toggle prompt ────────────────────────────────────────────────────────
  echo ""
  divider
  printf '\n'
  note "CLI upgrade updates ~/.spinosa/ — not your workspace folders."
  note "Workspace update syncs framework files and regenerates vendor mirrors (vendor/opencode/, .hermes/skills/, …)."
  local _cloud_ws=0 _entry _path
  for _entry in "${workspace_entries[@]}"; do
    _path="${_entry%%|*}"
    is_cloud_storage_path "$_path" && _cloud_ws=1 && break
  done
  if [[ "$_cloud_ws" -eq 1 ]]; then
    warn "One or more workspaces are on cloud storage (Google Drive, Dropbox, OneDrive)."
    note "Open the workspace folder locally and wait for sync to finish before updating."
  fi

  MULTI_CHOOSE_EXCLUDE=""
  prompt_multi_choose "Select workspaces to update" "${options[@]}" || return 0

  local selected=()
  if [[ ${#MULTI_CHOOSE_RESULTS[@]} -gt 0 ]]; then
    selected=("${MULTI_CHOOSE_RESULTS[@]}")
  fi

  [[ ${#selected[@]} -gt 0 ]] || { info "No workspaces selected."; return 0; }

  # ── update each selected workspace (in subshell so failures don't abort) ─
  divider
  printf '\n  %sUpdating %d workspace(s)...%s\n\n' "${BOLD}" "${#selected[@]}" "${RESET}"
  local ws ws_name
  for ws in "${selected[@]}"; do
    ws_name="$(basename "$ws")"
    if (cmd_update "$ws" --yes); then
      ok "Updated: ${ws_name}"
    else
      warn "Update failed for: ${ws_name}"
    fi
    echo ""
  done

  divider
  info "Workspace update complete."
  echo ""
  note "Integration checklist:"
  note "  • Vendor mirrors (vendor/opencode/, .hermes/skills/, etc.) were regenerated by sync-agents"
  note "  • Hermes: merge .hermes/workspace.config.yaml → ~/.hermes/config.yaml"
  note "  • Run: spinosa doctor"
  echo ""
}

# ═══════════════════════════════════════════════════════════════════════════
# COMMAND: update
# ═══════════════════════════════════════════════════════════════════════════

# ── sync_dir_contents ────────────────────────────────────────────────────────
# Like copy_dir_contents but also removes destination items that no longer
# exist in the source (true sync, not just additive copy).

sync_dir_contents() {
  local src="$1" dst="$2"
  local src_real dst_real
  src_real="$(cd "$src" 2>/dev/null && pwd -P)" || { warn "Cannot sync missing directory: $src"; return 1; }
  dst_real="$(cd "$dst" 2>/dev/null && pwd -P)" || dst_real=""
  mkdir -p "$dst"
  if rsync_copy_dir_contents "$src_real" "$dst" 1; then
    return 0
  fi
  # Cloud destinations: skip find/rm prune (can hang on Drive/Dropbox FUSE).
  if [[ -n "$dst_real" ]] && ! is_cloud_storage_path "$dst"; then
    while IFS= read -r -d '' item; do
      local rel="${item#"$dst_real"/}"
      [[ -e "$src_real/$rel" ]] || cloud_rm_rf "$item" 2>/dev/null || true
    done < <(find -P "$dst_real" -depth -mindepth 1 -print0 2>/dev/null)
  fi
  safe_copy_tree "$src_real" "$dst"
}

# ── compare_versions ─────────────────────────────────────────────────────────
# Returns: 0 = equal, 1 = first > second, 2 = first < second

compare_versions() {
  local original_a="$1" original_b="$2"
  local a="${original_a%%-*}" b="${original_b%%-*}"
  local apre="" bpre=""
  if [[ "$original_a" == *-* ]]; then
    apre="${original_a#*-}"
    apre="${apre%%+*}"
  fi
  if [[ "$original_b" == *-* ]]; then
    bpre="${original_b#*-}"
    bpre="${bpre%%+*}"
  fi
  a="${a%%+*}" b="${b%%+*}"
  local IFS=.
  set -f
  set -- $a
  set +f
  local av=("$@")
  set -f
  set -- $b
  set +f
  local bv=("$@")
  local i max
  max=${#av[@]}; [[ "${#bv[@]}" -gt "$max" ]] && max="${#bv[@]}"
  for ((i=0; i<max; i++)); do
    local an="${av[$i]:-0}" bn="${bv[$i]:-0}"
    an="${an//[^0-9]/}"; an="${an:-0}"
    bn="${bn//[^0-9]/}"; bn="${bn:-0}"
    if (( an > bn )); then return 1; fi
    if (( an < bn )); then return 2; fi
  done
  if [[ -z "$apre" && -n "$bpre" ]]; then return 1; fi
  if [[ -n "$apre" && -z "$bpre" ]]; then return 2; fi
  if [[ -n "$apre" && -n "$bpre" && "$apre" != "$bpre" ]]; then
    set -f
    set -- $apre
    set +f
    local ap=("$@")
    set -f
    set -- $bpre
    set +f
    local bp=("$@")
    max=${#ap[@]}; [[ "${#bp[@]}" -gt "$max" ]] && max="${#bp[@]}"
    for ((i=0; i<max; i++)); do
      local ai="${ap[$i]:-}" bi="${bp[$i]:-}"
      [[ "$ai" == "$bi" ]] && continue
      [[ -z "$ai" ]] && return 2
      [[ -z "$bi" ]] && return 1
      if [[ "$ai" =~ ^[0-9]+$ && "$bi" =~ ^[0-9]+$ ]]; then
        if (( 10#$ai > 10#$bi )); then return 1; fi
        if (( 10#$ai < 10#$bi )); then return 2; fi
      elif [[ "$ai" =~ ^[0-9]+$ ]]; then
        return 2
      elif [[ "$bi" =~ ^[0-9]+$ ]]; then
        return 1
      else
        [[ "$ai" > "$bi" ]] && return 1
        [[ "$ai" < "$bi" ]] && return 2
      fi
    done
  fi
  return 0
}


cmd_update() {
  local auto_yes=0 dry_run=0 force=0
  local args=()

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --yes|-y)       auto_yes=1; shift ;;
      --dry-run)      dry_run=1; auto_yes=1; shift ;;
      --force)        force=1; shift ;;
      --help|-h)
        printf '  %s\n' "Usage: spinosa update [options] [workspace-path]"
        printf '    %s\n' "  --yes             Skip confirmation prompt"
        printf '    %s\n' "  --dry-run         Preview changes without applying them"
        printf '    %s\n' "  --force           Compatibility flag (framework-owned paths already overwrite)"
        printf '    %s\n' "  --help            Show this help"
        printf '    %s\n' "  workspace-path    Optional path to a Spinosa workspace"
        return 0
        ;;
      -*) die "Unknown update option: $1. Valid: --yes, --dry-run, --force, --help" ;;
      *)  args+=("$1"); shift ;;
    esac
  done

  title "Update"

  # ── resolve workspace ────────────────────────────────────────────────────
  local workspace_path installed_version_filter
  installed_version_filter="$(framework_version "$TEMPLATE_ROOT")"
  if [[ -z "$installed_version_filter" || "$installed_version_filter" == "dev" || "$installed_version_filter" == "__VERSION__" ]]; then
    # Fallback: try metadata/version (always present), then install.sh PINNED_VERSION
    if [[ -f "${TEMPLATE_ROOT}/metadata/version" ]]; then
      installed_version_filter="$(sed -n '1p' "${TEMPLATE_ROOT}/metadata/version")"
    elif [[ -f "${TEMPLATE_ROOT}/install.sh" ]]; then
      installed_version_filter="$(grep -m1 '^PINNED_VERSION=' "${TEMPLATE_ROOT}/install.sh" | sed 's/^PINNED_VERSION="\(.*\)"/\1/')"
      [[ "$installed_version_filter" == "__VERSION__" ]] && installed_version_filter=""
    fi
  fi
  if [[ -n "${args[0]:-}" ]]; then
    workspace_path="$(normalize_path_input "${args[0]}")"
    workspace_path="$(expand_home "$workspace_path")"
    validate_workspace "$workspace_path" || die "Not a valid Spinosa workspace: $workspace_path"
    register_workspace "$workspace_path" "$(basename "$workspace_path")" 2>/dev/null || true
  else
    workspace_path="$(require_workspace "" 1 "$installed_version_filter")" || die "No workspace found."
  fi

  if [[ "$workspace_path" == "__all__" ]]; then
    local workspace_data ws_path ws_project
    local -a all_workspaces=() inner_args=()
    workspace_data="$(discover_registered_workspaces 2>/dev/null || true)"
    while IFS='|' read -r ws_path ws_project; do
      [[ -n "$ws_path" ]] || continue
      workspace_list_contains_path "$ws_path" "${all_workspaces[@]-}" && continue
      if [[ -n "$installed_version_filter" ]] && ! workspace_needs_framework_update "$ws_path" "$installed_version_filter"; then
        continue
      fi
      all_workspaces+=("$ws_path")
    done <<< "$workspace_data"

    [[ ${#all_workspaces[@]} -gt 0 ]] || {
      if [[ -n "$installed_version_filter" && "$installed_version_filter" != "dev" ]]; then
        info "All registered workspaces already match v${installed_version_filter}."
        return 0
      fi
      die "No registered workspaces found."
    }

    if [[ "$auto_yes" -ne 1 ]]; then
      note "Batch update: $(plural_count "${#all_workspaces[@]}" "workspace")"
      note "Runs the same framework sync on each registered workspace"
    fi

    [[ "$dry_run" -eq 1 ]] && inner_args+=("--dry-run")
    [[ "$force" -eq 1 ]] && inner_args+=("--force")
    inner_args+=("--yes")

    local batch_failed=0 batch_index=0 total_workspaces=${#all_workspaces[@]}
    for ws_path in "${all_workspaces[@]-}"; do
      batch_index=$((batch_index + 1))
      divider
      printf '  %s%s[%d/%d] %s%s\n\n' "${BOLD}${C}" "Update" "$batch_index" "$total_workspaces" "$(basename "$ws_path")" "${RESET}"
      if ! cmd_update "${inner_args[@]}" "$ws_path"; then
        batch_failed=1
      fi
    done

    return "$batch_failed"
  fi

  # ── workspace paths (.spinosa/ is the canonical metadata location) ──
  local ws_metadata ws_manifest
  if [[ -f "${workspace_path}/.spinosa/workspace" ]]; then
    ws_metadata="${workspace_path}/.spinosa/workspace"
    ws_manifest="${workspace_path}/.spinosa/manifest.tsv"
  elif [[ -f "${workspace_path}/framework/spinosa/workspace" ]]; then
    # Reverse-migrate from old framework/spinosa/ to .spinosa/
    note "Migrating workspace to new framework layout (.spinosa/)..."
    mkdir -p "${workspace_path}/.spinosa"
    cp "${workspace_path}/framework/spinosa/workspace" "${workspace_path}/.spinosa/workspace" 2>/dev/null || true
    [[ -f "${workspace_path}/framework/spinosa/manifest.tsv" ]] && \
      cp "${workspace_path}/framework/spinosa/manifest.tsv" "${workspace_path}/.spinosa/manifest.tsv" 2>/dev/null || true
    ws_metadata="${workspace_path}/.spinosa/workspace"
    ws_manifest="${workspace_path}/.spinosa/manifest.tsv"
    ok "Workspace migrated"
  fi
  local fw_manifest="${TEMPLATE_ROOT}/.spinosa/workspace-files.tsv"
  local retired_manifest="${TEMPLATE_ROOT}/.spinosa/retired-workspace-files.tsv"

  [[ -f "$fw_manifest" ]] || die "Framework manifest not found: $fw_manifest"
  [[ -f "$ws_metadata" ]] || die "Workspace metadata not found. Run 'spinosa new' to create a workspace first."

  # ── detect and compare versions ──────────────────────────────────────────
  local installed_version workspace_version
  installed_version="$(framework_version "$TEMPLATE_ROOT")"
  workspace_version="$(grep -m1 'framework_version:' "$ws_metadata" | awk '{print $2}')"

  if [[ -z "$workspace_version" ]]; then
    warn "Could not read workspace framework version."
  elif [[ "$installed_version" != "dev" && -n "$workspace_version" ]]; then
    local cmp=0
    compare_versions "$installed_version" "$workspace_version" || cmp=$?
    if [[ "$cmp" -eq 2 ]]; then
      die "Installed framework v${installed_version} is OLDER than workspace v${workspace_version}. Run 'spinosa upgrade' first."
    fi
    info "Installed: v${installed_version}  |  Workspace: v${workspace_version}"
  fi
  echo ""

  if is_cloud_storage_path "$workspace_path"; then
    note "Cloud folder detected."
  fi

  if [[ "$force" -eq 1 ]]; then
    note "--force is no longer needed; release-managed workspace files overwrite by default."
  fi

  # ── check workspace manifest exists ─────────────────────────────────────
  local manifest_has_entries=0
  if [[ -f "$ws_manifest" ]] && [[ $(awk 'NR>1' "$ws_manifest" 2>/dev/null | wc -l) -gt 0 ]]; then
    manifest_has_entries=1
  fi

  local manifest_total=0 manifest_idx=0
  while IFS=$'\t' read -r _path _role _policy; do
    is_framework_manifest_entry "$_path" "$_role" || continue
    case "${_policy:-replace_if_unmodified}" in
      never_replace|exclude_from_update) ;;
      *) manifest_total=$((manifest_total + 1)) ;;
    esac
  done < "$fw_manifest"

  if [[ "$manifest_has_entries" -eq 0 ]]; then
    warn "No prior workspace manifest found — obsolete framework files cannot be auto-removed on this run."
  fi

  # ── confirm ──────────────────────────────────────────────────────────────
  if [[ "$auto_yes" -ne 1 ]]; then
    if [[ -n "$workspace_version" && "$installed_version" != "dev" && -n "$installed_version" ]]; then
      note "Framework ${workspace_version} → ${installed_version} · ${manifest_total} paths"
    else
      note "Sync ${manifest_total} framework paths to v${installed_version}"
    fi
    note "Overwrites release-managed workspace files; preserves user-state paths like raw/, system/context.md, and workspace notes."
    if ! confirm "Update framework files in this workspace?" "y"; then
      info "Update cancelled."
      return 0
    fi
  fi

  if [[ "$dry_run" -eq 1 ]]; then
    info "Dry-run — previewing ${manifest_total} framework paths"
  else
    info "Updating workspace files (${manifest_total} paths)…"
  fi
  echo ""

  # ── Phase 0: migrate legacy logs/ → framework/logs/ ───────────────────────────────
  migrate_workspace_logs_dir "$workspace_path" "$dry_run"

  # ── Phase 1: build framework file set ─────────────────────────────────────
  local processed_list declared_list
  processed_list="$(mktemp)" || die "Cannot create temp file"
  declared_list="$(mktemp)" || { rm -f "$processed_list" 2>/dev/null || true; die "Cannot create temp file"; }
  while IFS=$'\t' read -r fw_path fw_role fw_policy; do
    [[ -n "$fw_path" && "$fw_path" != "path" ]] || continue
    echo "$fw_path" >> "$declared_list"
    is_framework_manifest_entry "$fw_path" "$fw_role" || continue
    echo "$fw_path" >> "$processed_list"
  done < "$fw_manifest"

  # ── Phase 2: ADD + REPLACE from workspace-files.tsv ───────────────────────
  local updated=0 skipped=0 added=0 removed=0 retired_found=0 copy_failed=0
  local src dst policy
  local -a update_changed_paths=()

  update_sync_dir() {
    local src_path="$1" dst_path="$2" label="$3"
    SPINOSA_SYNC_LABEL="$label"
    sync_dir_contents "$src_path" "$dst_path"
    local rc=$?
    unset SPINOSA_SYNC_LABEL
    return "$rc"
  }

  rewrite_workspace_manifest() {
    local manifest_tmp path role policy full_path manifest_idx_local=0
    manifest_tmp="$(mktemp "${TMPDIR:-/tmp}/spinosa-workspace-manifest.XXXXXX")" || die "Cannot create manifest temp file"
    printf 'path\tkind\n' > "$manifest_tmp"
    spinosa_log INFO "rebuilding workspace manifest workspace=${workspace_path}"
    while IFS=$'\t' read -r path role policy; do
      is_framework_manifest_entry "$path" "$role" || continue
      manifest_idx_local=$((manifest_idx_local + 1))
      full_path="${workspace_path}/${path}"
      if [[ -f "$full_path" ]]; then
        render_update_manifest_progress "$manifest_idx_local" "$manifest_total" "$path" "recording"
        printf '%s\tfile\n' "$path" >> "$manifest_tmp"
      elif [[ -d "$full_path" ]]; then
        render_update_manifest_progress "$manifest_idx_local" "$manifest_total" "$path" "recording"
        printf '%s\tdir\n' "$path" >> "$manifest_tmp"
      fi
    done < "$fw_manifest"
    clear_progress_line

    if is_cloud_storage_path "$ws_manifest"; then
      safe_copy "$manifest_tmp" "$ws_manifest" || {
        rm -f "$manifest_tmp" 2>/dev/null || true
        die "Failed to write workspace manifest (${SPINOSA_LAST_COPY_FAIL_REASON:-I/O error})"
      }
    else
      mv -f "$manifest_tmp" "$ws_manifest" || {
        rm -f "$manifest_tmp" 2>/dev/null || true
        die "Failed to write workspace manifest"
      }
      return 0
    fi
    rm -f "$manifest_tmp" 2>/dev/null || true
  }

  update_workspace_version_metadata() {
    local metadata_tmp
    metadata_tmp="$(mktemp "${TMPDIR:-/tmp}/spinosa-workspace-metadata.XXXXXX")" || die "Cannot create workspace metadata temp file"
    cp -p "$ws_metadata" "$metadata_tmp" 2>/dev/null || cat "$ws_metadata" > "$metadata_tmp" || {
      rm -f "$metadata_tmp" 2>/dev/null || true
      die "Failed to stage workspace metadata for update"
    }
    if grep -q '^framework_version:' "$metadata_tmp" 2>/dev/null; then
      if [[ "$(uname -s)" == "Darwin" ]]; then
        sed -i '' "s/^framework_version:.*/framework_version: ${installed_version}/" "$metadata_tmp"
      else
        sed -i "s/^framework_version:.*/framework_version: ${installed_version}/" "$metadata_tmp"
      fi
    fi
    if is_cloud_storage_path "$ws_metadata"; then
      safe_copy "$metadata_tmp" "$ws_metadata" || {
        rm -f "$metadata_tmp" 2>/dev/null || true
        die "Failed to update workspace metadata (${SPINOSA_LAST_COPY_FAIL_REASON:-I/O error})"
      }
    else
      mv -f "$metadata_tmp" "$ws_metadata" || {
        rm -f "$metadata_tmp" 2>/dev/null || true
        die "Failed to update workspace metadata"
      }
      return 0
    fi
    rm -f "$metadata_tmp" 2>/dev/null || true
  }

  should_sync_agent_mirrors() {
    local changed_path
    for changed_path in "${update_changed_paths[@]}"; do
      case "$changed_path" in
        AGENTS.md|.agents/*)
          return 0
          ;;
      esac
    done
    return 1
  }

  run_sync_agents_with_progress() {
    local sync_script="$1" timeout_sec="${2:-0}"
    local line sync_pid watchdog_pid="" rc=1 progress_current=0 progress_total=0 progress_label="" saw_rc=0

    exec 3< <(
      {
        SPINOSA_SYNC_AGENTS_PROGRESS=1 bash "$sync_script"
        printf '::spinosa-rc::%s\n' "$?"
      } 2>&1
    )
    sync_pid=$!

    if [[ "$timeout_sec" -gt 0 ]]; then
      (
        sleep "$timeout_sec"
        if kill -0 "$sync_pid" 2>/dev/null; then
          kill -TERM "$sync_pid" 2>/dev/null || true
          sleep 1
          kill -KILL "$sync_pid" 2>/dev/null || true
        fi
      ) &
      watchdog_pid=$!
    fi

    while IFS= read -r line <&3; do
      case "$line" in
        ::spinosa-progress::*)
          line="${line#::spinosa-progress::}"
          progress_current="${line%%::*}"
          line="${line#*::}"
          progress_total="${line%%::*}"
          progress_label="${line#*::}"
          render_step_progress "$progress_current" "$progress_total" "$progress_label" "refreshing agent mirrors"
          ;;
        ::spinosa-rc::*)
          rc="${line#::spinosa-rc::}"
          saw_rc=1
          ;;
        *)
          spinosa_log INFO "sync-agents output workspace=${workspace_path} line=$(printf '%s' "$line" | tr '\n' ' ')"
          ;;
      esac
    done

    exec 3<&-
    [[ -n "$watchdog_pid" ]] && kill "$watchdog_pid" 2>/dev/null || true
    [[ -n "$watchdog_pid" ]] && wait "$watchdog_pid" 2>/dev/null || true

    if [[ "$saw_rc" -eq 0 ]]; then
      rc=124
    fi
    if [[ "$rc" -eq 143 || "$rc" -eq 137 || "$rc" -eq 124 ]]; then
      SPINOSA_LAST_COPY_FAIL_REASON="timed out after ${timeout_sec}s"
      return 124
    fi
    return "$rc"
  }

  while IFS=$'\t' read -r path role policy; do
    is_framework_manifest_entry "$path" "$role" || continue
    [[ -n "$policy" ]] || policy="replace_if_unmodified"

    src="${TEMPLATE_ROOT}/${path}"
    dst="${workspace_path}/${path}"
    if [[ "$dry_run" -ne 1 ]]; then
      spinosa_log INFO "update path=${path} policy=${policy}"
    fi

    case "$policy" in
      never_replace|exclude_from_update)
        skipped=$((skipped + 1))
        ;;

      *)
        manifest_idx=$((manifest_idx + 1))
        if [[ ! -e "$dst" ]]; then
          if [[ "$dry_run" -eq 1 ]]; then
            render_update_manifest_progress "$manifest_idx" "$manifest_total" "$path" "preview add"
            added=$((added + 1))
            update_changed_paths+=("$path")
          else
            render_update_manifest_progress "$manifest_idx" "$manifest_total" "$path" "adding"
            if [[ -d "$src" ]]; then
              mkdir -p "$dst" && update_sync_dir "$src" "$dst" "$path" && added=$((added + 1)) && update_changed_paths+=("$path") || { clear_progress_line; safe_copy_warn_failure "add" "$path" "$dst"; copy_failed=$((copy_failed + 1)); }
            elif [[ -f "$src" ]]; then
              mkdir -p "$(dirname "$dst")"
              safe_copy "$src" "$dst" && added=$((added + 1)) && update_changed_paths+=("$path") || { clear_progress_line; safe_copy_warn_failure "add" "$path" "$dst"; copy_failed=$((copy_failed + 1)); }
            fi
          fi
          continue
        fi

        if [[ -f "$src" && -f "$dst" ]] && files_match "$src" "$dst"; then
          render_update_manifest_progress "$manifest_idx" "$manifest_total" "$path" "unchanged"
          skipped=$((skipped + 1))
          continue
        fi

        if [[ "$dry_run" -eq 1 ]]; then
          if [[ -d "$src" ]]; then
            render_update_manifest_progress "$manifest_idx" "$manifest_total" "$path" "preview sync"
          else
            render_update_manifest_progress "$manifest_idx" "$manifest_total" "$path" "preview replace"
          fi
          updated=$((updated + 1))
          update_changed_paths+=("$path")
        else
          if [[ -d "$src" ]]; then
            render_update_manifest_progress "$manifest_idx" "$manifest_total" "$path" "syncing"
            mkdir -p "$dst"
            update_sync_dir "$src" "$dst" "$path" && updated=$((updated + 1)) && update_changed_paths+=("$path") || { clear_progress_line; safe_copy_warn_failure "sync" "$path" "$dst"; copy_failed=$((copy_failed + 1)); }
          elif [[ -f "$src" ]]; then
            render_update_manifest_progress "$manifest_idx" "$manifest_total" "$path" "updating"
            mkdir -p "$(dirname "$dst")"
            safe_copy "$src" "$dst" && updated=$((updated + 1)) && update_changed_paths+=("$path") || { clear_progress_line; safe_copy_warn_failure "copy" "$path" "$dst"; copy_failed=$((copy_failed + 1)); }
          else
            render_update_manifest_progress "$manifest_idx" "$manifest_total" "$path" "skipping"
            skipped=$((skipped + 1))
          fi
        fi
        ;;
    esac
  done < "$fw_manifest"

  clear_progress_line
  spinosa_log INFO "framework copy phase complete workspace=${workspace_path}"

  # ── Phase 3: REMOVE files no longer in framework TSV ──────────────────────
  spinosa_log INFO "phase remove-extra-files workspace=${workspace_path}"
  if [[ "$manifest_has_entries" -eq 1 ]]; then
    while IFS=$'\t' read -r m_path m_kind; do
      [[ -n "$m_path" && "$m_path" != "path" && "$m_kind" != "dir" ]] || continue
      grep -Fxq "$m_path" "$processed_list" 2>/dev/null && continue
      grep -Fxq "$m_path" "$declared_list" 2>/dev/null && { skipped=$((skipped + 1)); continue; }

      local target="${workspace_path}/${m_path}"
      [[ -e "$target" ]] || continue

      if [[ "$dry_run" -eq 1 ]]; then
        info "[dry-run] would remove (no longer in framework): ${m_path}"
        removed=$((removed + 1))
      else
        render_status_progress "removing obsolete files" "$m_path" "$removed"
        cloud_rm_rf "$target" 2>/dev/null && removed=$((removed + 1)) || { clear_progress_line; warn "Failed to remove: ${m_path}"; }
      fi
    done < "$ws_manifest"
    clear_progress_line
  fi

  # ── Phase 4: retired-workspace-files.tsv (remove if still present) ────────
  spinosa_log INFO "phase remove-retired-files workspace=${workspace_path}"
  if [[ -f "$retired_manifest" ]]; then
    local r_path r_date r_reason
    while IFS=$'\t' read -r r_path r_date r_reason; do
      [[ -n "$r_path" && "$r_path" != "path" ]] || continue
      local target="${workspace_path}/${r_path}"
      [[ -e "$target" ]] || continue

      if [[ "$dry_run" -eq 1 ]]; then
        info "[dry-run] would remove retired: ${r_path} (${r_reason})"
        removed=$((removed + 1))
      else
        render_status_progress "removing retired files" "$r_path" "$retired_found"
        cloud_rm_rf "$target" 2>/dev/null && removed=$((removed + 1)) || { clear_progress_line; warn "Failed to remove retired: ${r_path}"; }
      fi
      retired_found=$((retired_found + 1))
    done < "$retired_manifest"
    clear_progress_line
  fi

  rm -f "$processed_list" "$declared_list" 2>/dev/null || true

  # ── Phase 5: finalize legacy logs/ → framework/logs/ (second pass after retired cleanup) ─
  spinosa_log INFO "phase finalize-legacy-logs workspace=${workspace_path}"
  if [[ "$dry_run" -eq 1 ]]; then
    info "[dry-run] would finalize legacy logs/ cleanup"
  else
    finalize_legacy_logs_dir "$workspace_path" || true
  fi

  # ── regenerate manifest.tsv ──────────────────────────────────────────────
  if [[ "$dry_run" -ne 1 ]]; then
    rewrite_workspace_manifest
  fi

  # ── update workspace metadata ───────────────────────────────────────────
  if [[ "$dry_run" -ne 1 && -n "$installed_version" && "$installed_version" != "dev" ]]; then
    spinosa_log INFO "phase update-workspace-metadata workspace=${workspace_path} version=${installed_version}"
    update_workspace_version_metadata
  fi

  # ── clean macOS metadata ─────────────────────────────────────────────────
  if [[ "$dry_run" -ne 1 ]]; then
    if is_cloud_storage_path "$workspace_path"; then
      note "Skipped recursive macOS metadata cleanup on cloud storage."
    else
      find "$workspace_path" -name ".DS_Store" -delete 2>/dev/null || true
      find "$workspace_path" -name "._*" -delete 2>/dev/null || true
    fi
  fi

  # ── sync agent mirrors ───────────────────────────────────────────────────
  if [[ "$dry_run" -ne 1 && -f "${workspace_path}/.bin/sync-agents.sh" ]]; then
    if should_sync_agent_mirrors; then
      spinosa_log INFO "phase sync-agents workspace=${workspace_path}"
      if is_cloud_storage_path "$workspace_path"; then
        SPINOSA_LAST_COPY_FAIL_REASON=""
        if ! run_sync_agents_with_progress "${workspace_path}/.bin/sync-agents.sh" "${SPINOSA_CLOUD_SYNC_AGENTS_TIMEOUT_SEC:-120}"; then
          clear_progress_line
          warn "Agent mirror refresh skipped (${SPINOSA_LAST_COPY_FAIL_REASON:-I/O error})"
        fi
        clear_progress_line
      else
        if ! run_sync_agents_with_progress "${workspace_path}/.bin/sync-agents.sh" 0; then
          clear_progress_line
          warn "Agent mirror refresh skipped (${SPINOSA_LAST_COPY_FAIL_REASON:-I/O error})"
        fi
        clear_progress_line
      fi
    else
      spinosa_log INFO "phase sync-agents skipped workspace=${workspace_path}"
    fi
  fi

  # ── report ───────────────────────────────────────────────────────────────
  divider

  local verb="" tag="Workspace updated"
  if [[ "$dry_run" -eq 1 ]]; then
    verb="would be "
    tag="Dry-run"
  fi

  local version_range=""
  if [[ -n "$workspace_version" && "$installed_version" != "dev" && -n "$installed_version" ]]; then
    version_range=": ${workspace_version} → ${installed_version}"
  fi

  local has_changes=0
  (( updated > 0 || added > 0 || removed > 0 )) && has_changes=1

  if [[ "$has_changes" -eq 0 && "$dry_run" -ne 1 ]]; then
    ok "Already up to date${version_range}"
    [[ "$retired_found" -gt 0 ]] && note "Deprecated framework files cleaned up"
  else
    ok "${tag}${version_range}"
    tree_sep

    local rows=()
    [[ "$updated" -gt 0 ]] && rows+=("$(plural_count "$updated" "file") ${verb}updated")
    [[ "$added" -gt 0 ]]   && rows+=("$(plural_count "$added" "new file") ${verb}added")
    [[ "$removed" -gt 0 ]] && rows+=("$(plural_count "$removed" "file") ${verb}removed")
    [[ "$skipped" -gt 0 ]] && rows+=("$(plural_count "$skipped" "file") skipped")

    local i last_idx=$((${#rows[@]} - 1))
    for ((i = 0; i < ${#rows[@]}; i++)); do
      [[ "$i" -eq "$last_idx" ]] && tree_row_last "${rows[$i]}" || tree_row "${rows[$i]}"
    done
    if [[ ${#update_changed_paths[@]} -gt 0 ]]; then
      echo ""
      print_path_list "Changed paths" "${update_changed_paths[@]}"
    fi
  fi

  echo ""

  if [[ "$dry_run" -eq 1 ]]; then
    note "Re-run without --dry-run to apply."
    echo ""
  fi
  if [[ "$retired_found" -gt 0 && "$dry_run" -ne 1 && "$has_changes" -eq 1 ]]; then
    note "Deprecated framework files cleaned up."
    echo ""
  fi

  if [[ "$copy_failed" -gt 0 && "$dry_run" -ne 1 ]]; then
    warn "$(plural_count "$copy_failed" "framework file") could not be copied."
    if is_cloud_storage_path "$workspace_path"; then
      note "Cloud storage copy failed or timed out — open the workspace in Finder, wait for Google Drive/Dropbox/OneDrive sync, then run: spinosa update --yes"
      note "Override per-file timeout with: SPINOSA_CLOUD_COPY_TIMEOUT_SEC=120 spinosa update --yes"
    else
      note "Re-run: spinosa update --yes"
    fi
    echo ""
    return 1
  fi
}

# ═══════════════════════════════════════════════════════════════════════════
# COMMAND: doctor
# ═══════════════════════════════════════════════════════════════════════════

doctor_hermes_config_stale() {
  local workspace_path="$1"
  local generated="${workspace_path}/.hermes/workspace.config.yaml"
  local user_config="${HOME}/.hermes/config.yaml"
  [[ -f "$generated" ]] || return 1
  [[ -f "$user_config" ]] || return 0

  local skill_dir cwd_line
  skill_dir="$(awk '/external_dirs:/{getline; gsub(/^[[:space:]]*-[[:space:]]*/, ""); print; exit}' "$generated" 2>/dev/null || true)"
  cwd_line="$(awk '/^  cwd:/{print $2; exit}' "$generated" 2>/dev/null || true)"

  if [[ -n "$skill_dir" ]] && ! grep -Fq "$skill_dir" "$user_config" 2>/dev/null; then
    return 0
  fi
  if [[ -n "$cwd_line" ]] && ! grep -Fq "$cwd_line" "$user_config" 2>/dev/null; then
    return 0
  fi
  return 1
}

doctor_check_workspace() {
  local workspace_path="$1" installed_version="$2"
  local ws_version ws_name issues=0 cmp

  validate_workspace "$workspace_path" || return 0
  ws_name="$(basename "$workspace_path")"
  ws_version="$(grep -m1 'framework_version:' "$workspace_path/.spinosa/workspace" 2>/dev/null | awk '{print $2}')"

  printf '\n'
  tree_sep
  tree_row "Workspace" "$ws_name"
  tree_row "Path" "$(truncate_display_path "$workspace_path" 60)"

  if [[ -z "$ws_version" ]]; then
    warn "Could not read workspace framework_version"
    issues=$((issues + 1))
  elif [[ "$ws_version" == "dev" ]]; then
    note "Workspace framework_version is dev (non-release checkout) — version skew check skipped"
  elif [[ "$installed_version" != "dev" && -n "$ws_version" ]]; then
    local cmp=0
    compare_versions "$installed_version" "$ws_version" || cmp=$?
    if [[ "$cmp" -eq 2 ]]; then
      warn "CLI v${installed_version} is older than workspace v${ws_version} — run: spinosa upgrade"
      issues=$((issues + 1))
    elif [[ "$cmp" -eq 1 ]]; then
      warn "Workspace v${ws_version} is behind CLI v${installed_version} — run: spinosa update --yes"
      issues=$((issues + 1))
    else
      ok "Framework version matches CLI (v${ws_version})"
    fi
  fi

  if is_cloud_storage_path "$workspace_path"; then
    warn "Workspace is on cloud storage — sync locally before spinosa update"
    issues=$((issues + 1))
  fi

  if doctor_hermes_config_stale "$workspace_path"; then
    warn "Hermes ~/.hermes/config.yaml may be stale — merge .hermes/workspace.config.yaml"
    issues=$((issues + 1))
  fi

  return "$issues"
}

cmd_doctor() {
  local target_workspace="" auto_yes=0
  local args=()

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --workspace|-w)
        [[ $# -ge 2 ]] || die "doctor --workspace requires a path"
        target_workspace="$(normalize_path_input "$2")"
        target_workspace="$(expand_home "$target_workspace")"
        shift 2
        ;;
      --yes|-y) auto_yes=1; shift ;;
      --help|-h)
        printf '  %s\n' "Usage: spinosa doctor [options]"
        printf '    %s\n' "  --workspace PATH   Check a specific workspace"
        printf '    %s\n' "  --help             Show this help"
        return 0
        ;;
      -*) die "Unknown doctor option: $1" ;;
      *) args+=("$1"); shift ;;
    esac
  done

  title "Doctor"

  local installed_version total_issues=0 incomplete
  installed_version="$(framework_version "$TEMPLATE_ROOT")"
  tree_sep
  tree_row "CLI framework" "v${installed_version}"

  if declare -F spinosa_list_incomplete_versions >/dev/null 2>&1; then
    while IFS= read -r incomplete; do
      [[ -n "$incomplete" ]] || continue
      warn "Incomplete install detected: versions/${incomplete} — run: curl -fsSL https://github.com/TommasoPrinetti/spinosa/releases/download/stable/install.sh | bash"
      total_issues=$((total_issues + 1))
    done < <(spinosa_list_incomplete_versions)
  fi

  if markitdown_available; then
    ok "MarkItDown available"
  else
    warn "MarkItDown unavailable — Office/HTML conversion may fail"
    total_issues=$((total_issues + 1))
  fi

  if rapidocr_ocr_available; then
    ok "RapidOCR available"
  else
    warn "RapidOCR unavailable — scanned PDF/image OCR may fail"
    total_issues=$((total_issues + 1))
  fi

  local -a workspaces=()
  local ws_path ws_project workspace_data

  if [[ -n "$target_workspace" ]]; then
    workspaces+=("$target_workspace")
  else
    if [[ -f ".spinosa/workspace" ]]; then
      workspaces+=("$(pwd)")
    fi
    workspace_data="$(discover_registered_workspaces 2>/dev/null || true)"
    while IFS='|' read -r ws_path ws_project; do
      [[ -n "$ws_path" ]] || continue
      local found=0 w
      for w in "${workspaces[@]-}"; do
        [[ "$w" == "$ws_path" ]] && found=1 && break
      done
      [[ "$found" -eq 0 ]] && workspaces+=("$ws_path")
    done <<< "$workspace_data"
  fi

  if [[ ${#workspaces[@]} -eq 0 ]]; then
    note "No workspace in current directory and none registered — checking CLI and tools only"
  else
    local ws ws_issues
    for ws in "${workspaces[@]}"; do
      ws_issues=0
      doctor_check_workspace "$ws" "$installed_version" || ws_issues=$?
      total_issues=$((total_issues + ws_issues))
    done
  fi

  divider
  if [[ "$total_issues" -eq 0 ]]; then
    ok "All checks passed"
    echo ""
    return 0
  fi

  warn "$(plural_count "$total_issues" "issue") found"
  note "See docs/reference/cli.md#upgrade-lifecycle"
  echo ""
  return 1
}

# ═══════════════════════════════════════════════════════════════════════════
# COMMAND: dashboard
# ═══════════════════════════════════════════════════════════════════════════
# shellcheck disable=SC2120


auto_upgrade_check() {
  [[ "${SPINOSA_NO_UPGRADE_CHECK:-0}" != "1" ]] || return 0
  local _au
  _au="$(grep -m1 '^auto_upgrade:' "$SPINOSA_CONFIG" 2>/dev/null | awk '{print $2}')"
  [[ "${_au:-true}" != "false" ]] || return 0
  [[ -t 0 ]] || return 0
  local installed_version
  installed_version="$(framework_version "$TEMPLATE_ROOT")"
  [[ "$installed_version" != "dev" ]] || return 0

  ensure_global_metadata
  local channel
  channel="$(spinosa_release_channel)"
  local cache_file="${SPINOSA_VERSION_CACHE}_${channel}"
  local now
  now="$(date +%s)"

  # ── offline check: if installed >= cached latest, clear stale cache ──
  if [[ -f "$cache_file" ]]; then
    local cached_latest skip_until cached_channel
    cached_latest="$(sed -n '2p' "$cache_file" 2>/dev/null || echo "")"
    skip_until="$(sed -n '3p' "$cache_file" 2>/dev/null || echo 0)"
    cached_channel="$(sed -n '4p' "$cache_file" 2>/dev/null || echo "")"

    if [[ -n "$cached_latest" && "$cached_channel" == "$channel" ]]; then
      local cache_cmp=0
      compare_versions "$installed_version" "$cached_latest" || cache_cmp=$?
      if [[ "$cache_cmp" -ne 2 ]]; then
        if [[ "$cache_cmp" -eq 1 ]]; then
          rm -f "$cache_file" 2>/dev/null || true
        elif [[ "$now" -lt "$skip_until" ]]; then
          return 0
        fi
      fi
    else
      rm -f "$cache_file" 2>/dev/null || true
    fi
  fi

  local latest
  if ! command -v curl >/dev/null 2>&1; then return 0; fi
  latest="$(resolve_release_version_for_channel "$channel" 2>/dev/null || true)"
  [[ -n "$latest" ]] || return 0

  printf '%s\n%s\n0\n%s\n' "$now" "$latest" "$channel" > "$cache_file"

  local latest_cmp=0
  compare_versions "$latest" "$installed_version" || latest_cmp=$?
  [[ "$latest_cmp" -eq 1 ]] || return 0

  printf '\n  %sSpinosa v%s is installed. -----> v%s is available. ✨%s\n\n' "${BOLD}" "$installed_version" "$latest" "${RESET}"
  if confirm "Upgrade now?" "y"; then
    info "Running upgrade..."
    cmd_upgrade --version "$latest" --yes
  else
    printf '%s\n%s\n%d\n%s\n' "$now" "$latest" "$(( now + 604800 ))" "$channel" > "$cache_file"
    info "Upgrade skipped. You can upgrade anytime with: spinosa upgrade"
  fi
}
