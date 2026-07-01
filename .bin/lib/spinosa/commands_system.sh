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
  printf '  %s\n' "spinosa update            Update workspace framework files"
  printf '  %s\n' "spinosa doctor            Health check (versions, tools, integrations)"
  printf '  %s\n' "spinosa uninstall         Remove Spinosa from this system"
  printf '  %s\n' "spinosa version           Show installed Spinosa version"
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

  spinosa_log INFO "upgrade installer=${installer} args=${upgrade_args[*]}"
  if ! bash "$installer" "${upgrade_args[@]}"; then
    spinosa_log ERROR "installer exited non-zero"
    if [[ -x "${SPINOSA_HOME}/bin/spinosa" ]]; then
      warn "Installer reported failure but CLI is present — continuing (see $(spinosa_log_file))"
    else
      die "Installer failed. See $(spinosa_log_file)"
    fi
  fi

  rm -f "$SPINOSA_VERSION_CACHE" 2>/dev/null || true
  rm -rf "$tmpdir"

  # Re-resolve framework root so post-upgrade operations see the new version
  FRAMEWORK_ROOT="$(resolve_framework_root)"

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
  note "Workspace update syncs framework files and regenerates vendor mirrors (.opencode/, .hermes/skills/, …)."
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
    if (cmd_update "$ws" --yes --force); then
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
  note "  • Vendor mirrors (.opencode/, .hermes/skills/, etc.) were regenerated by sync-agents"
  note "  • Hermes: merge .hermes/workspace.config.yaml → ~/.hermes/config.yaml"
  note "  • Run: spinosa doctor"
  echo ""
}

# ═══════════════════════════════════════════════════════════════════════════
# COMMAND: update
# ═══════════════════════════════════════════════════════════════════════════

# ── inject_framework_diff ───────────────────────────────────────────────────
# Append new framework content as comments inside a customized workspace file,
# preserving the user's version.  Works for text files; binary files warn only.

inject_framework_diff() {
  local dst="$1"  src="$2"  rel_path="$3"
  [[ -f "$src" ]] || return 0
  local ext="${rel_path##*.}"

  # Determine comment style
  local comment_open="" comment_close="" line_prefix=""
  case "$ext" in
    md|markdown)
      comment_open="<!-- "
      comment_close=" -->"
      line_prefix=""
      ;;
    sh|bash|zsh|py|rb|pl|pm|yml|yaml|toml|ini|cfg|conf|gitignore|editorconfig)
      comment_open=""
      comment_close=""
      line_prefix="# "
      ;;
    js|ts|jsx|tsx|css|scss|less|php|java|c|cpp|h|hpp)
      comment_open="/* "
      comment_close=" */"
      line_prefix=" * "
      ;;
    tex|bib)
      comment_open=""
      comment_close=""
      line_prefix="% "
      ;;
    r|R)
      comment_open=""
      comment_close=""
      line_prefix="# "
      ;;
    lua)
      comment_open="--[[ "
      comment_close=" --]]"
      line_prefix="-- "
      ;;
    *)
      # Binary or unknown — skip injection, just warn
      warn "Customized: ${rel_path} (cannot inject comments into .${ext})"
      return 0
      ;;
  esac

  # Build a blank-line-delimited injection block
  local sep block_file
  block_file="$(mktemp "${TMPDIR:-/tmp}/spinosa-inject.XXXXXX")" || return 1
  sep="$(printf '═%.0s' $(seq 1 60))"
  {
    printf '\n'
    if [[ -n "$line_prefix" ]]; then
      printf '%s%s\n' "$line_prefix" "${sep}"
      printf '%sSPINOSA UPDATE: New framework version available\n' "$line_prefix"
      printf '%sThe file '\''%s'\'' was customized. Below is the new\n' "$line_prefix" "$rel_path"
      printf '%sframework version for reference. Remove this block after\n' "$line_prefix"
      printf '%sreviewing and merging the relevant changes.\n' "$line_prefix"
      printf '%s%s\n' "$line_prefix" "${sep}"
      printf '\n'
      while IFS= read -r line; do
        printf '%s%s\n' "$line_prefix" "$line"
      done < "$src"
      printf '\n'
      printf '%s%s\n' "$line_prefix" "${sep}"
    else
      printf '%s%s%s\n' "$comment_open" "${sep}" "$comment_close"
      printf '%sSPINOSA UPDATE: New framework version available%s\n' "$comment_open" "$comment_close"
      printf '%sThe file '\''%s'\'' was customized. Below is the new%s\n' "$comment_open" "$rel_path" "$comment_close"
      printf '%sframework version for reference. Remove this block after%s\n' "$comment_open" "$comment_close"
      printf '%sreviewing and merging the relevant changes.%s\n' "$comment_open" "$comment_close"
      printf '%s%s%s\n' "$comment_open" "${sep}" "$comment_close"
      printf '\n'
      cat "$src"
      printf '\n'
      printf '%s%s%s\n' "$comment_open" "${sep}" "$comment_close"
    fi
  } > "$block_file"

  if is_cloud_storage_path "$dst"; then
    local timeout_sec="${SPINOSA_CLOUD_COPY_TIMEOUT_SEC:-60}"
    if ! spinosa_run_with_timeout "$timeout_sec" sh -c 'cat -- "$1" >> "$2"' _ "$block_file" "$dst"; then
      warn "Customized: ${rel_path} (injection timed out on cloud storage — merge manually from framework)"
      rm -f "$block_file" 2>/dev/null || true
      return 1
    fi
  else
    cat "$block_file" >> "$dst"
  fi
  rm -f "$block_file" 2>/dev/null || true
  printf '  %s %s\n' "${Y}✎${RESET}" "Injected new framework content into customized: ${rel_path}"
}

# ── sync_dir_contents ────────────────────────────────────────────────────────
# Like copy_dir_contents but also removes destination items that no longer
# exist in the source (true sync, not just additive copy).

sync_dir_contents() {
  local src="$1" dst="$2"
  local src_real dst_real
  src_real="$(cd "$src" 2>/dev/null && pwd -P)" || { warn "Cannot sync missing directory: $src"; return 1; }
  dst_real="$(cd "$dst" 2>/dev/null && pwd -P)" || dst_real=""
  mkdir -p "$dst"
  # Cloud destinations: skip find/rm prune (can hang on Drive/Dropbox FUSE).
  if [[ -n "$dst_real" ]] && ! is_cloud_storage_path "$dst"; then
    while IFS= read -r -d '' item; do
      local rel="${item#"$dst_real"/}"
      [[ -e "$src_real/$rel" ]] || cloud_rm_rf "$item" 2>/dev/null || true
    done < <(find -P "$dst_real" -mindepth 1 -maxdepth 1 -print0 2>/dev/null)
  fi
  safe_copy_tree "$src_real" "$dst"
}

# ── compare_versions ─────────────────────────────────────────────────────────
# Returns: 0 = equal, 1 = first > second, 2 = first < second

compare_versions() {
  local a="${1%%-*}" b="${2%%-*}"
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
        printf '    %s\n' "  --force           Overwrite customized files (bypass replace_if_unmodified)"
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
  local workspace_path
  if [[ -n "${args[0]:-}" ]]; then
    workspace_path="$(normalize_path_input "${args[0]}")"
    workspace_path="$(expand_home "$workspace_path")"
    validate_workspace "$workspace_path" || die "Not a valid Spinosa workspace: $workspace_path"
    register_workspace "$workspace_path" "$(basename "$workspace_path")" 2>/dev/null || true
  else
    workspace_path="$(require_workspace)" || die "No workspace found."
  fi

  local ws_metadata="${workspace_path}/.spinosa/workspace"
  local ws_manifest="${workspace_path}/.spinosa/manifest.tsv"
  local fw_manifest="${FRAMEWORK_ROOT}/.spinosa/framework-files.tsv"
  local retired_manifest="${FRAMEWORK_ROOT}/.spinosa/retired-framework-files.tsv"

  [[ -f "$fw_manifest" ]] || die "Framework manifest not found: $fw_manifest"
  [[ -f "$ws_metadata" ]] || die "Workspace metadata not found: $ws_metadata"

  # ── detect and compare versions ──────────────────────────────────────────
  local installed_version workspace_version
  installed_version="$(framework_version "$FRAMEWORK_ROOT")"
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
    warn "Workspace is on cloud storage — ensure files are synced locally before updating."
    note "Per-file copy timeout: ${SPINOSA_CLOUD_COPY_TIMEOUT_SEC:-60}s; hash timeout: ${SPINOSA_CLOUD_HASH_TIMEOUT_SEC:-30}s."
    note "Spinosa copies framework files one-by-one with retries; stalled cloud I/O fails instead of hanging."
    note "Tail $(spinosa_log_file) to see the current path if the spinner appears frozen."
  fi

  # ── check workspace manifest exists ─────────────────────────────────────
  local manifest_has_entries=0
  if [[ -f "$ws_manifest" ]] && [[ $(awk 'NR>1' "$ws_manifest" 2>/dev/null | wc -l) -gt 0 ]]; then
    manifest_has_entries=1
  fi

  if [[ "$manifest_has_entries" -eq 0 ]]; then
    warn "No manifest.tsv or no entries — treating replace_if_unmodified as modified"
  fi

  local manifest_total=0 manifest_idx=0
  while IFS=$'\t' read -r _path _role _policy; do
    is_framework_manifest_entry "$_path" "$_role" || continue
    case "${_policy:-replace_if_unmodified}" in
      never_replace|exclude_from_update) ;;
      *) manifest_total=$((manifest_total + 1)) ;;
    esac
  done < "$fw_manifest"

  # ── confirm ──────────────────────────────────────────────────────────────
  if [[ "$auto_yes" -ne 1 ]]; then
    if [[ -n "$workspace_version" && "$installed_version" != "dev" && -n "$installed_version" ]]; then
      note "Framework ${workspace_version} → ${installed_version} · ${manifest_total} paths"
    else
      note "Sync ${manifest_total} framework paths to v${installed_version}"
    fi
    note "Updates agents, docs, and CLI scripts; preserves raw/, system/context.md, and customized files"
    if ! confirm "Update framework files in this workspace?" "y"; then
      info "Update cancelled."
      return 0
    fi
  fi

  if [[ "$dry_run" -eq 1 ]]; then
    info "Dry-run — previewing ${manifest_total} framework paths"
  else
    info "Applying framework sync (${manifest_total} paths)…"
    if is_cloud_storage_path "$workspace_path"; then
      note "If progress stalls, tail $(spinosa_log_file) in another terminal for the current path."
    fi
  fi
  echo ""

  # ── Phase 0: migrate legacy logs/ → .logs/ ───────────────────────────────
  migrate_workspace_logs_dir "$workspace_path" "$dry_run"

  # ── Phase 1: build framework file set ─────────────────────────────────────
  local processed_list
  processed_list="$(mktemp)" || die "Cannot create temp file"
  while IFS=$'\t' read -r fw_path fw_role fw_policy; do
    is_framework_manifest_entry "$fw_path" "$fw_role" || continue
    echo "$fw_path" >> "$processed_list"
  done < "$fw_manifest"

  # ── Phase 2: ADD + UPDATE from framework-files.tsv ────────────────────────
  local updated=0 skipped=0 added=0 customized=0 removed=0 retired_found=0 copy_failed=0
  local src dst policy current_hash orig_hash new_hash
  local -a update_changed_paths=()

  update_sync_dir() {
    local src_path="$1" dst_path="$2" label="$3"
    SPINOSA_SYNC_LABEL="$label"
    sync_dir_contents "$src_path" "$dst_path"
    local rc=$?
    unset SPINOSA_SYNC_LABEL
    return "$rc"
  }

  while IFS=$'\t' read -r path role policy; do
    is_framework_manifest_entry "$path" "$role" || continue
    [[ -n "$policy" ]] || policy="replace_if_unmodified"

    src="${FRAMEWORK_ROOT}/${path}"
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
        # File doesn't exist in workspace → ADD
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

        # File exists → UPDATE
        if [[ "$policy" == "always_replace" ]]; then
          if [[ "$dry_run" -eq 1 ]]; then
            render_update_manifest_progress "$manifest_idx" "$manifest_total" "$path" "preview replace"
            updated=$((updated + 1))
            update_changed_paths+=("$path")
          else
            render_update_manifest_progress "$manifest_idx" "$manifest_total" "$path" "updating"
            if [[ -d "$src" ]]; then
              mkdir -p "$dst" && update_sync_dir "$src" "$dst" "$path" && updated=$((updated + 1)) && update_changed_paths+=("$path") || { clear_progress_line; safe_copy_warn_failure "sync" "$path" "$dst"; copy_failed=$((copy_failed + 1)); }
            elif [[ -f "$src" ]]; then
              mkdir -p "$(dirname "$dst")"
              safe_copy "$src" "$dst" && updated=$((updated + 1)) && update_changed_paths+=("$path") || { clear_progress_line; safe_copy_warn_failure "copy" "$path" "$dst"; copy_failed=$((copy_failed + 1)); }
            fi
          fi
        else
          # replace_if_unmodified — three-way checksum check
          orig_hash="$(manifest_hash "$ws_manifest" "$path")"

          if [[ -z "$orig_hash" || "$orig_hash" == "dir" || "$orig_hash" == "none" ]]; then
            # No checksum baseline — conservative: sync dirs, skip files
            if [[ -d "$src" ]]; then
              if [[ "$dry_run" -eq 1 ]]; then
                render_update_manifest_progress "$manifest_idx" "$manifest_total" "$path" "preview sync"
                updated=$((updated + 1))
                update_changed_paths+=("$path")
              else
                render_update_manifest_progress "$manifest_idx" "$manifest_total" "$path" "syncing"
                mkdir -p "$dst"
                update_sync_dir "$src" "$dst" "$path" && updated=$((updated + 1)) && update_changed_paths+=("$path") || { clear_progress_line; safe_copy_warn_failure "sync" "$path" "$dst"; copy_failed=$((copy_failed + 1)); }
              fi
            else
              render_update_manifest_progress "$manifest_idx" "$manifest_total" "$path" "skipping"
              skipped=$((skipped + 1))
            fi
            continue
          fi

          SPINOSA_LAST_COPY_FAIL_REASON=""
          current_hash="$(sha256_file "$dst" 2>/dev/null || echo "missing")"
          if [[ "$current_hash" == "missing" ]] && cloud_io_timed_out; then
            clear_progress_line
            safe_copy_warn_failure "hash" "$path" "$dst"
            copy_failed=$((copy_failed + 1))
            continue
          fi

          if [[ "$current_hash" == "$orig_hash" ]]; then
            # Unmodified → replace
            if [[ "$dry_run" -eq 1 ]]; then
              render_update_manifest_progress "$manifest_idx" "$manifest_total" "$path" "preview update"
              updated=$((updated + 1))
              update_changed_paths+=("$path")
            else
              render_update_manifest_progress "$manifest_idx" "$manifest_total" "$path" "updating"
              if [[ -d "$src" ]]; then
                mkdir -p "$dst" && update_sync_dir "$src" "$dst" "$path" && updated=$((updated + 1)) && update_changed_paths+=("$path") || { clear_progress_line; safe_copy_warn_failure "sync" "$path" "$dst"; copy_failed=$((copy_failed + 1)); }
              elif [[ -f "$src" ]]; then
                mkdir -p "$(dirname "$dst")"
                safe_copy "$src" "$dst" && updated=$((updated + 1)) && update_changed_paths+=("$path") || { clear_progress_line; safe_copy_warn_failure "copy" "$path" "$dst"; copy_failed=$((copy_failed + 1)); }
              fi
            fi
          elif [[ "$force" -eq 1 ]]; then
            # Force override
            if [[ "$dry_run" -eq 1 ]]; then
              render_update_manifest_progress "$manifest_idx" "$manifest_total" "$path" "preview force"
              updated=$((updated + 1))
              update_changed_paths+=("$path")
            else
              render_update_manifest_progress "$manifest_idx" "$manifest_total" "$path" "force-updating"
              if [[ -d "$src" ]]; then
                mkdir -p "$dst" && update_sync_dir "$src" "$dst" "$path" && updated=$((updated + 1)) && update_changed_paths+=("$path") || { clear_progress_line; safe_copy_warn_failure "sync" "$path" "$dst"; copy_failed=$((copy_failed + 1)); }
              elif [[ -f "$src" ]]; then
                mkdir -p "$(dirname "$dst")"
                safe_copy "$src" "$dst" && updated=$((updated + 1)) && update_changed_paths+=("$path") || { clear_progress_line; safe_copy_warn_failure "copy" "$path" "$dst"; copy_failed=$((copy_failed + 1)); }
              fi
            fi
          else
            # Customized — inject new framework content as comments if different
            new_hash="$(sha256_file "$src" 2>/dev/null || echo "")"
            if [[ "$current_hash" == "$new_hash" ]]; then
              render_update_manifest_progress "$manifest_idx" "$manifest_total" "$path" "unchanged"
              skipped=$((skipped + 1))
            elif [[ -f "$src" ]]; then
              if [[ "$dry_run" -eq 1 ]]; then
                render_update_manifest_progress "$manifest_idx" "$manifest_total" "$path" "preview inject"
                customized=$((customized + 1))
                update_changed_paths+=("$path")
              else
                render_update_manifest_progress "$manifest_idx" "$manifest_total" "$path" "injecting"
                if inject_framework_diff "$dst" "$src" "$path"; then
                  customized=$((customized + 1))
                  update_changed_paths+=("$path")
                else
                  copy_failed=$((copy_failed + 1))
                fi
              fi
            else
              render_update_manifest_progress "$manifest_idx" "$manifest_total" "$path" "skipping"
              skipped=$((skipped + 1))
            fi
          fi
        fi
        ;;
    esac
  done < "$fw_manifest"

  clear_progress_line

  # ── Phase 3: REMOVE files no longer in framework TSV ──────────────────────
  if [[ "$manifest_has_entries" -eq 1 ]]; then
    while IFS=$'\t' read -r m_path m_hash; do
      [[ -n "$m_path" && "$m_path" != "path" && "$m_hash" != "dir" ]] || continue
      grep -Fxq "$m_path" "$processed_list" 2>/dev/null && continue

      local target="${workspace_path}/${m_path}"
      [[ -e "$target" ]] || continue

      SPINOSA_LAST_COPY_FAIL_REASON=""
      current_hash="$(sha256_file "$target" 2>/dev/null || echo "missing")"
      if [[ "$current_hash" == "missing" ]] && cloud_io_timed_out; then
        warn "Hash timed out — skipped remove: ${m_path}"
        skipped=$((skipped + 1))
        continue
      fi

      if [[ "$current_hash" == "$m_hash" || "$force" -eq 1 ]]; then
        if [[ "$dry_run" -eq 1 ]]; then
          info "[dry-run] would remove (no longer in framework): ${m_path}"
          removed=$((removed + 1))
        else
          cloud_rm_rf "$target" 2>/dev/null && removed=$((removed + 1)) || warn "Failed to remove: ${m_path}"
        fi
      else
        warn "Customized file no longer in framework — skipped: ${m_path}"
        skipped=$((skipped + 1))
      fi
    done < "$ws_manifest"
  fi

  # ── Phase 4: retired-framework-files.tsv (remove if still present) ────────
  if [[ -f "$retired_manifest" ]]; then
    local r_path r_date r_reason
    while IFS=$'\t' read -r r_path r_date r_reason; do
      [[ -n "$r_path" && "$r_path" != "path" ]] || continue
      local target="${workspace_path}/${r_path}"
      [[ -e "$target" ]] || continue

      # Check safety: remove if unmodified or forced
      local r_hash
      r_hash="$(manifest_hash "$ws_manifest" "$r_path")"
      SPINOSA_LAST_COPY_FAIL_REASON=""
      current_hash="$(sha256_file "$target" 2>/dev/null || echo "missing")"
      if [[ "$current_hash" == "missing" ]] && cloud_io_timed_out; then
        warn "Hash timed out — skipped retired remove: ${r_path}"
        skipped=$((skipped + 1))
        continue
      fi

      if [[ -z "$r_hash" || "$current_hash" == "$r_hash" || "$force" -eq 1 ]]; then
        if [[ "$dry_run" -eq 1 ]]; then
          info "[dry-run] would remove retired: ${r_path} (${r_reason})"
          removed=$((removed + 1))
        else
          cloud_rm_rf "$target" 2>/dev/null && removed=$((removed + 1)) || warn "Failed to remove retired: ${r_path}"
        fi
      else
        warn "Customized retired file — skipped: ${r_path}"
        skipped=$((skipped + 1))
      fi
      retired_found=$((retired_found + 1))
    done < "$retired_manifest"
  fi

  rm -f "$processed_list" 2>/dev/null || true

  # ── Phase 5: finalize legacy logs/ → .logs/ (second pass after retired cleanup) ─
  if [[ "$dry_run" -eq 1 ]]; then
    info "[dry-run] would finalize legacy logs/ cleanup"
  else
    finalize_legacy_logs_dir "$workspace_path" || true
  fi

  # ── regenerate manifest.tsv ──────────────────────────────────────────────
  if [[ "$dry_run" -ne 1 ]]; then
    printf 'path\tsha256\n' > "$ws_manifest"
    while IFS=$'\t' read -r path role policy; do
      is_framework_manifest_entry "$path" "$role" || continue
      local full_path="${workspace_path}/${path}"
      if [[ -f "$full_path" ]]; then
        local hash
        hash="$(sha256_file "$full_path" 2>/dev/null || echo "none")"
        printf '%s\t%s\n' "$path" "$hash" >> "$ws_manifest"
      elif [[ -d "$full_path" ]]; then
        printf '%s\tdir\n' "$path" >> "$ws_manifest"
      fi
    done < "$fw_manifest"
  fi

  # ── update workspace metadata ───────────────────────────────────────────
  if [[ "$dry_run" -ne 1 && -n "$installed_version" && "$installed_version" != "dev" ]]; then
    if grep -q '^framework_version:' "$ws_metadata" 2>/dev/null; then
      if [[ "$(uname -s)" == "Darwin" ]]; then
        sed -i '' "s/^framework_version:.*/framework_version: ${installed_version}/" "$ws_metadata"
      else
        sed -i "s/^framework_version:.*/framework_version: ${installed_version}/" "$ws_metadata"
      fi
    fi
  fi

  # ── clean macOS metadata ─────────────────────────────────────────────────
  if [[ "$dry_run" -ne 1 ]]; then
    find "$workspace_path" -name ".DS_Store" -delete 2>/dev/null || true
    find "$workspace_path" -name "._*" -delete 2>/dev/null || true
  fi

  # ── sync agent mirrors ───────────────────────────────────────────────────
  if [[ "$dry_run" -ne 1 && -f "${workspace_path}/.bin/sync-agents.sh" ]]; then
    bash "${workspace_path}/.bin/sync-agents.sh" >/dev/null 2>&1 || true
  fi

  # ── report ───────────────────────────────────────────────────────────────
  divider

  local verb="" verb_preserved="preserved" tag="Workspace updated"
  if [[ "$dry_run" -eq 1 ]]; then
    verb="would be "
    verb_preserved="would be preserved"
    tag="Dry-run"
  fi

  local version_range=""
  if [[ -n "$workspace_version" && "$installed_version" != "dev" && -n "$installed_version" ]]; then
    version_range=": ${workspace_version} → ${installed_version}"
  fi

  local has_changes=0
  (( updated > 0 || added > 0 || removed > 0 || customized > 0 )) && has_changes=1

  if [[ "$has_changes" -eq 0 && "$dry_run" -ne 1 ]]; then
    ok "Already up to date${version_range}"
    [[ "$retired_found" -gt 0 ]] && note "Deprecated framework files cleaned up"
  else
    ok "${tag}${version_range}"
    tree_sep

    local rows=()
    [[ "$updated" -gt 0 ]]    && rows+=("$(plural_count "$updated" "file") ${verb}updated")
    [[ "$added" -gt 0 ]]      && rows+=("$(plural_count "$added" "new file") ${verb}added")
    [[ "$removed" -gt 0 ]]    && rows+=("$(plural_count "$removed" "file") ${verb}removed")
    [[ "$customized" -gt 0 ]] && rows+=("$(plural_count "$customized" "customized file") ${verb_preserved}")
    [[ "$skipped" -gt 0 ]]    && rows+=("$(plural_count "$skipped" "file") skipped")

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
  installed_version="$(framework_version "$FRAMEWORK_ROOT")"
  tree_sep
  tree_row "CLI framework" "v${installed_version}"

  if declare -F spinosa_list_incomplete_versions >/dev/null 2>&1; then
    while IFS= read -r incomplete; do
      [[ -n "$incomplete" ]] || continue
      warn "Incomplete install detected: versions/${incomplete} — run: curl -fsSL https://github.com/TommasoPrinetti/spinosa/releases/latest/download/install.sh | bash"
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
  [[ -t 0 ]] || return 0
  local installed_version
  installed_version="$(framework_version "$FRAMEWORK_ROOT")"
  [[ "$installed_version" != "dev" ]] || return 0

  ensure_global_metadata
  local cache_file="$SPINOSA_VERSION_CACHE"
  local now
  now="$(date +%s)"

  # ── offline check: if installed >= cached latest, clear stale cache ──
  if [[ -f "$cache_file" ]]; then
    local cached_latest skip_until
    cached_latest="$(sed -n '2p' "$cache_file" 2>/dev/null || echo "")"
    skip_until="$(sed -n '3p' "$cache_file" 2>/dev/null || echo 0)"

    if [[ -n "$cached_latest" ]]; then
      local lower
      lower="$(printf '%s\n%s\n' "$installed_version" "$cached_latest" | sort -V | head -1)"
      if [[ "$lower" == "$cached_latest" || "$lower" == "$installed_version" && "$installed_version" == "$cached_latest" ]]; then
        # installed >= cached latest — cache is stale, clear it and proceed silently
        if [[ "$installed_version" != "$cached_latest" ]]; then
          rm -f "$cache_file" 2>/dev/null || true
        elif [[ "$now" -lt "$skip_until" ]]; then
          return 0
        fi
      fi
    fi
  fi

  local latest
  if ! command -v curl >/dev/null 2>&1; then return 0; fi
  latest="$(curl -fsSL --connect-timeout 5 --max-time 15 "https://api.github.com/repos/TommasoPrinetti/spinosa/releases/latest" 2>/dev/null \
    | grep '"tag_name"' | sed 's/.*"v//;s/".*//')"
  [[ -n "$latest" ]] || return 0

  printf '%s\n%s\n0\n' "$now" "$latest" > "$cache_file"

  [[ "$latest" != "$installed_version" ]] || return 0

  printf '\n  %sSpinosa v%s is installed. -----> v%s is available. ✨%s\n\n' "${BOLD}" "$installed_version" "$latest" "${RESET}"
  if confirm "Upgrade now?" "y"; then
    info "Running upgrade..."
    cmd_upgrade --version "$latest" --yes
  else
    printf '%s\n%s\n%d\n' "$now" "$latest" "$(( now + 604800 ))" > "$cache_file"
    info "Upgrade skipped. You can upgrade anytime with: spinosa upgrade"
  fi
}
