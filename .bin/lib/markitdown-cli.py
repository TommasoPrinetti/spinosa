#!/usr/bin/env python3
"""
markitdown-cli.py — MarkItDown wrapper for Pilosa Framework

Converts MarkItDown-supported local files to Markdown when available.
CSV, JSON, and XML have stdlib fallbacks.
Runs fully offline — no cloud dependencies.

Usage (single file):
    markitdown-cli <input_file> <output.md>

Usage (batch mode — single engine instance for many files):
    markitdown-cli --batch

    stdin protocol (tab-separated lines):
        SOURCE\t/path/to/source/root
        FILE\t/path/to/src.docx\t/path/to/dest.md

    stderr protocol (tab-separated lines):
        BEGIN\trel_path
        END\tok\trel_path\tduration_s
        END\tfail\trel_path\tduration_s

    PROGRESS events are NOT emitted — MarkItDown converters are not
    page-oriented. The orchestrator handles missing PROGRESS gracefully
    per CONVERTER_PROTOCOL.md v1.

Input: MarkItDown-supported local files plus CSV/JSON/XML fallback.
Output: Markdown file
"""

import os
import argparse
import csv
import json
import re
import sys
import tempfile
import time
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Optional


EXTENSIONS = {
    ".docx", ".pptx", ".xlsx", ".xls",
    ".epub", ".html", ".htm", ".msg", ".zip",
    ".pdf", ".json", ".csv", ".xml",
    ".wav", ".mp3", ".m4a",
}
FALLBACK_EXTENSIONS = {".csv", ".json", ".xml"}
MAX_TABLE_ROWS = 200
MAX_TEXT_CHARS = 200_000
PAGE_HEADING_RE = re.compile(r"(?m)^##\s+Page\s+([0-9]+)\s*$")


def extract_title(file_path: str) -> str:
    name = Path(file_path).stem
    name = name.replace("_", " ").replace("-", " ")
    return name.title()


def escape_markdown_cell(value: object) -> str:
    text = "" if value is None else str(value)
    return text.replace("\\", "\\\\").replace("|", "\\|").replace("\n", "<br>")


def truncate_text(text: str) -> str:
    if len(text) <= MAX_TEXT_CHARS:
        return text
    return text[:MAX_TEXT_CHARS] + "\n\n[Content truncated by Spinosa fallback converter]\n"


def csv_fallback(input_path: str) -> str:
    with open(input_path, newline="", encoding="utf-8-sig", errors="replace") as f:
        rows = list(csv.reader(f))
    if not rows:
        return "[No rows found in CSV]"

    width = max(len(row) for row in rows)
    normalized = [row + [""] * (width - len(row)) for row in rows]
    header = normalized[0]
    if not any(cell.strip() for cell in header):
        header = [f"Column {i + 1}" for i in range(width)]

    body = normalized[1:MAX_TABLE_ROWS + 1]
    lines = [
        "| " + " | ".join(escape_markdown_cell(cell) for cell in header) + " |",
        "| " + " | ".join("---" for _ in header) + " |",
    ]
    for row in body:
        lines.append("| " + " | ".join(escape_markdown_cell(cell) for cell in row) + " |")
    if len(normalized) - 1 > MAX_TABLE_ROWS:
        lines.append("")
        lines.append(f"[{len(normalized) - 1 - MAX_TABLE_ROWS} additional row(s) truncated]")
    return "\n".join(lines)


def json_fallback(input_path: str) -> str:
    with open(input_path, encoding="utf-8", errors="replace") as f:
        data = json.load(f)
    rendered = json.dumps(data, indent=2, ensure_ascii=False)
    return "```json\n" + truncate_text(rendered) + "\n```"


def xml_fallback(input_path: str) -> str:
    tree = ET.parse(input_path)
    root = tree.getroot()
    raw = Path(input_path).read_text(encoding="utf-8", errors="replace")
    return (
        f"Root element: `{root.tag}`\n\n"
        "```xml\n"
        + truncate_text(raw)
        + "\n```"
    )


def fallback_convert(input_path: str) -> str:
    ext = Path(input_path).suffix.lower()
    if ext == ".csv":
        return csv_fallback(input_path)
    if ext == ".json":
        return json_fallback(input_path)
    if ext == ".xml":
        return xml_fallback(input_path)
    return ""


def yaml_quote(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def page_folder_for_output(output_path: str) -> str:
    path = Path(output_path)
    if path.suffix.lower() == ".md":
        return str(path.with_suffix(""))
    return str(path) + "_pages"


def split_page_marked_text(text: str) -> list[tuple[int, str]]:
    matches = list(PAGE_HEADING_RE.finditer(text))
    if len(matches) > 1:
        pages = []
        for idx, match in enumerate(matches):
            page_number = int(match.group(1))
            start = match.end()
            end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
            page_text = text[start:end].strip()
            page_text = re.sub(r"^\s*---\s*", "", page_text).strip()
            page_text = re.sub(r"\s*---\s*$", "", page_text).strip()
            pages.append((page_number, page_text))
        return pages

    form_feed_parts = [part.strip() for part in text.split("\f")]
    if len(form_feed_parts) > 1:
        return [(idx + 1, part) for idx, part in enumerate(form_feed_parts)]

    return []


def write_page_markdown(
    page_path: str,
    title: str,
    page_text: str,
    page_number: int,
    page_count: int,
    original_source: str,
    converter_engine: str,
    original_format: str,
    processing_status: str,
) -> None:
    header = "\n".join(
        [
            "---",
            f"source_document: {yaml_quote(Path(original_source).name)}",
            f"page: {page_number}",
            f"page_count: {page_count}",
            "---",
            "",
        ]
    )
    body = page_text.strip() or "[No text detected on this page]"
    markdown = f"{header}# {title} — Page {page_number}\n\n{body}\n"
    os.makedirs(os.path.dirname(page_path) or ".", exist_ok=True)
    with open(page_path, "w", encoding="utf-8") as f:
        f.write(markdown)


def write_split_pages(
    output_path: str,
    title: str,
    pages: list[tuple[int, str]],
    original_source: str,
    converter_engine: str,
    original_format: str,
    processing_status: str,
) -> str:
    folder = page_folder_for_output(output_path)
    if os.path.isfile(output_path):
        os.remove(output_path)
    if os.path.isdir(folder):
        for existing in Path(folder).glob("page-*.md"):
            existing.unlink()
    os.makedirs(folder, exist_ok=True)
    page_count = len(pages)
    for page_number, page_text in pages:
        page_path = os.path.join(folder, f"page-{page_number:03d}.md")
        write_page_markdown(
            page_path,
            title,
            page_text,
            page_number,
            page_count,
            original_source,
            converter_engine,
            original_format,
            processing_status,
        )
    return folder


def configured_extensions() -> set[str]:
    extensions = set(EXTENSIONS)
    raw = os.environ.get("SPINOSA_MARKITDOWN_EXTRA_EXTENSIONS", "")
    for item in raw.replace("|", ",").split(","):
        ext = item.strip().lower()
        if not ext:
            continue
        if not ext.startswith("."):
            ext = "." + ext
        extensions.add(ext)
    return extensions


def convert_file(md, input_path: str) -> str:
    ext = Path(input_path).suffix.lower()
    if md is not None:
        try:
            result = md.convert(input_path)
            if result and result.text_content and result.text_content.strip():
                return result.text_content.strip()
        except Exception:
            if ext not in FALLBACK_EXTENSIONS:
                raise
    if ext in FALLBACK_EXTENSIONS:
        return fallback_convert(input_path).strip()
    return ""


def convert_pdf_pages(md, input_path: str) -> list[tuple[int, str]]:
    if md is None or Path(input_path).suffix.lower() != ".pdf":
        return []
    try:
        from pypdf import PdfReader, PdfWriter
    except Exception:
        print("  WARNING: pypdf not available — page splitting disabled for text-based PDFs", file=sys.stderr, flush=True)
        return []

    temp_paths = []
    try:
        reader = PdfReader(input_path)
        page_count = len(reader.pages)
        if page_count <= 1:
            return []

        pages = []
        for idx, page in enumerate(reader.pages, start=1):
            writer = PdfWriter()
            writer.add_page(page)
            with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
                temp_paths.append(tmp.name)
                writer.write(tmp)
            result = md.convert(temp_paths[-1])
            text = ""
            if result and result.text_content:
                text = result.text_content.strip()
            pages.append((idx, text))
        return pages
    except Exception:
        print(f"  WARNING: page splitting failed for {input_path} — falling back to flat conversion", file=sys.stderr, flush=True)
        return []
    finally:
        for temp_path in temp_paths:
            try:
                os.remove(temp_path)
            except OSError:
                pass


def write_markdown(input_path: str, output_path: str, text: str, original_source: Optional[str] = None):
    title = extract_title(input_path)
    original_source = original_source or os.path.basename(input_path)
    if not text.strip():
        text = "[No content extracted from file]"
    pages = split_page_marked_text(text)
    if len(pages) > 1:
        original_format = Path(input_path).suffix.lower().lstrip(".") or "unknown"
        write_split_pages(
            output_path,
            title,
            pages,
            original_source,
            "markitdown",
            original_format,
            "markitdown_page_split",
        )
        return
    markdown = f"# {title}\n\n{text.strip()}\n"
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(markdown)


def load_markitdown(required: bool):
    if os.environ.get("SPINOSA_MARKITDOWN_DISABLE") == "1":
        if required:
            raise ImportError("MarkItDown disabled by SPINOSA_MARKITDOWN_DISABLE")
        return None
    try:
        from markitdown import MarkItDown
        enable_plugins = os.environ.get("SPINOSA_MARKITDOWN_ENABLE_PLUGINS", "0") == "1"
        return MarkItDown(enable_plugins=enable_plugins)
    except ImportError as e:
        if required:
            raise
        return None


def single_main(input_path: str, output_path: str):
    if not os.path.exists(input_path):
        print(f"  Input file not found: {input_path}", file=sys.stderr, flush=True)
        sys.exit(1)

    ext = Path(input_path).suffix.lower()
    if ext not in configured_extensions():
        print(f"  Unsupported file type: {input_path}", file=sys.stderr, flush=True)
        sys.exit(1)

    try:
        md = load_markitdown(required=ext not in FALLBACK_EXTENSIONS)
        pdf_pages = convert_pdf_pages(md, input_path)
        if pdf_pages:
            write_split_pages(
                output_path,
                extract_title(input_path),
                pdf_pages,
                os.path.basename(input_path),
                "markitdown",
                "pdf",
                "markitdown_pdf_page_split",
            )
            sys.exit(0)
        text = convert_file(md, input_path)
        write_markdown(input_path, output_path, text)

        sys.exit(0)

    except ImportError as e:
        print(f"  Missing required package: {e}", file=sys.stderr, flush=True)
        sys.exit(1)
    except Exception as e:
        print(f"  MarkItDown conversion failed: {e}", file=sys.stderr, flush=True)
        sys.exit(1)


def batch_main():
    source_prefix = None
    md = None

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        parts = line.split("\t")
        if len(parts) < 2:
            continue

        cmd = parts[0]

        if cmd == "SOURCE":
            source_prefix = parts[1]
        elif cmd == "FILE":
            if len(parts) < 3:
                continue
            src_path = parts[1]
            dest_path = parts[2]

            if source_prefix:
                try:
                    rel_path = os.path.relpath(src_path, source_prefix)
                except ValueError:
                    rel_path = os.path.basename(src_path)
            else:
                rel_path = os.path.basename(src_path)

            ext = Path(src_path).suffix.lower()
            if md is None and ext not in FALLBACK_EXTENSIONS:
                try:
                    md = load_markitdown(required=True)
                except Exception:
                    print(f"BEGIN\t{rel_path}", file=sys.stderr, flush=True)
                    print(f"END\tfail\t{rel_path}\t0", file=sys.stderr, flush=True)
                    sys.exit(1)

            print(f"BEGIN\t{rel_path}", file=sys.stderr, flush=True)

            start_s = time.time()

            try:
                if not os.path.exists(src_path):
                    print(
                        f"END\tfail\t{rel_path}\t{int(time.time() - start_s)}",
                        file=sys.stderr, flush=True,
                    )
                    continue

                pdf_pages = convert_pdf_pages(md, src_path)
                if pdf_pages:
                    write_split_pages(
                        dest_path,
                        extract_title(src_path),
                        pdf_pages,
                        rel_path,
                        "markitdown",
                        "pdf",
                        "markitdown_pdf_page_split",
                    )
                    print(
                        f"END\tok\t{rel_path}\t{int(time.time() - start_s)}",
                        file=sys.stderr, flush=True,
                    )
                    continue

                text = convert_file(md, src_path)
                write_markdown(src_path, dest_path, text, rel_path)
                print(
                    f"END\tok\t{rel_path}\t{int(time.time() - start_s)}",
                    file=sys.stderr, flush=True,
                )

            except Exception:
                dur = int(time.time() - start_s)
                print(
                    f"END\tfail\t{rel_path}\t{dur}",
                    file=sys.stderr, flush=True,
                )

    sys.exit(0)


def main():
    parser = argparse.ArgumentParser(
        description="MarkItDown: Convert supported local files to Markdown"
    )
    parser.add_argument(
        "--check-markitdown",
        action="store_true",
        help="Exit 0 only when the MarkItDown package can be imported",
    )
    parser.add_argument(
        "--batch",
        action="store_true",
        help="Process multiple files from stdin (single engine instance)",
    )
    parser.add_argument("input", nargs="?", help="Input file (ignored with --batch)")
    parser.add_argument("output", nargs="?", help="Output Markdown file (ignored with --batch)")

    args = parser.parse_args()

    if args.check_markitdown:
        try:
            load_markitdown(required=True)
        except Exception:
            sys.exit(1)
        sys.exit(0)

    if args.batch:
        batch_main()
    else:
        if not args.input or not args.output:
            parser.error("INPUT and OUTPUT required in single-file mode")
        single_main(args.input, args.output)


if __name__ == "__main__":
    main()
