#!/usr/bin/env python3
"""
markitdown-cli.py — MarkItDown wrapper for Pilosa Framework

Converts Office docs, EPUB, HTML, ZIP, Outlook MSG, and text-based PDFs
to Markdown using the MarkItDown library.
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

Input: .docx, .pptx, .xlsx, .xls, .epub, .html, .msg, .zip, text-based .pdf
Output: Markdown file
"""

import sys
import os
import argparse
import time
import traceback
from pathlib import Path


EXTENSIONS = {
    ".docx", ".pptx", ".xlsx", ".xls",
    ".epub", ".html", ".htm", ".msg", ".zip",
    ".pdf", ".json", ".csv", ".xml",
}


def extract_title(file_path: str) -> str:
    name = Path(file_path).stem
    name = name.replace("_", " ").replace("-", " ")
    return name.title()


def convert_file(md, input_path: str) -> str:
    result = md.convert(input_path)
    if result and result.text_content and result.text_content.strip():
        return result.text_content.strip()
    return ""


def single_main(input_path: str, output_path: str):
    if not os.path.exists(input_path):
        print(f"  Input file not found: {input_path}", file=sys.stderr, flush=True)
        sys.exit(1)

    ext = Path(input_path).suffix.lower()
    if ext not in EXTENSIONS:
        print(f"  Unsupported file type: {input_path}", file=sys.stderr, flush=True)
        sys.exit(1)

    try:
        from markitdown import MarkItDown

        md = MarkItDown(enable_plugins=False)
        text = convert_file(md, input_path)

        if not text:
            title = extract_title(input_path)
            markdown = f"# {title}\n\n[No content extracted from file]\n"
        else:
            title = extract_title(input_path)
            markdown = f"# {title}\n\n{text}\n"

        os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(markdown)

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
        elif cmd == "FILE" and len(parts) >= 3:
            src_path = parts[1]
            dest_path = parts[2]

            if source_prefix:
                try:
                    rel_path = os.path.relpath(src_path, source_prefix)
                except ValueError:
                    rel_path = os.path.basename(src_path)
            else:
                rel_path = os.path.basename(src_path)

            if md is None:
                try:
                    from markitdown import MarkItDown
                    md = MarkItDown(enable_plugins=False)
                except Exception:
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

                text = convert_file(md, src_path)

                if not text:
                    print(
                        f"END\tfail\t{rel_path}\t{int(time.time() - start_s)}",
                        file=sys.stderr, flush=True,
                    )
                else:
                    title = extract_title(src_path)
                    markdown = f"# {title}\n\n{text}\n"
                    os.makedirs(os.path.dirname(dest_path) or ".", exist_ok=True)
                    with open(dest_path, "w", encoding="utf-8") as f:
                        f.write(markdown)
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
        description="MarkItDown: Convert Office docs, EPUB, HTML, and text-based PDFs to Markdown"
    )
    parser.add_argument(
        "--batch",
        action="store_true",
        help="Process multiple files from stdin (single engine instance)",
    )
    parser.add_argument("input", nargs="?", help="Input file (ignored with --batch)")
    parser.add_argument("output", nargs="?", help="Output Markdown file (ignored with --batch)")

    args = parser.parse_args()

    if args.batch:
        batch_main()
    else:
        if not args.input or not args.output:
            parser.error("INPUT and OUTPUT required in single-file mode")
        single_main(args.input, args.output)


if __name__ == "__main__":
    main()
