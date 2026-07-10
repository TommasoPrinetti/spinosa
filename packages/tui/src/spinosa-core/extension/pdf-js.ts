import { readFileSync } from "node:fs"
import { getDocument, type PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs"
import { createCanvas } from "@napi-rs/canvas"

async function getDoc(pdfPath: string): Promise<PDFDocumentProxy> {
  const data = readFileSync(pdfPath)
  return getDocument({ data }).promise
}

export async function withPdfDocument<T>(pdfPath: string, fn: (doc: PDFDocumentProxy) => Promise<T>): Promise<T> {
  const doc = await getDoc(pdfPath)
  try {
    return await fn(doc)
  } finally {
    await doc.destroy().catch(() => {})
  }
}

export async function pdfPageCount(pdfPath: string): Promise<number> {
  return withPdfDocument(pdfPath, (doc) => Promise.resolve(doc.numPages))
}

export async function pdfTextContent(pdfPath: string, page: number): Promise<string> {
  return withPdfDocument(pdfPath, (doc) => pdfDocumentTextContent(doc, page))
}

export async function pdfDocumentTextContent(doc: PDFDocumentProxy, page: number): Promise<string> {
  const pg = await doc.getPage(page)
  const content = await pg.getTextContent()
  return content.items.map((item) => ("str" in item ? item.str : "")).join(" ")
}
export async function pdfPageHasExtractableText(pdfPath: string, page: number): Promise<boolean> {
  return withPdfDocument(pdfPath, (doc) => pdfDocumentPageHasExtractableText(doc, page))
}

export async function pdfDocumentPageHasExtractableText(doc: PDFDocumentProxy, page: number): Promise<boolean> {
  const text = await pdfDocumentTextContent(doc, page)
  return text.replace(/\s/g, "").length > 0
}

export async function pdfTextPagesMeetThreshold(pdfPath: string, pageCount: number): Promise<boolean> {
  return withPdfDocument(pdfPath, (doc) => pdfDocumentTextPagesMeetThreshold(doc, pageCount))
}

export async function pdfDocumentTextPagesMeetThreshold(doc: PDFDocumentProxy, pageCount = doc.numPages): Promise<boolean> {
  const pc = Math.max(1, Math.floor(pageCount))

  if (pc === 1) return pdfDocumentPageHasExtractableText(doc, 1)
  if (pc === 2) {
    const [a, b] = await Promise.all([
      pdfDocumentPageHasExtractableText(doc, 1),
      pdfDocumentPageHasExtractableText(doc, 2),
    ])
    return a && b
  }

  const mid = Math.floor((pc + 1) / 2)
  const last = pc
  const results = await Promise.all([
    pdfDocumentPageHasExtractableText(doc, 1),
    pdfDocumentPageHasExtractableText(doc, mid),
    pdfDocumentPageHasExtractableText(doc, last),
  ])
  const hits = results.filter(Boolean).length
  return hits >= 2
}
export async function pdfRenderPageToPng(pdfPath: string, pageNumber: number, dpi = 180): Promise<Buffer> {
  return withPdfDocument(pdfPath, (doc) => pdfRenderDocumentPageToPng(doc, pageNumber, dpi))
}

export async function pdfRenderDocumentPageToPng(doc: PDFDocumentProxy, pageNumber: number, dpi = 180): Promise<Buffer> {
  const pg = await doc.getPage(pageNumber)
  const viewport = pg.getViewport({ scale: dpi / 72 })
  const canvas = createCanvas(viewport.width, viewport.height)
  const ctx = canvas.getContext("2d")
  await pg.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport }).promise
  return canvas.toBuffer("image/png")
}

export async function isTextBasedPdf(pdfPath: string): Promise<boolean> {
  const header = readFileSync(pdfPath)
  if (header.subarray(0, 5).toString() !== "%PDF-") return false

  if (searchBuffer(header, Buffer.from("/Encrypt"), 0, header.length)) return false

  const quickLen = Math.min(header.length, 262144)
  if (
    searchBuffer(header, Buffer.from("/Font"), 0, quickLen) ||
    searchBuffer(header, Buffer.from("/CIDFont"), 0, quickLen)
  ) return true

  if (
    searchBuffer(header, Buffer.from("/Font"), 0, header.length) ||
    searchBuffer(header, Buffer.from("/CIDFont"), 0, header.length)
  ) return true

  return withPdfDocument(pdfPath, (doc) => pdfDocumentTextPagesMeetThreshold(doc))
}

export async function pdfExtractAllText(pdfPath: string): Promise<string> {
  return withPdfDocument(pdfPath, async (doc) => {
    const pages: string[] = []
    for (let i = 1; i <= doc.numPages; i++) {
      try {
        const pg = await doc.getPage(i)
        const content = await pg.getTextContent()
        pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "))
      } catch {
        continue
      }
    }
    return pages.join("\n\n")
  })
}

export async function pdfExtractPageTexts(pdfPath: string): Promise<{ page: number; text: string }[]> {
  return withPdfDocument(pdfPath, async (doc) => {
    const result: { page: number; text: string }[] = []
    for (let i = 1; i <= doc.numPages; i++) {
      try {
        const pg = await doc.getPage(i)
        const content = await pg.getTextContent()
        result.push({
          page: i,
          text: content.items.map((item) => ("str" in item ? item.str : "")).join(" "),
        })
      } catch {
        continue
      }
    }
    return result
  })
}

function searchBuffer(haystack: Buffer, needle: Buffer, start: number, end: number): boolean {
  return haystack.subarray(start, end).indexOf(needle) !== -1
}
