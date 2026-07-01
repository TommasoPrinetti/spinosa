#!/usr/bin/env bash
# Integration gate: spinosa new against the canonical TEST-VAULT corpus.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
SPINOSA_LOG_COMPONENT="test-new-test-vault"
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/lib/spinosa/logging_bootstrap.sh" "$@"

# Canonical corpus (override for Linux VM: /tmp/TEST-VAULT after rsync).
SPINOSA_TEST_VAULT="${SPINOSA_TEST_VAULT:-/Users/tommasoprinetti/Downloads/TEST-VAULT}"
# subset | mixed | full — default subset is fast; use full before major releases.
SPINOSA_TEST_VAULT_SCOPE="${SPINOSA_TEST_VAULT_SCOPE:-subset}"

export SPINOSA_NO_UPGRADE_CHECK=1
export NO_COLOR=1
export RLWRAP_EXEC=1

SPINOSA_BIN="${SPINOSA_BIN:-}"
if [[ -z "$SPINOSA_BIN" ]]; then
  if [[ -x "${REPO_ROOT}/.bin/spinosa" ]]; then
    SPINOSA_BIN="${REPO_ROOT}/.bin/spinosa"
  elif command -v spinosa >/dev/null 2>&1; then
    SPINOSA_BIN="$(command -v spinosa)"
  else
    echo "FAIL: spinosa not found — set SPINOSA_BIN or install CLI" >&2
    exit 1
  fi
fi

if [[ ! -d "$SPINOSA_TEST_VAULT" ]]; then
  echo "FAIL: TEST-VAULT not found at ${SPINOSA_TEST_VAULT}" >&2
  echo "  Set SPINOSA_TEST_VAULT to the corpus root (see docs/reference/testsuite.md)." >&2
  exit 1
fi

case "$SPINOSA_TEST_VAULT_SCOPE" in
  subset)
    CORPUS_SRC="${SPINOSA_TEST_VAULT}/generic-files"
    EXTENSIONS="pdf,csv,docx"
    MIN_RAW_FILES=3
    ;;
  mixed)
    CORPUS_SRC="${SPINOSA_TEST_VAULT}/Ex2-harvesting-tasks"
    EXTENSIONS="md,jpg,pdf,json"
    MIN_RAW_FILES=10
    ;;
  full)
    CORPUS_SRC="$SPINOSA_TEST_VAULT"
    EXTENSIONS="md,jpg,pdf,csv,docx,json"
    MIN_RAW_FILES=50
    ;;
  *)
    echo "FAIL: invalid SPINOSA_TEST_VAULT_SCOPE=${SPINOSA_TEST_VAULT_SCOPE} (subset|mixed|full)" >&2
    exit 1
    ;;
esac

[[ -d "$CORPUS_SRC" ]] || { echo "FAIL: corpus scope path missing: ${CORPUS_SRC}" >&2; exit 1; }

RUN_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/spinosa-test-vault.XXXXXX")"
cleanup() { rm -rf "$RUN_ROOT"; }
trap cleanup EXIT INT TERM

CORPUS="${RUN_ROOT}/corpus"
WORKSPACE="${RUN_ROOT}/corpus-spinosa"
rm -rf "$CORPUS" "$WORKSPACE"
mkdir -p "$CORPUS"

if command -v rsync >/dev/null 2>&1; then
  rsync -a --exclude '.DS_Store' --exclude '._*' "${CORPUS_SRC}/" "${CORPUS}/"
else
  cp -R "${CORPUS_SRC}/." "${CORPUS}/"
  find "$CORPUS" \( -name '.DS_Store' -o -name '._*' \) -delete 2>/dev/null || true
fi

source_count="$(find "$CORPUS" -type f ! -name '.DS_Store' ! -name '._*' | wc -l | tr -d ' ')"
[[ "$source_count" -gt 0 ]] || { echo "FAIL: empty corpus copy from ${CORPUS_SRC}" >&2; exit 1; }

log_file="${RUN_ROOT}/new.log"
if ! "$SPINOSA_BIN" new "$CORPUS" \
  --extensions "$EXTENSIONS" \
  --cli other \
  --launch copy \
  --no-color >"$log_file" 2>&1; then
  echo "FAIL: spinosa new exited non-zero (scope=${SPINOSA_TEST_VAULT_SCOPE})" >&2
  tail -40 "$log_file" >&2 || true
  exit 1
fi

if grep -qE 'Opened OpenCode|Opened Codex|Opened Gemini' "$log_file" 2>/dev/null; then
  echo "FAIL: LLM CLI was launched — use --launch copy" >&2
  exit 1
fi

[[ -f "${WORKSPACE}/.spinosa/workspace" ]] || {
  echo "FAIL: workspace metadata missing at ${WORKSPACE}/.spinosa/workspace" >&2
  exit 1
}

grep -q 'setup_status: cli_started' "${WORKSPACE}/.spinosa/workspace" || {
  echo "FAIL: setup_status not cli_started" >&2
  exit 1
}

raw_count="$(find "${WORKSPACE}/raw" -type f ! -name '.gitkeep' ! -name 'AGENTS.md' | wc -l | tr -d ' ')"
if [[ "$raw_count" -lt "$MIN_RAW_FILES" ]]; then
  echo "FAIL: expected at least ${MIN_RAW_FILES} raw files, got ${raw_count} (scope=${SPINOSA_TEST_VAULT_SCOPE})" >&2
  exit 1
fi

printf 'test-new-test-vault passed scope=%s source_files=%s raw_files=%s workspace=%s\n' \
  "$SPINOSA_TEST_VAULT_SCOPE" "$source_count" "$raw_count" "$WORKSPACE"