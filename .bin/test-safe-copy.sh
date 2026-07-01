#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SPINOSA_LOG_COMPONENT="test-safe-copy"
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/lib/spinosa/logging_bootstrap.sh" "$@"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
SPINOSA_LIB_DIR="$REPO_ROOT/.bin/lib/spinosa"
# shellcheck source=/dev/null
source "$SPINOSA_LIB_DIR/core.sh"

tmpdir="$(mktemp -d)"
cleanup() { rm -rf "$tmpdir"; }
trap cleanup EXIT

mkdir -p "$tmpdir/src/sub"
printf 'alpha\n' > "$tmpdir/src/a.txt"
printf 'beta\n' > "$tmpdir/src/sub/b.txt"
ln -s "sub/b.txt" "$tmpdir/src/link.txt"

safe_copy_tree "$tmpdir/src" "$tmpdir/dst" || { echo "FAIL safe_copy_tree"; exit 1; }
[[ -f "$tmpdir/dst/a.txt" && -f "$tmpdir/dst/sub/b.txt" ]] || { echo "FAIL missing copied files"; exit 1; }
[[ "$(cat "$tmpdir/dst/a.txt")" == "alpha" ]] || { echo "FAIL a.txt content"; exit 1; }
[[ -L "$tmpdir/dst/link.txt" ]] || { echo "FAIL symlink copy"; exit 1; }

SPINOSA_LOCAL_COPY_TIMEOUT_SEC=1
SPINOSA_LAST_COPY_FAIL_REASON=""
if spinosa_run_with_timeout 1 sleep 5; then
  echo "FAIL expected timeout"
  exit 1
fi
[[ "$SPINOSA_LAST_COPY_FAIL_REASON" == *"timed out"* ]] || {
  echo "FAIL timeout reason: ${SPINOSA_LAST_COPY_FAIL_REASON}"
  exit 1
}

printf 'safe copy tests passed\n'