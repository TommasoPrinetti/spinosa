# shellcheck shell=bash
# Core filesystem, release, checksum, and formatting helpers for spinosa.

normalize_path_input() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  if [[ ${#value} -ge 2 ]]; then
    if [[ "${value:0:1}" == "'" && "${value: -1}" == "'" ]] || [[ "${value:0:1}" == '"' && "${value: -1}" == '"' ]]; then
      value="${value:1:${#value}-2}"
    fi
  fi
  value="${value//\\ / }"
  echo "$value"
}


expand_home() {
  local path="$1"
  if [[ "$path" == "~"* ]]; then
    path="${path/#\~/$HOME}"
  fi
  echo "$path"
}

# ── checksum helper ─────────────────────────────────────────────────────────

sha256_file() {
  local file="$1"
  [[ -f "$file" ]] || return 1
  if is_cloud_storage_path "$file"; then
    local timeout_sec="${SPINOSA_CLOUD_HASH_TIMEOUT_SEC:-30}"
    if command -v sha256sum >/dev/null 2>&1; then
      spinosa_run_with_timeout "$timeout_sec" sh -c 'sha256sum -- "$1" | awk "{print \$1}"' _ "$file"
      return $?
    fi
    if command -v shasum >/dev/null 2>&1; then
      spinosa_run_with_timeout "$timeout_sec" sh -c 'shasum -a 256 -- "$1" | awk "{print \$1}"' _ "$file"
      return $?
    fi
    return 1
  fi
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$file" | awk '{print $1}'
  else
    return 1
  fi
}

cloud_rm_rf() {
  local target="$1"
  [[ -e "$target" ]] || return 0
  if is_cloud_storage_path "$target"; then
    spinosa_run_with_timeout "$(safe_copy_timeout_sec_for "$target")" rm -rf -- "$target"
    return $?
  fi
  rm -rf -- "$target"
}


download_file() {
  local url="$1" dest="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fSL --progress-bar "$url" -o "$dest"
  elif command -v wget >/dev/null 2>&1; then
    wget -q --show-progress "$url" -O "$dest"
  else
    die "Neither curl nor wget found. Please install one."
  fi
}


verify_checksum() {
  local file="$1" expected="$2"
  local actual
  actual="$(sha256_file "$file" 2>/dev/null || true)"
  [[ -n "$actual" ]] || die "No SHA-256 tool found. Cannot verify release artifact."
  [[ "$actual" == "$expected" ]] || die "Checksum mismatch for $(basename "$file")"
}


# SECURITY: Keep in sync with install.sh safe_untar().
# Any change to archive safety checks must be applied to BOTH files.
safe_untar() {
  local archive="$1" dest="$2"
  shift 2

  local listing verbose_listing
  listing="$(tar -tzf "$archive" 2>/dev/null)" || die "Cannot read archive: $archive"
  verbose_listing="$(tar -tzvf "$archive" 2>/dev/null)" || die "Cannot inspect archive: $archive"

  if printf '%s\n' "$listing" | grep -qE '(^|/)\.\.(/|$)'; then
    die "Archive contains path traversal entries: $(basename "$archive")"
  fi
  if printf '%s\n' "$listing" | grep -qE '^/'; then
    die "Archive contains absolute paths: $(basename "$archive")"
  fi

  local line target
  while IFS= read -r line; do
    [[ "$line" == l* && "$line" == *" -> "* ]] || continue
    target="${line##* -> }"
    if [[ "$target" == /* ]] || [[ "$target" =~ (^|/)\.\.(/|$) ]]; then
      die "Archive contains unsafe symlink target: $(basename "$archive")"
    fi
  done <<< "$verbose_listing"

  # Hard link check (h* entries with "link to" target)
  while IFS= read -r line; do
    [[ "$line" == h* && "$line" == *" link to "* ]] || continue
    target="${line##* link to }"
    if [[ "$target" == /* ]] || [[ "$target" =~ (^|/)\.\.(/|$) ]]; then
      die "Archive contains unsafe hard link target: $(basename "$archive")"
    fi
  done <<< "$verbose_listing"

  tar -xzf "$archive" -C "$dest" --no-same-owner "$@"
}


is_cloud_storage_path() {
  local path="$1"
  case "$path" in
    */Library/CloudStorage/*|*.dropbox*|*Dropbox*|*OneDrive*) return 0 ;;
  esac
  return 1
}

# Set by safe_copy on failure (timeout, I/O, etc.)
SPINOSA_LAST_COPY_FAIL_REASON=""

safe_copy_timeout_sec_for() {
  local path="$1"
  if is_cloud_storage_path "$path"; then
    printf '%s' "${SPINOSA_CLOUD_COPY_TIMEOUT_SEC:-60}"
  else
    printf '%s' "${SPINOSA_LOCAL_COPY_TIMEOUT_SEC:-30}"
  fi
}

spinosa_run_with_timeout() {
  local timeout_sec="$1"
  shift
  [[ "$timeout_sec" -gt 0 ]] 2>/dev/null || { "$@"; return $?; }

  if [[ -z "${SPINOSA_ACTIVE_PROGRESS_ACTION:-}" ]] && command -v timeout >/dev/null 2>&1; then
    timeout --kill-after=3 "$timeout_sec" "$@"
    local rc=$?
    if [[ "$rc" -eq 124 ]]; then
      SPINOSA_LAST_COPY_FAIL_REASON="timed out after ${timeout_sec}s"
    fi
    return "$rc"
  fi
  if [[ -z "${SPINOSA_ACTIVE_PROGRESS_ACTION:-}" ]] && command -v gtimeout >/dev/null 2>&1; then
    gtimeout --kill-after=3 "$timeout_sec" "$@"
    local rc=$?
    if [[ "$rc" -eq 124 ]]; then
      SPINOSA_LAST_COPY_FAIL_REASON="timed out after ${timeout_sec}s"
    fi
    return "$rc"
  fi

  local cmd_pid watch_pid rc=0 spin_seed=0 elapsed_ticks=0
  local poll_interval="0.05"
  local old_int_trap old_term_trap
  old_int_trap="$(trap -p INT || true)"
  old_term_trap="$(trap -p TERM || true)"

  "$@" &
  cmd_pid=$!

  spinosa_timeout_kill() {
    local signal="${1:-TERM}"
    kill "-${signal}" "$cmd_pid" 2>/dev/null || true
    kill "-${signal}" -- "-$cmd_pid" 2>/dev/null || true
  }

  spinosa_timeout_cancel() {
    SPINOSA_LAST_COPY_FAIL_REASON="cancelled"
    spinosa_timeout_kill TERM
    kill -TERM "$watch_pid" 2>/dev/null || true
    sleep "$poll_interval"
    if kill -0 "$cmd_pid" 2>/dev/null; then
      spinosa_timeout_kill KILL
    fi
    clear_progress_line
    printf '\n  Cancelled.\n' >&2
    exit 130
  }
  trap spinosa_timeout_cancel INT TERM
  (
    sleep "$timeout_sec"
    spinosa_timeout_kill TERM
    sleep 1
    if kill -0 "$cmd_pid" 2>/dev/null; then
      spinosa_timeout_kill KILL
    fi
  ) &
  watch_pid=$!

  while kill -0 "$cmd_pid" 2>/dev/null; do
    if [[ -n "${SPINOSA_ACTIVE_PROGRESS_ACTION:-}" ]]; then
      render_active_update_progress "$spin_seed"
      spin_seed=$((spin_seed + 1))
    fi
    sleep "$poll_interval"
    elapsed_ticks=$((elapsed_ticks + 1))
    if (( elapsed_ticks % 20 == 0 )); then
      spinosa_log INFO "waiting path=${SPINOSA_ACTIVE_PROGRESS_PATH:-unknown} timeout_sec=${timeout_sec}" 2>/dev/null || true
    fi
  done

  wait "$cmd_pid" 2>/dev/null || rc=$?
  kill "$watch_pid" 2>/dev/null || true
  wait "$watch_pid" 2>/dev/null || true
  if [[ -n "$old_int_trap" ]]; then eval "$old_int_trap"; else trap - INT; fi
  if [[ -n "$old_term_trap" ]]; then eval "$old_term_trap"; else trap - TERM; fi
  if [[ "$rc" -eq 143 || "$rc" -eq 137 || "$rc" -eq 124 ]]; then
    SPINOSA_LAST_COPY_FAIL_REASON="timed out after ${timeout_sec}s"
    rc=124
  fi
  return "$rc"
}

safe_copy_fail_message() {
  local rel_path="$1" dst="$2"
  local reason="${SPINOSA_LAST_COPY_FAIL_REASON:-I/O error}"
  if is_cloud_storage_path "$dst"; then
    printf 'Failed to copy: %s (%s — cloud storage destination may be offline, locked, or still syncing)' "$rel_path" "$reason"
  else
    printf 'Failed to copy: %s (%s)' "$rel_path" "$reason"
  fi
}

safe_copy_warn_failure() {
  local verb="$1" label="$2" dst="$3"
  local reason="${SPINOSA_LAST_COPY_FAIL_REASON:-I/O error}"
  if is_cloud_storage_path "$dst"; then
    warn "Failed to ${verb}: ${label} (${reason} — cloud storage destination may be offline, locked, or still syncing)"
  else
    warn "Failed to ${verb}: ${label} (${reason})"
  fi
}

safe_copy_retries_for() {
  local path="$1"
  if is_cloud_storage_path "$path"; then
    printf '3'
  else
    printf '3'
  fi
}

file_size_bytes() {
  local path="$1"
  [[ -e "$path" ]] || return 1
  if stat -f '%z' "$path" >/dev/null 2>&1; then
    stat -f '%z' "$path"
  elif stat -c '%s' "$path" >/dev/null 2>&1; then
    stat -c '%s' "$path"
  else
    wc -c < "$path" | tr -d '[:space:]'
  fi
}

files_match() {
  local src="$1" dst="$2"
  local src_size dst_size timeout_sec rc
  [[ -f "$src" && -f "$dst" ]] || return 1

  src_size="$(file_size_bytes "$src" 2>/dev/null || echo "")"
  dst_size="$(file_size_bytes "$dst" 2>/dev/null || echo "")"
  [[ -n "$src_size" && "$src_size" == "$dst_size" ]] || return 1

  if is_cloud_storage_path "$src" || is_cloud_storage_path "$dst"; then
    timeout_sec="$(safe_copy_timeout_sec_for "$dst")"
    SPINOSA_LAST_COPY_FAIL_REASON=""
    if spinosa_run_with_timeout "$timeout_sec" cmp -s -- "$src" "$dst"; then
      return 0
    fi
    rc=$?
    [[ "$rc" -eq 124 ]] && return 1
    return 1
  fi

  cmp -s -- "$src" "$dst"
}

safe_copy_delay_for() {
  local path="$1"
  if is_cloud_storage_path "$path"; then
    printf '4'
  else
    printf '2'
  fi
}

copy_file_via_stream() {
  local src="$1" dst="$2"
  local tmp="${dst}.spinosa-part"
  local timeout_sec
  timeout_sec="$(safe_copy_timeout_sec_for "$dst")"
  mkdir -p "$(dirname "$dst")" 2>/dev/null || return 1
  rm -f "$tmp" 2>/dev/null || true
  SPINOSA_LAST_COPY_FAIL_REASON=""
  if ! spinosa_run_with_timeout "$timeout_sec" sh -c 'cat -- "$1" > "$2"' _ "$src" "$tmp"; then
    rm -f "$tmp" 2>/dev/null || true
    [[ -n "$SPINOSA_LAST_COPY_FAIL_REASON" ]] || SPINOSA_LAST_COPY_FAIL_REASON="stream read failed"
    return 1
  fi
  SPINOSA_LAST_COPY_FAIL_REASON=""
  if ! spinosa_run_with_timeout "$timeout_sec" mv -f -- "$tmp" "$dst"; then
    rm -f "$tmp" 2>/dev/null || true
    [[ -n "$SPINOSA_LAST_COPY_FAIL_REASON" ]] || SPINOSA_LAST_COPY_FAIL_REASON="could not finalize cloud copy"
    return 1
  fi
  return 0
}

is_retired_framework_path() {
  local rel="$1"
  local manifest="${TEMPLATE_ROOT:-}/.spinosa/retired-workspace-files.tsv"
  [[ -n "$rel" && -f "$manifest" ]] || return 1
  awk -F '\t' -v p="$rel" '$1 == p { found = 1 } END { exit(found ? 0 : 1) }' "$manifest"
}

cloud_io_timed_out() {
  [[ "${SPINOSA_LAST_COPY_FAIL_REASON:-}" == *"timed out"* ]]
}

should_skip_copy_artifact() {
  local rel="$1"
  [[ "$rel" == ".DS_Store" || "$rel" == "._"* || "$rel" == */.DS_Store || "$rel" == */._* ]] && return 0
  is_retired_framework_path "$rel" && return 0
  return 1
}

safe_copy() {
  local src="$1" dst="$2"
  local retries="${3:-}" delay i use_stream=0 timeout_sec last_reason=""
  [[ -n "$retries" ]] || retries="$(safe_copy_retries_for "$dst")"
  delay="$(safe_copy_delay_for "$dst")"
  timeout_sec="$(safe_copy_timeout_sec_for "$dst")"
  if is_cloud_storage_path "$dst" && [[ -f "$src" ]]; then
    use_stream=1
  fi
  mkdir -p "$(dirname "$dst")" 2>/dev/null || true
  for ((i = 1; i <= retries; i++)); do
    SPINOSA_LAST_COPY_FAIL_REASON=""
    if [[ "$use_stream" -eq 1 ]]; then
      if copy_file_via_stream "$src" "$dst"; then
        return 0
      fi
      last_reason="${SPINOSA_LAST_COPY_FAIL_REASON:-stream copy failed}"
    elif spinosa_run_with_timeout "$timeout_sec" cp -p -- "$src" "$dst" 2>/dev/null; then
      return 0
    else
      last_reason="${SPINOSA_LAST_COPY_FAIL_REASON:-cp failed}"
    fi
    last_reason="${SPINOSA_LAST_COPY_FAIL_REASON:-$last_reason}"
    [[ "$i" -lt "$retries" ]] || break
    sleep "$delay"
    delay=$((delay * 2))
  done
  SPINOSA_LAST_COPY_FAIL_REASON="$last_reason"
  return 1
}

safe_copy_tree() {
  local src="$1" dst="$2"
  local src_real retries failed=0 src_item rel_path dst_item link_target
  local total_files=0 processed_files=0 copied_files=0 skipped_files=0 show_file_progress=0
  local sync_label="${SPINOSA_SYNC_LABEL:-}"
  local progress_action="copying"
  [[ -n "$sync_label" ]] && progress_action="syncing ${sync_label}"
  src_real="$(cd "$src" 2>/dev/null && pwd -P)" || return 1
  mkdir -p "$dst" || return 1
  retries="$(safe_copy_retries_for "$dst")"
  while IFS= read -r -d '' src_item; do
    [[ -f "$src_item" ]] || continue
    rel_path="${src_item#$src_real/}"
    should_skip_copy_artifact "$rel_path" && continue
    total_files=$((total_files + 1))
  done < <(find -P "$src_real" -type f -print0 2>/dev/null)
  if [[ "$total_files" -gt 4 && ( -t 2 || "${SPINOSA_PROGRESS_NEWLINES:-0}" == "1" ) ]]; then
    show_file_progress=1
  fi
  while IFS= read -r -d '' src_item; do
    rel_path="${src_item#$src_real/}"
    [[ -n "$rel_path" ]] || continue
    should_skip_copy_artifact "$rel_path" && continue
    dst_item="$dst/$rel_path"
    if [[ -L "$src_item" ]]; then
      mkdir -p "$(dirname "$dst_item")" || { failed=$((failed + 1)); continue; }
      link_target="$(readlink "$src_item")"
      rm -f "$dst_item" 2>/dev/null || true
      ln -sfn "$link_target" "$dst_item" 2>/dev/null || failed=$((failed + 1))
    elif [[ -d "$src_item" ]]; then
      mkdir -p "$dst_item" || failed=$((failed + 1))
    elif [[ -f "$src_item" ]]; then
      processed_files=$((processed_files + 1))
      if [[ "$show_file_progress" -eq 1 ]]; then
        render_copy_progress "$processed_files" "$total_files" "$copied_files" "$skipped_files" "$rel_path" "$progress_action"
      fi
      if [[ -f "$dst_item" ]] && files_match "$src_item" "$dst_item"; then
        skipped_files=$((skipped_files + 1))
        continue
      fi
      if safe_copy "$src_item" "$dst_item" "$retries"; then
        copied_files=$((copied_files + 1))
      else
        clear_progress_line
        warn "$(safe_copy_fail_message "$rel_path" "$dst")"
        failed=$((failed + 1))
      fi
    fi
  done < <(find -P "$src_real" -print0 2>/dev/null)
  [[ "$show_file_progress" -eq 1 ]] && clear_progress_line
  [[ "$failed" -eq 0 ]]
}

rsync_copy_dir_contents() {
  local src="$1" dst="$2" delete_mode="${3:-0}"
  command -v rsync >/dev/null 2>&1 || return 1
  is_cloud_storage_path "$src" && return 1
  is_cloud_storage_path "$dst" && return 1
  mkdir -p "$dst" || return 1
  if [[ "$delete_mode" == "1" ]]; then
    rsync -a --delete \
      --exclude '.DS_Store' \
      --exclude '._*' \
      "$src"/ "$dst"/
  else
    rsync -a \
      --exclude '.DS_Store' \
      --exclude '._*' \
      "$src"/ "$dst"/
  fi
}

copy_dir_contents() {
  local src="$1" dst="$2"
  local src_real="" framework_real=""
  mkdir -p "$dst"
  src_real="$(cd "$src" 2>/dev/null && pwd -P)" || die "Cannot copy missing directory: $src"
  if [[ -n "${TEMPLATE_ROOT:-}" ]]; then
    framework_real="$(cd "$TEMPLATE_ROOT" 2>/dev/null && pwd -P)" || framework_real=""
    if [[ -n "$framework_real" && "$src_real" == "$framework_real" ]]; then
      die "Refusing to copy framework root as a directory; check .spinosa/workspace-files.tsv for blank or unsafe paths."
    fi
  fi
  if rsync_copy_dir_contents "$src_real" "$dst" 0; then
    return 0
  fi
  if ! safe_copy_tree "$src_real" "$dst"; then
    if is_cloud_storage_path "$dst"; then
      die "Failed to copy directory to cloud storage destination (${SPINOSA_LAST_COPY_FAIL_REASON:-one or more files failed}) — open the folder in Finder, wait for sync, then retry"
    fi
    die "Failed to copy directory: $src"
  fi
}

framework_version() {
  local root="$1"
  if [[ -f "${root}/metadata/version" ]]; then
    sed -n '1p' "${root}/metadata/version"
  else
    echo "dev"
  fi
}


is_release_managed_role() {
  local role="$1"
  [[ "$role" != "user_state" && "$role" != "generated_state" && "$role" != "runtime" ]]
}


is_framework_manifest_entry() {
  local path="$1" role="$2"
  [[ -n "$path" ]] || return 1
  [[ "$path" != "path" ]] || return 1
  if [[ "$path" == "." || "$path" == "/" || "$path" == ./* || "$path" == ../* || "$path" == *"/../"* ]]; then
    die "Unsafe framework manifest path: $path"
  fi
  is_release_managed_role "$role"
}


resolve_latest_release_version() {
  local url
  if ! command -v curl >/dev/null 2>&1; then
    die "curl is required to resolve latest. Use --version X.Y.Z instead."
  fi
  spinner_start "Resolving latest version" >&2
  url="$(curl -fsSL -o /dev/null -w '%{url_effective}' "https://github.com/${SPINOSA_REPO}/releases/latest" 2>/dev/null || true)"
  spinner_stop >&2
  [[ -n "$url" && "$url" != */latest ]] || die "Could not resolve latest version. Use --version X.Y.Z instead."
  basename "$url" | sed 's/^v//'
}


release_dir_version() {
  local release_dir="$1" version="$2"
  if [[ "$version" != "latest" ]]; then
    echo "$version"
    return
  fi
  basename "$release_dir" | sed 's/^v//'
}


copy_to_clipboard() {
  local text="$1"
  if command -v pbcopy >/dev/null 2>&1; then
    printf '%s' "$text" | pbcopy
  elif command -v xclip >/dev/null 2>&1; then
    printf '%s' "$text" | xclip -selection clipboard
  elif command -v xsel >/dev/null 2>&1; then
    printf '%s' "$text" | xsel --clipboard --input
  elif command -v clip.exe >/dev/null 2>&1; then
    printf '%s' "$text" | clip.exe
  else
    return 1
  fi
}


sanitize_yaml() { printf '%s' "$1" | tr '"' "'" | tr '\n' ' '; }


shell_quote() {
  local value="$1"
  value="${value//\'/\'\\\'\'}"
  printf "'%s'" "$value"
}


print_box() {
  local iw=$((COLS > 6 ? COLS - 4 : 10))
  printf '\n  %s┌%s┐%s\n' "${DIM}" "$(printf '%.0s─' $(seq 1 "$iw"))" "${RESET}"
  printf '  %s│%s %s%s%s\n' "${DIM}" "${RESET}" "${BOLD}$1${RESET}" "${DIM}" "${RESET}"
  printf '  %s├%s┤%s\n' "${DIM}" "$(printf '%.0s─' $(seq 1 "$iw"))" "${RESET}"
  while IFS= read -r line; do
    printf '  %s│%s %s\n' "${DIM}" "${RESET}" "$line"
  done
  printf '  %s└%s┘%s\n' "${DIM}" "$(printf '%.0s─' $(seq 1 "$iw"))" "${RESET}"
}


file_size_bytes() {
  local path="$1"
  if stat -c %s "$path" >/dev/null 2>&1; then
    stat -c %s "$path"
  elif stat -f %z "$path" >/dev/null 2>&1; then
    stat -f %z "$path"
  else
    printf '0'
  fi
}


available_disk_bytes() {
  local path="$1"
  local value
  value="$(df -Pk "$path" 2>/dev/null | awk 'NR==2 {print $4}')" || value=""
  if [[ "$value" =~ ^[0-9]+$ ]]; then
    printf '%d' $((value * 1024))
  else
    printf '0'
  fi
}
