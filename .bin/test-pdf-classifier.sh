#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

export SPINOSA_HOME="${SPINOSA_HOME:-$HOME/.spinosa}"
export SPINOSA_NO_REPAIR=1
export NO_COLOR=1
export RLWRAP_EXEC=1

FRAMEWORK_ROOT="$REPO_ROOT"
SPINOSA_LIB_DIR="$REPO_ROOT/.bin/lib/spinosa"
MARKDOWN_EXTENSIONS="txt"
NATIVE_EXTENSIONS="md"
BINARY_COPYABLE_EXTENSIONS=""
MARKITDOWN_EXTENSIONS="docx"
AUDIO_VIDEO_EXTENSIONS="mp4"
IMAGE_EXTENSIONS="jpg"
STRUCTURED_FALLBACK_EXTENSIONS="csv|json|xml"
TODAY="$(date +%Y-%m-%d)"
R="" G="" B="" Y="" C="" M="" PG="" DIM="" BOLD="" RESET=""
COLS=80

for lib in ui core handoff import import_scan import_copy import_onboarding_log workspace tools; do
  # shellcheck source=/dev/null
  source "$SPINOSA_LIB_DIR/${lib}.sh"
done

command -v pdftotext >/dev/null 2>&1 || { echo "SKIP: pdftotext not installed"; exit 0; }
pypdf_available || { echo "SKIP: pypdf not available"; exit 0; }

tmpdir="$(mktemp -d)"
cleanup() { rm -rf "$tmpdir"; }
trap cleanup EXIT

python3 - "$tmpdir" <<'PY'
from pathlib import Path
import sys

from pypdf import PdfWriter

tmpdir = Path(sys.argv[1])

blank3 = tmpdir / "blank3.pdf"
writer = PdfWriter()
for _ in range(3):
    writer.add_blank_page(width=72, height=72)
with blank3.open("wb") as handle:
    writer.write(handle)

cover_only = tmpdir / "cover_only.pdf"
writer = PdfWriter()
writer.add_blank_page(width=72, height=72)
writer.add_blank_page(width=72, height=72)
writer.add_blank_page(width=72, height=72)
with cover_only.open("wb") as handle:
    writer.write(handle)
PY

blank3="$tmpdir/blank3.pdf"
[[ -f "$blank3" ]] || { echo "FAIL: could not create blank3.pdf"; exit 1; }

count="$(pdf_page_count "$blank3")"
[[ "$count" == "3" ]] || { echo "FAIL: expected 3 pages, got $count"; exit 1; }

pdf_text_pages_meet_threshold "$blank3" 3 && { echo "FAIL: blank 3-page PDF should not meet text threshold"; exit 1; }

is_text_based_pdf "$blank3" && { echo "FAIL: blank 3-page PDF should not be text-based"; exit 1; }

printf 'pdf classifier tests passed\n'