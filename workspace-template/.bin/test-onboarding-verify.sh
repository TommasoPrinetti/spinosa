#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SPINOSA_LOG_COMPONENT="test-onboarding-verify"
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/lib/spinosa/logging_bootstrap.sh" "$@"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$REPO_ROOT"

export SPINOSA_NO_REPAIR=1
export NO_COLOR=1
export RLWRAP_EXEC=1
export SPINOSA_HOME="${SPINOSA_HOME:-$HOME/.spinosa}"

TEMPLATE_ROOT="$REPO_ROOT"
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

for lib in ui core handoff import import_scan import_copy import_onboarding_log workspace tools; do
  # shellcheck source=/dev/null
  source "$SPINOSA_LIB_DIR/${lib}.sh"
done

tmpdir="$(mktemp -d)"
cleanup() { rm -rf "$tmpdir"; }
trap cleanup EXIT

mkdir -p "$tmpdir/src/sub" "$tmpdir/ws/raw" "$tmpdir/ws/.logs"
printf 'hello world\n' > "$tmpdir/src/notes.txt"
printf '# Title\n\nBody\n' > "$tmpdir/src/sub/readme.md"
printf 'pdf body\n' > "$tmpdir/src/report.pdf"

SCAN_MARKITDOWN_CHOICE=no
SCAN_OCR_CHOICE=no

reset_import_batches
scan_source "$tmpdir/src"
SELECTED_IMPORT_EXTENSIONS=(txt md)

onboarding_log_init "$tmpdir/ws" "test" "$tmpdir/src"
onboarding_log_import_options "$tmpdir/src" ""

grep -q 'enabled=.md:1,.txt:1' "$tmpdir/ws/framework/logs/onboarding.log" || { echo "FAIL onboarding.log enabled batches"; exit 1; }
grep -q 'excluded=.pdf:1' "$tmpdir/ws/framework/logs/onboarding.log" || { echo "FAIL onboarding.log excluded batches"; exit 1; }
grep -q 'corpus_importable_total=3' "$tmpdir/ws/framework/logs/onboarding.log" || { echo "FAIL onboarding.log corpus total"; exit 1; }

rel="$(expected_import_dest_rel "$tmpdir/src" "$tmpdir/src/notes.txt")"
[[ "$rel" == "notes__txt.md" ]] || { echo "FAIL txt dest: $rel"; exit 1; }

rel2="$(expected_import_dest_rel "$tmpdir/src" "$tmpdir/src/sub/readme.md")"
[[ "$rel2" == "sub/readme.md" ]] || { echo "FAIL md dest: $rel2"; exit 1; }

verify_and_recover_import "$tmpdir/src" "$tmpdir/ws/raw"
[[ -f "$tmpdir/ws/raw/notes__txt.md" ]] || { echo "FAIL missing recovered txt"; exit 1; }
[[ -f "$tmpdir/ws/raw/sub/readme.md" ]] || { echo "FAIL missing recovered md"; exit 1; }
grep -q 'phase=verify event=complete' "$tmpdir/ws/framework/logs/onboarding.log" || { echo "FAIL onboarding.log verify line"; exit 1; }

assert_import_delivered "$tmpdir/src" "$tmpdir/ws/raw" || { echo "FAIL assert_import_delivered after recovery"; exit 1; }
grep -q 'event=delivered.*excluded=.pdf:1' "$tmpdir/ws/framework/logs/onboarding.log" || { echo "FAIL onboarding.log delivered excluded"; exit 1; }

# --extensions mismatch should fail validation
reset_import_batches
scan_source "$tmpdir/src"
parse_selected_extensions_from_flag "epub"
validate_selected_extensions_against_scan "epub" && { echo "FAIL expected epub mismatch"; exit 1; }

# matching flag should pass
parse_selected_extensions_from_flag "txt,md"
validate_selected_extensions_against_scan "txt,md" || { echo "FAIL expected txt,md match"; exit 1; }

printf 'onboarding verify tests passed\n'