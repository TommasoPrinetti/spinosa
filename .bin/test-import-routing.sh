#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SPINOSA_LOG_COMPONENT="test-import-routing"
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/lib/spinosa/logging_bootstrap.sh" "$@"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
CONVERTER="${REPO_ROOT}/.bin/lib/markitdown-cli.py"

tmpdir="$(mktemp -d "${TMPDIR:-/tmp}/spinosa-import-routing.XXXXXX")"
cleanup() {
  rm -rf "$tmpdir" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

mkdir -p "$tmpdir/src" "$tmpdir/out"

printf 'name,score\nAda,10\nLinus,9\n' > "$tmpdir/src/sample.csv"
printf '{"name":"Ada","score":10}\n' > "$tmpdir/src/sample.json"
printf '<root><item>Ada</item></root>\n' > "$tmpdir/src/sample.xml"

SPINOSA_MARKITDOWN_DISABLE=1 python3 "$CONVERTER" "$tmpdir/src/sample.csv" "$tmpdir/out/sample__csv.md"
grep -q '| name | score |' "$tmpdir/out/sample__csv.md"
grep -q '| Ada | 10 |' "$tmpdir/out/sample__csv.md"

SPINOSA_MARKITDOWN_DISABLE=1 python3 "$CONVERTER" "$tmpdir/src/sample.json" "$tmpdir/out/sample__json.md"
grep -q '```json' "$tmpdir/out/sample__json.md"
grep -q '"name": "Ada"' "$tmpdir/out/sample__json.md"

SPINOSA_MARKITDOWN_DISABLE=1 python3 "$CONVERTER" "$tmpdir/src/sample.xml" "$tmpdir/out/sample__xml.md"
grep -q 'Root element: `root`' "$tmpdir/out/sample__xml.md"
grep -q '```xml' "$tmpdir/out/sample__xml.md"

{
  printf 'SOURCE\t%s\n' "$tmpdir/src"
  printf 'FILE\t%s\t%s\n' "$tmpdir/src/sample.csv" "$tmpdir/out/batch__csv.md"
  printf 'FILE\t%s\t%s\n' "$tmpdir/src/sample.json" "$tmpdir/out/batch__json.md"
  printf 'FILE\t%s\t%s\n' "$tmpdir/src/sample.xml" "$tmpdir/out/batch__xml.md"
} | SPINOSA_MARKITDOWN_DISABLE=1 python3 "$CONVERTER" --batch 2>"$tmpdir/events.log"

grep -q $'END\tok\tsample.csv' "$tmpdir/events.log"
grep -q $'END\tok\tsample.json' "$tmpdir/events.log"
grep -q $'END\tok\tsample.xml' "$tmpdir/events.log"
test -s "$tmpdir/out/batch__csv.md"
test -s "$tmpdir/out/batch__json.md"
test -s "$tmpdir/out/batch__xml.md"

python3 - "$CONVERTER" "$REPO_ROOT/.bin/lib/rapidocr-cli.py" "$tmpdir" <<'PY'
import importlib.util
import sys
from pathlib import Path

markitdown_path = Path(sys.argv[1])
rapidocr_path = Path(sys.argv[2])
tmpdir = Path(sys.argv[3])

def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module

markitdown = load(markitdown_path, "spinosa_markitdown_cli")
rapidocr = load(rapidocr_path, "spinosa_rapidocr_cli")

try:
    from pypdf import PdfWriter
except Exception:
    PdfWriter = None

md_out = tmpdir / "workspace" / "raw" / "report__pdf.md"
markitdown.write_markdown(
    "report.pdf",
    str(md_out),
    "## Page 1\n\nAlpha\n\n---\n\n## Page 2\n\nBeta\n",
    "docs/report.pdf",
)
assert not md_out.exists()
assert (tmpdir / "workspace" / "raw" / "report__pdf" / "page-001.md").exists()
page_2 = (tmpdir / "workspace" / "raw" / "report__pdf" / "page-002.md").read_text()
assert 'source_document: "raw/report__pdf"' in page_2
assert 'original_source: "docs/report.pdf"' in page_2
assert "page_number: 2" in page_2
assert "page_count: 2" in page_2
assert "converter_engine: markitdown" in page_2
assert "Beta" in page_2

ocr_out = tmpdir / "workspace" / "raw" / "scan.md"
rapidocr.write_split_pages(
    str(ocr_out),
    "Scan",
    [(1, "One"), (2, "Two")],
    "scans/scan.pdf",
    "rapidocr",
    "pdf",
    "ocr_page_split",
)
assert not ocr_out.exists()
ocr_page = (tmpdir / "workspace" / "raw" / "scan" / "page-001.md").read_text()
assert 'source: "raw/scan/page-001.md"' in ocr_page
assert 'part_of: "scans/scan.pdf"' in ocr_page
assert "converter_engine: rapidocr" in ocr_page
assert "One" in ocr_page

if PdfWriter is not None:
    pdf_path = tmpdir / "two-page.pdf"
    writer = PdfWriter()
    writer.add_blank_page(width=72, height=72)
    writer.add_blank_page(width=72, height=72)
    with pdf_path.open("wb") as f:
        writer.write(f)

    class FakeResult:
        def __init__(self, text):
            self.text_content = text

    class FakeMarkItDown:
        def __init__(self):
            self.calls = 0

        def convert(self, _path):
            self.calls += 1
            return FakeResult(f"PDF page {self.calls}")

    pdf_pages = markitdown.convert_pdf_pages(FakeMarkItDown(), str(pdf_path))
    assert pdf_pages == [(1, "PDF page 1"), (2, "PDF page 2")]
PY

printf 'import routing fallback tests passed\n'
