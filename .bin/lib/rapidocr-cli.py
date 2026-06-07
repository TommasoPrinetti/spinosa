#!/usr/bin/env python3
"""
rapidocr-cli.py — RapidOCR for Pilosa Framework

Converts PDFs and images to Markdown using PaddleOCR via ONNX Runtime.
Runs 100% locally with no cloud dependencies.

Usage:
    rapidocr-cli <input_file> <output.md>

Input: PDF or image file (jpg, png, gif, webp, heic, tiff, bmp)
Output: Markdown file with OCR-extracted text

The engine is initialized once per invocation. For multi-page PDFs,
each page is rendered to an image and OCR'd separately.
"""

import sys
import os
import argparse
import logging
from pathlib import Path

# Suppress RapidOCR and ONNX Runtime verbose logging
logging.getLogger("RapidOCR").setLevel(logging.WARNING)
logging.getLogger("onnxruntime").setLevel(logging.WARNING)

def log(msg: str) -> None:
    """Print status message to stderr."""
    print(f"  → {msg}", file=sys.stderr, flush=True)

def error(msg: str) -> None:
    """Print error message to stderr."""
    print(f"  ✗ {msg}", file=sys.stderr, flush=True)

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
    Returns list of (page_number, PIL.Image) tuples.
    """
    try:
        import pypdfium2 as pdfium
    except ImportError:
        error("pypdfium2 not installed. Cannot process PDFs.")
        return []

    try:
        pdf = pdfium.PdfDocument(pdf_path)
        images = []
        for i in range(len(pdf)):
            page = pdf[i]
            # Render at 2x scale for better OCR quality
            bitmap = page.render(scale=2.0)
            pil_image = bitmap.to_pil()
            images.append((i + 1, pil_image))
        pdf.close()
        return images
    except Exception as e:
        error(f"Failed to convert PDF to images: {e}")
        return []

def create_engine(lang: str = "en"):
    """Create and configure RapidOCR engine with English models."""
    from rapidocr import EngineType, LangDet, LangRec, ModelType, OCRVersion, RapidOCR

    engine = RapidOCR(
        params={
            "Det.engine_type": EngineType.ONNXRUNTIME,
            "Det.lang_type": LangDet.EN,
            "Det.model_type": ModelType.MOBILE,
            "Det.ocr_version": OCRVersion.PPOCRV4,
            "Rec.engine_type": EngineType.ONNXRUNTIME,
            "Rec.lang_type": LangRec.EN,
            "Rec.model_type": ModelType.MOBILE,
            "Rec.ocr_version": OCRVersion.PPOCRV4,
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
    except Exception as e:
        error(f"Failed to process image {image_path}: {e}")
        return ""

def ocr_pdf_file(engine, pdf_path: str) -> str:
    """Process a PDF file and return OCR text for all pages."""
    images = pdf_to_images(pdf_path)
    if not images:
        return ""

    all_text = []
    total_pages = len(images)
    for page_num, image in images:
        print(f"PROGRESS {page_num}/{total_pages}", file=sys.stderr, flush=True)
        text = ocr_pil_image(engine, image)
        if text.strip():
            all_text.append(f"## Page {page_num}\n\n{text}")

    return "\n\n---\n\n".join(all_text)

def extract_title(file_path: str) -> str:
    """Extract a clean title from the filename."""
    name = Path(file_path).stem
    # Replace underscores and hyphens with spaces
    name = name.replace("_", " ").replace("-", " ")
    # Title case
    return name.title()

def main():
    parser = argparse.ArgumentParser(
        description="RapidOCR: Convert PDFs and images to Markdown"
    )
    parser.add_argument("input", help="Input PDF or image file")
    parser.add_argument("output", help="Output Markdown file")

    args = parser.parse_args()

    input_path = args.input
    output_path = args.output

    if not os.path.exists(input_path):
        error(f"Input file not found: {input_path}")
        sys.exit(1)

    # Determine file type
    if is_pdf(input_path):
        file_type = "PDF"
    elif is_image(input_path):
        file_type = "Image"
    else:
        error(f"Unsupported file type: {input_path}")
        sys.exit(1)

    try:
        engine = create_engine()

        # Process file
        if is_pdf(input_path):
            ocr_text = ocr_pdf_file(engine, input_path)
        else:
            ocr_text = ocr_image_file(engine, input_path)

        if not ocr_text.strip():
            error(f"No text extracted from {input_path}")
            # Write empty markdown with title
            title = extract_title(input_path)
            markdown = f"# {title}\n\n[No text detected in {file_type.lower()}]\n"
        else:
            title = extract_title(input_path)
            markdown = f"# {title}\n\n{ocr_text}\n"

        # Write output
        os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(markdown)

        sys.exit(0)

    except ImportError as e:
        error(f"Missing required package: {e}")
        error("Please install: rapidocr onnxruntime pypdfium2")
        sys.exit(1)
    except Exception as e:
        error(f"OCR processing failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
