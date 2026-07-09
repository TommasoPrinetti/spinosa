# shellcheck shell=bash
# Install completion markers — partial ~/.spinosa/versions/* dirs are not "installed".

SPINOSA_INSTALL_COMPLETE_STAMP=".spinosa-install-complete"

spinosa_read_last_installed_version() {
  local file="${SPINOSA_CONFIG}"
  [[ -f "$file" ]] || return 1
  awk '$1 == "last_installed_version:" { print $2; exit }' "$file"
}

spinosa_version_dir_has_framework() {
  local version="$1"
  local fw_dir="${SPINOSA_HOME}/versions/${version}"
  [[ -d "$fw_dir" ]] || return 1
  find "$fw_dir" -maxdepth 1 -type d -name 'spinosa-framework-*' 2>/dev/null | grep -q .
}

spinosa_version_install_complete() {
  local version="$1"
  [[ -n "$version" ]] || return 1
  case "$version" in
    .*|*/*) return 1 ;;
  esac

  spinosa_version_dir_has_framework "$version" || return 1

  if [[ -f "${SPINOSA_HOME}/versions/${version}/${SPINOSA_INSTALL_COMPLETE_STAMP}" ]]; then
    return 0
  fi

  # Legacy installs before v0.7.3: trust metadata when it matches this version.
  local last
  last="$(spinosa_read_last_installed_version 2>/dev/null || true)"
  [[ -n "$last" && "$last" == "$version" ]]
}

spinosa_list_version_dirs() {
  local entry
  [[ -d "${SPINOSA_HOME}/versions" ]] || return 0
  for entry in "${SPINOSA_HOME}/versions"/*; do
    [[ -e "$entry" ]] || continue
    basename "$entry"
  done
}

spinosa_latest_complete_version() {
  local entry version latest="" cmp
  [ -d "${SPINOSA_HOME}/versions" ] || return 0
  for entry in "${SPINOSA_HOME}/versions"/*; do
    [ -e "$entry" ] || continue
    version="$(basename "$entry")"
    spinosa_version_install_complete "$version" || continue
    if [ -z "$latest" ]; then
      latest="$version"
    elif declare -F compare_versions >/dev/null 2>&1; then
      cmp=0; compare_versions "$version" "$latest" || cmp=$?
      [ "$cmp" -eq 1 ] && latest="$version"
    fi
  done
  [ -n "$latest" ] && printf '%s\n' "$latest"
}

spinosa_list_incomplete_versions() {
  local version
  while IFS= read -r version; do
    [[ -n "$version" ]] || continue
    spinosa_version_install_complete "$version" || printf '%s\n' "$version"
  done < <(spinosa_list_version_dirs)
}

spinosa_mark_version_install_complete() {
  local version="$1"
  local stamp="${SPINOSA_HOME}/versions/${version}/${SPINOSA_INSTALL_COMPLETE_STAMP}"
  mkdir -p "${SPINOSA_HOME}/versions/${version}"
  printf '%s %s\n' "$version" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$stamp"
}