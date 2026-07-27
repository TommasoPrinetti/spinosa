import { readFile } from "node:fs/promises"
import {
  pdfPageCount as jsPdfPageCount,
  pdfPageHasExtractableText as jsPdfPageHasText,
  pdfTextPagesMeetThreshold as jsPdfTextPagesThreshold,
  withPdfDocument,
  pdfDocumentTextPagesMeetThreshold,
} from "./pdf-js"

export { pdfExtractAllText, pdfExtractPageTexts, pdfRenderPageToPng } from "./pdf-js"

const QUICK_SCAN_LEN = 262144
const PDFJS_TIMEOUT_MS = 5000

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)
    p.then(
      (v) => { clearTimeout(t); resolve(v) },
      (e) => { clearTimeout(t); reject(e) },
    )
  })
}

export async function pdfPageCount(pdfPath: string): Promise<number> {
  try {
    return await jsPdfPageCount(pdfPath)
  } catch {
    return 1
  }
}

export async function pdfPageHasExtractableText(
  pdfPath: string,
  page: number,
): Promise<boolean> {
  try {
    return await jsPdfPageHasText(pdfPath, page)
  } catch {
    return false
  }
}

export async function pdfTextPagesMeetThreshold(
  pdfPath: string,
  pageCount: number,
): Promise<boolean> {
  try {
    return await jsPdfTextPagesThreshold(pdfPath, pageCount)
  } catch {
    return false
  }
}

export async function isTextBasedPdf(pdfPath: string): Promise<boolean> {
  if (fileExt(pdfPath) !== "pdf") return false

  let data: Buffer
  try {
    data = await readFile(pdfPath)
  } catch {
    return false
  }

  if (searchBuffer(data, Buffer.from("/Encrypt"), 0, data.length)) return false

  if (
    searchBuffer(data, Buffer.from("/Font"), 0, QUICK_SCAN_LEN) ||
    searchBuffer(data, Buffer.from("/CIDFont"), 0, QUICK_SCAN_LEN)
  ) return true

  if (
    searchBuffer(data, Buffer.from("/Font"), QUICK_SCAN_LEN, data.length) ||
    searchBuffer(data, Buffer.from("/CIDFont"), QUICK_SCAN_LEN, data.length)
  ) return true

  try {
    return await withTimeout(
      withPdfDocument(pdfPath, (doc) => pdfDocumentTextPagesMeetThreshold(doc)),
      PDFJS_TIMEOUT_MS,
    )
  } catch {
    return false
  }
}

function fileExt(filePath: string): string {
  const i = filePath.lastIndexOf(".")
  return i >= 0 ? filePath.slice(i + 1) : ""
}

function searchBuffer(haystack: Buffer, needle: Buffer, start: number, end: number): boolean {
  return haystack.subarray(start, end).indexOf(needle) !== -1
}
