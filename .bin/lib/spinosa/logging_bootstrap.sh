# shellcheck shell=bash
# Source from .bin/*.sh scripts to enable unified logging.
# Usage:
#   SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
#   SPINOSA_LOG_COMPONENT="sync-agents"
#   # shellcheck source=/dev/null
#   source "${SCRIPT_DIR}/lib/spinosa/logging_bootstrap.sh" "$@"

_bootstrap_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${_bootstrap_dir}/logging.sh" ]]; then
  # shellcheck source=/dev/null
  source "${_bootstrap_dir}/logging.sh"
  spinosa_log_init "${SPINOSA_LOG_COMPONENT:-spinosa-script}" "$@"
  spinosa_log_enable_err_trap
fi
unset _bootstrap_dir