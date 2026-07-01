#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SPINOSA_LOG_COMPONENT="test-doctor"
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/lib/spinosa/logging_bootstrap.sh" "$@"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$REPO_ROOT"

export SPINOSA_NO_UPGRADE_CHECK=1
export NO_COLOR=1
export RLWRAP_EXEC=1
export SPINOSA_HOME="${SPINOSA_HOME:-$HOME/.spinosa}"

FRAMEWORK_ROOT="$REPO_ROOT"
SPINOSA_LIB_DIR="$REPO_ROOT/.bin/lib/spinosa"
MARKDOWN_EXTENSIONS="txt|md"
NATIVE_EXTENSIONS="md"
BINARY_COPYABLE_EXTENSIONS=""
MARKITDOWN_EXTENSIONS="docx"
AUDIO_VIDEO_EXTENSIONS="mp4|mp3"
IMAGE_EXTENSIONS="jpg|png"
STRUCTURED_FALLBACK_EXTENSIONS="csv|json|xml"
TODAY="$(date +%Y-%m-%d)"
R="" G="" B="" Y="" C="" M="" PG="" DIM="" BOLD="" RESET=""
COLS=80

for lib in ui core handoff import import_scan import_copy import_onboarding_log workspace tools commands_new commands_add commands_system commands_dashboard commands_startup; do
  # shellcheck source=/dev/null
  source "$SPINOSA_LIB_DIR/${lib}.sh"
done

tmpdir="$(mktemp -d)"
cleanup() { rm -rf "$tmpdir"; }
trap cleanup EXIT

mkdir -p "$tmpdir/fw/metadata" "$tmpdir/ws/.spinosa" "$tmpdir/ws/.hermes"
printf '%s\n' "0.6.9" > "$tmpdir/fw/metadata/version"
cat > "$tmpdir/ws/.spinosa/workspace" << EOF
project_name: test
framework_version: 0.0.1
setup_status: cli_started
EOF
cat > "$tmpdir/ws/.hermes/workspace.config.yaml" << EOF
skills:
  external_dirs:
    - ${tmpdir}/ws/.hermes/skills
terminal:
  cwd: ${tmpdir}/ws
EOF

FRAMEWORK_ROOT="$tmpdir/fw"
set +e
output="$(cmd_doctor --workspace "$tmpdir/ws" 2>&1)"
doctor_rc=$?
set -e
printf '%s\n' "$output"

[[ "$doctor_rc" -eq 1 ]] || { echo "FAIL expected doctor exit 1 when issues present"; exit 1; }
echo "$output" | grep -Fq "behind CLI" || { echo "FAIL expected workspace behind CLI warning"; exit 1; }
echo "$output" | grep -Fq "Hermes" || { echo "FAIL expected Hermes stale warning"; exit 1; }

printf 'doctor tests passed\n'