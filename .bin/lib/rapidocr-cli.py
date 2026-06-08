#!/usr/bin/env python3
"""
rapidocr-cli.py — RapidOCR for Pilosa Framework

Converts PDFs and images to Markdown using PaddleOCR via ONNX Runtime.
Runs 100% locally with no cloud dependencies.

Usage (single file):
    rapidocr-cli <input_file> <output.md>

Usage (batch mode — single engine instance for many files):
    rapidocr-cli --batch

    stdin protocol (tab-separated lines):
        SOURCE\t/path/to/source/root
        FILE\t/path/to/src.pdf\t/path/to/dest.md
        FILE\t/path/to/src.jpg\t/path/to/dest.md

    stderr protocol (tab-separated lines):
        BEGIN\trel_path
        PROGRESS\tpage_num/total_pages
        END\tok\trel_path\tduration_s
        END\tfail\trel_path\tduration_s

Input: PDF or image file (jpg, png, gif, webp, heic, tiff, bmp)
Output: Markdown file with OCR-extracted text
"""

import sys
import os
import argparse
import logging
import time
from pathlib import Path

# Suppress RapidOCR and ONNX Runtime verbose logging
logging.getLogger("RapidOCR").setLevel(logging.WARNING)
logging.getLogger("onnxruntime").setLevel(logging.WARNING)

def is_pdf(path: str) -> bool:
    """Check if file is a PDF by extension."""
    return Path(path).suffix.lower() == '.pdf'

def is_image(path: str) -> bool:
    """Check if file is an image by extension."""
    image_exts = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif',
                  '.tif', '.tiff', '.bmp', '.svg'}
    return Path(path).suffix.lower() in image_exts

def pdf_to_images(pdf_path: str) -> list:
    """
    Convert PDF pages to PIL Images using pypdfium2.
    Returns list of (page_number, PIL.Image) tuples, or empty list on failure.
    Does not print errors (batch mode compatible).
    """
    try:
        import pypdfium2 as pdfium
    except ImportError:
        return []

    try:
        pdf = pdfium.PdfDocument(pdf_path)
        images = []
        for i in range(len(pdf)):
            page = pdf[i]
            bitmap = page.render(scale=2.0)
            pil_image = bitmap.to_pil()
            images.append((i + 1, pil_image))
        pdf.close()
        return images
    except Exception:
        return []

def pdf_page_renderer(pdf_path: str):
    """
    Generator: renders PDF pages one at a time via pypdfium2.
    Yields (page_number, total_pages, PIL.Image) tuples.
    Emits nothing to stderr (batch mode compatible).
    """
    try:
        import pypdfium2 as pdfium
    except ImportError:
        return

    try:
        pdf = pdfium.PdfDocument(pdf_path)
        total = len(pdf)
        for i in range(total):
            page = pdf[i]
            bitmap = page.render(scale=2.0)
            pil_image = bitmap.to_pil()
            yield (i + 1, total, pil_image)
        pdf.close()
    except Exception:
        return

def create_engine():
    """Create and configure RapidOCR engine with English BASE models."""
    from rapidocr import EngineType, LangDet, LangRec, ModelType, OCRVersion, RapidOCR

    engine = RapidOCR(
        params={
            "Det.engine_type": EngineType.ONNXRUNTIME,
            "Det.model_type": ModelType.MOBILE,
            "Det.ocr_version": OCRVersion.PPOCRV4,
            "Rec.engine_type": EngineType.ONNXRUNTIME,
            "Rec.lang_type": LangRec.EN,
            "Rec.model_type": ModelType.MOBILE,
            "Rec.ocr_version": OCRVersion.PPOCRV5,
        }
    )
    return engine

def ocr_pil_image(engine, image) -> str:
    """
    Run RapidOCR on a PIL Image.
    Returns extracted text as string.
    """
    result = engine(image)

    if result and result.txts:
        return "\n\n".join(result.txts)
    return ""

def ocr_image_file(engine, image_path: str) -> str:
    """Process a single image file and return OCR text."""
    try:
        from PIL import Image
        image = Image.open(image_path).convert("RGB")
        return ocr_pil_image(engine, image)
    except Exception:
        return ""

def extract_title(file_path: str) -> str:
    """Extract a clean title from the filename."""
    name = Path(file_path).stem
    name = name.replace("_", " ").replace("-", " ")
    return name.title()

def single_main(input_path: str, output_path: str):
    """Process a single file (original behaviour)."""
    if not os.path.exists(input_path):
        print(f"  ✗ Input file not found: {input_path}", file=sys.stderr, flush=True)
        sys.exit(1)

    if not is_pdf(input_path) and not is_image(input_path):
        print(f"  ✗ Unsupported file type: {input_path}", file=sys.stderr, flush=True)
        sys.exit(1)

    file_type = "PDF" if is_pdf(input_path) else "Image"

    try:
        engine = create_engine()

        if is_pdf(input_path):
            images = pdf_to_images(input_path)
            if not images:
                ocr_text = ""
            else:
                all_text = []
                total_pages = len(images)
                for page_num, image in images:
                    print(f"PROGRESS {page_num}/{total_pages}", file=sys.stderr, flush=True)
                    text = ocr_pil_image(engine, image)
                    if text.strip():
                        all_text.append(f"## Page {page_num}\n\n{text}")
                ocr_text = "\n\n---\n\n".join(all_text)
        else:
            ocr_text = ocr_image_file(engine, input_path)

        if not ocr_text.strip():
            print(f"  ✗ No text extracted from {input_path}", file=sys.stderr, flush=True)
            title = extract_title(input_path)
            markdown = f"# {title}\n\n[No text detected in {file_type.lower()}]\n"
        else:
            title = extract_title(input_path)
            markdown = f"# {title}\n\n{ocr_text}\n"

        os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(markdown)

        sys.exit(0)

    except ImportError as e:
        print(f"  ✗ Missing required package: {e}", file=sys.stderr, flush=True)
        print("  ✗ Please install: rapidocr onnxruntime pypdfium2", file=sys.stderr, flush=True)
        sys.exit(1)
    except Exception as e:
        print(f"  ✗ OCR processing failed: {e}", file=sys.stderr, flush=True)
        sys.exit(1)

def batch_main():
    """
    Process multiple files from stdin with a single engine instance.

    stdin protocol (tab-separated lines):
        SOURCE\t/path/to/source/root
        FILE\t/path/to/src.pdf\t/path/to/dest.md
        FILE\t/path/to/src.jpg\t/path/to/dest.md
        ...

    stderr protocol (tab-separated lines, no other output on stderr):
        BEGIN\trel_path
        PROGRESS\tpage_num/total_pages
        END\tok\trel_path\tduration_s
        END\tfail\trel_path\tduration_s
    """
    source_prefix = None
    engine = None

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        parts = line.split('\t')
        if len(parts) < 2:
            continue

        cmd = parts[0]

        if cmd == 'SOURCE':
            source_prefix = parts[1]
        elif cmd == 'FILE' and len(parts) >= 3:
            src_path = parts[1]
            dest_path = parts[2]

            if source_prefix:
                try:
                    rel_path = os.path.relpath(src_path, source_prefix)
                except ValueError:
                    rel_path = os.path.basename(src_path)
            else:
                rel_path = os.path.basename(src_path)

            if engine is None:
                try:
                    engine = create_engine()
                except Exception as e:
                    print(f"END\tfail\t{rel_path}\t0", file=sys.stderr, flush=True)
                    sys.exit(1)

            print(f"BEGIN\t{rel_path}", file=sys.stderr, flush=True)

            start_s = time.time()

            try:
                if not os.path.exists(src_path):
                    print(f"END\tfail\t{rel_path}\t{int(time.time() - start_s)}", file=sys.stderr, flush=True)
                    continue

                ocr_text = ""

                if is_pdf(src_path):
                    all_text = []
                    for page_num, total_pages, image in pdf_page_renderer(src_path):
                        print(f"PROGRESS\t{page_num}/{total_pages}", file=sys.stderr, flush=True)
                        text = ocr_pil_image(engine, image)
                        if text.strip():
                            all_text.append(f"## Page {page_num}\n\n{text}")
                    if all_text:
                        ocr_text = "\n\n---\n\n".join(all_text)
                    else:
                        ocr_text = ""
                elif is_image(src_path):
                    ocr_text = ocr_image_file(engine, src_path)
                else:
                    print(f"END\tfail\t{rel_path}\t{int(time.time() - start_s)}", file=sys.stderr, flush=True)
                    continue

                if not ocr_text.strip():
                    print(f"END\tfail\t{rel_path}\t{int(time.time() - start_s)}", file=sys.stderr, flush=True)
                else:
                    title = extract_title(src_path)
                    markdown = f"# {title}\n\n{ocr_text}\n"
                    os.makedirs(os.path.dirname(dest_path) or ".", exist_ok=True)
                    with open(dest_path, "w", encoding="utf-8") as f:
                        f.write(markdown)
                    print(f"END\tok\t{rel_path}\t{int(time.time() - start_s)}", file=sys.stderr, flush=True)

            except Exception:
                dur = int(time.time() - start_s)
                print(f"END\tfail\t{rel_path}\t{dur}", file=sys.stderr, flush=True)

    sys.exit(0)

def main():
    parser = argparse.ArgumentParser(
        description="RapidOCR: Convert PDFs and images to Markdown"
    )
    parser.add_argument("--batch", action="store_true",
                        help="Process multiple files from stdin (single engine instance)")
    parser.add_argument("input", nargs="?",
                        help="Input PDF or image file (ignored with --batch)")
    parser.add_argument("output", nargs="?",
                        help="Output Markdown file (ignored with --batch)")

    args = parser.parse_args()

    if args.batch:
        batch_main()
    else:
        if not args.input or not args.output:
            parser.error("INPUT and OUTPUT required in single-file mode")
        single_main(args.input, args.output)

if __name__ == "__main__":
    main()
