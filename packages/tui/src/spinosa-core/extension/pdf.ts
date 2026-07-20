import { readFile } from "node:fs/promises"
import {
  pdfPageCount as jsPdfPageCount,
  pdfPageHasExtractableText as jsPdfPageHasText,
  pdfTextPagesMeetThreshold as jsPdfTextPagesThreshold,
  withPdfDocument,
  pdfDocumentTextPagesMeetThreshold,
} from "./pdf-js"

export { pdfExtractAllText, pdfExtractPageTexts, pdfRenderPageToPng } from "./pdf-js"

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

  let header: Buffer
  try {
    header = (await readFile(pdfPath)).subarray(0, 262144)
  } catch {
    return false
  }

  if (searchBuffer(header, Buffer.from("/Encrypt"), 0, header.length)) return false

  const quickLen = Math.min(header.length, 262144)
  if (
    searchBuffer(header, Buffer.from("/Font"), 0, quickLen) ||
    searchBuffer(header, Buffer.from("/CIDFont"), 0, quickLen)
  ) return true
  try {
    return await withPdfDocument(pdfPath, (doc) => pdfDocumentTextPagesMeetThreshold(doc))
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
