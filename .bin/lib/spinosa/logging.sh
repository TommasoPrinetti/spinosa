# shellcheck shell=bash
# Unified file logging for Spinosa bash scripts.
# Default log: ${SPINOSA_HOME}/logs/spinosa.log

spinosa_log_file() {
  if [[ -n "${SPINOSA_LOG_FILE:-}" ]]; then
    printf '%s\n' "$SPINOSA_LOG_FILE"
    return 0
  fi
  printf '%s/logs/spinosa.log\n' "${SPINOSA_HOME:-$HOME/.spinosa}"
}

spinosa_log_init() {
  local component="${1:-spinosa}"
  shift || true
  local log_file
  log_file="$(spinosa_log_file)"
  mkdir -p "$(dirname "$log_file")" 2>/dev/null || return 0
  {
    printf '\n---\n'
    printf '%s component=%s pid=%s ppid=%s shell=%s cwd=%s' \
      "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      "$component" "$$" "$PPID" "${BASH_VERSION:-sh}" "$PWD"
    if [[ $# -gt 0 ]]; then
      printf ' argv=%q' "$@"
    fi
    printf '\n'
  } >> "$log_file" 2>/dev/null || true
}

spinosa_log() {
  local level="$1"
  shift || true
  local log_file msg
  log_file="$(spinosa_log_file)"
  msg="$*"
  mkdir -p "$(dirname "$log_file")" 2>/dev/null || return 0
  printf '%s level=%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$level" "$msg" >> "$log_file" 2>/dev/null || true
}

spinosa_log_err_trap() {
  local exit_code=$? line=$1
  spinosa_log ERROR "aborted line=${line} exit=${exit_code} cmd=${BASH_COMMAND:-}"
}

spinosa_log_enable_err_trap() {
  trap 'spinosa_log_err_trap $LINENO' ERR
}