import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs"
import * as path from "node:path"
import type { PaddleOcrService, PaddleOcrResult } from "ppu-paddle-ocr"
import { fileExt } from "../constants"
import { isSpinosaCancellationError, throwIfSpinosaCancelled } from "./cancellation"
import { injectColdFrontmatter } from "./frontmatter"
import { pdfRenderDocumentPageToPng, withPdfDocument } from "../extension/pdf-js"
import stripAnsi from "strip-ansi"
import { writeTextAtomic, writeTextAtomicSafe } from "../utils/fs"

// Bound a single OCR page so a pathological image/PDF cannot hang the whole
// OCR phase (and the UI wave) indefinitely.
const OCR_PAGE_TIMEOUT_MS = 60_000
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    p.then(
      (v) => { clearTimeout(t); resolve(v) },
      (e) => { clearTimeout(t); reject(e) },
    )
  })
}

export interface PpuOcrFile {
  src: string
  rel: string
  dest: string
}

export interface PpuOcrBatchResult {
  converted: number
  skipped: number
}

let servicePromise: Promise<PaddleOcrService> | undefined
let service: PaddleOcrService | undefined
let activeBatches = 0

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const JPEG_SOI = Buffer.from([0xff, 0xd8])
const JPEG_EOI = Buffer.from([0xff, 0xd9])
const GIF87A = Buffer.from("GIF87a", "ascii")
const GIF89A = Buffer.from("GIF89a", "ascii")
const WEBP_RIFF = Buffer.from("RIFF", "ascii")
const WEBP_TAG = Buffer.from("WEBP", "ascii")
const BMP_SIGNATURE = Buffer.from("BM", "ascii")
const SVG_TAG = /<svg[\s>]/i
const HEIF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "mif1", "msf1"])

export async function disposePpuOcr(): Promise<void> {
  if (service) {
    await service.destroy()
    service = undefined
    servicePromise = undefined
  }
}

function titleFromRel(relPath: string): string {
  const stem = path.basename(relPath, path.extname(relPath))
  return stem.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim() || stem
}

function pageDirFor(destFile: string): string {
  return destFile.endsWith(".md") ? destFile.slice(0, -3) : `${destFile}_pages`
}

function cleanOcrBody(body: string): string {
  let cleaned = stripAnsi(body).trim()
  cleaned = cleaned.replace(/!\[.*?\]\(data:image\/[^)]+\)/g, "")
  cleaned = cleaned.replace(/!\[\]\(\)/g, "")
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n")
  return cleaned || "[No text detected]"
}

function writeMarkdown(destFile: string, title: string, body: string, sourceRel: string, confidence?: number): void {
  mkdirSync(path.dirname(destFile), { recursive: true })
  writeTextAtomicSafe(
    destFile,
    `# ${title}\n\n${cleanOcrBody(body)}\n`,
  )
  injectColdFrontmatter(destFile)
}

function writeSplitPages(destFile: string, title: string, sourceRel: string, pages: Map<number, string>): void {
  const pageDir = pageDirFor(destFile)
  if (existsSync(pageDir)) rmSync(pageDir, { recursive: true, force: true })
  mkdirSync(pageDir, { recursive: true })
  const pageNumbers = [...pages.keys()].sort((a, b) => a - b)
  const zeroBased = pageNumbers[0] === 0
  const pageCount = pageNumbers.length

  for (const pageNumber of pageNumbers) {
    const displayPage = zeroBased ? pageNumber + 1 : pageNumber
    const pageFile = path.join(pageDir, `page-${String(displayPage).padStart(3, "0")}.md`)
    writeTextAtomicSafe(
      pageFile,
      [
        "---",
        `source_document: "${path.basename(sourceRel).replace(/"/g, '\\"')}"`,
        `page: ${displayPage}`,
        `page_count: ${pageCount}`,
        "---",
        "",
        `# ${title} - Page ${displayPage}`,
        "",
        cleanOcrBody(pages.get(pageNumber) || "") || "[No text detected on this page]",
        "",
      ].join("\n"),
    )
    injectColdFrontmatter(pageFile)
  }

  writeMarkdown(
    destFile,
    title,
    pageNumbers.map((pageNumber) => {
      const displayPage = zeroBased ? pageNumber + 1 : pageNumber
      return `- [Page ${displayPage}](${path.basename(pageDir)}/page-${String(displayPage).padStart(3, "0")}.md)`
    }).join("\n"),
    sourceRel,
  )
}

function injectPageDirFrontmatter(destFile: string): void {
  const pageDir = pageDirFor(destFile)
  if (!existsSync(pageDir)) return
  for (const file of readdirSync(pageDir)) {
    if (file.startsWith("page-") && file.endsWith(".md")) {
      injectColdFrontmatter(path.join(pageDir, file))
    }
  }
}

async function ppuService(onLog?: (line: string) => void): Promise<PaddleOcrService> {
  if (!servicePromise) {
    servicePromise = (async () => {
      onLog?.("PPU PaddleOCR: loading models...")
      const needsPolyfill = typeof (globalThis as Record<string, unknown>).document === "undefined"
      try {
        if (needsPolyfill) {
          ;(globalThis as Record<string, unknown>).document = {
            currentScript: null,
            createElement: () => ({}),
            createDocumentFragment: () => ({}),
            documentElement: { style: {} },
            body: { appendChild: () => {}, removeChild: () => {} },
            addEventListener: () => {},
            removeEventListener: () => {},
            querySelector: () => null,
            querySelectorAll: () => [],
            cookie: "",
            title: "",
          } as Record<string, unknown>
        }
        onLog?.("PPU PaddleOCR: step 1 - dynamic import...")
        const { PaddleOcrService: OcrService } = await import("ppu-paddle-ocr")
        if (needsPolyfill) delete (globalThis as Record<string, unknown>).document
        onLog?.("PPU PaddleOCR: step 2 - import OK, constructing...")
        const instance = new OcrService({ processing: { engine: "canvas-native" } })
        onLog?.("PPU PaddleOCR: step 3 - constructed, initializing...")
        await instance.initialize()
        onLog?.("PPU PaddleOCR: step 4 - ready")
        service = instance
        return instance
      } catch (err) {
        if (needsPolyfill) delete (globalThis as Record<string, unknown>).document
        onLog?.(`PPU PaddleOCR: FAILED at ${err instanceof Error ? err.name : "unknown"} — ${err instanceof Error ? err.message : String(err)}`)
        servicePromise = undefined
        throw err
      }
    })()
  }
  return servicePromise
}

async function ocrImage(service: PaddleOcrService, file: PpuOcrFile, shouldAbort?: () => boolean): Promise<boolean> {
  const data = readFileSync(file.src)
  const ext = fileExt(file.src)
  const validationError = validateOcrImageInput(data, ext)
  if (validationError) throw new Error(`invalid OCR image input: ${validationError}`)
  return ocrImageBuffer(service, data, file.dest, titleFromRel(file.rel), file.rel, shouldAbort)
}

async function ocrImageBuffer(
  service: PaddleOcrService,
  data: Buffer,
  destFile: string,
  title: string,
  sourceRel: string,
  shouldAbort?: () => boolean,
): Promise<boolean> {
  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
  const result = await withTimeout(service.recognize(buffer), OCR_PAGE_TIMEOUT_MS, "OCR page") as PaddleOcrResult
  throwIfSpinosaCancelled(shouldAbort)
  writeMarkdown(destFile, title, result.text, sourceRel, result.confidence)
  return true
}

function validateOcrImageInput(data: Buffer, ext: string): string | null {
  if (data.length === 0) return "file is empty"

  switch (ext.toLowerCase()) {
    case "png":
      return validatePng(data)
    case "jpg":
    case "jpeg":
      return validateJpeg(data)
    case "gif":
      return validateGif(data)
    case "webp":
      return validateWebp(data)
    case "bmp":
      return validateBmp(data)
    case "svg":
      return validateSvg(data)
    case "tif":
    case "tiff":
      return validateTiff(data)
    case "heic":
    case "heif":
      return validateHeif(data)
    default:
      return null
  }
}

function validatePng(data: Buffer): string | null {
  if (data.length < 33) return "truncated png"
  if (!data.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return "png signature mismatch"
  const firstChunkLength = data.readUInt32BE(8)
  const firstChunkType = data.subarray(12, 16).toString("ascii")
  if (firstChunkType !== "IHDR") return "missing png IHDR chunk"
  if (firstChunkLength !== 13) return "invalid png IHDR length"
  const width = data.readUInt32BE(16)
  const height = data.readUInt32BE(20)
  if (width === 0 || height === 0) return "invalid png dimensions"
  if (!data.includes(Buffer.from("IEND", "ascii"))) return "missing png IEND chunk"
  return null
}

function validateJpeg(data: Buffer): string | null {
  if (data.length < 4) return "truncated jpeg"
  if (!data.subarray(0, JPEG_SOI.length).equals(JPEG_SOI)) return "jpeg SOI marker missing"
  if (!data.subarray(data.length - JPEG_EOI.length).equals(JPEG_EOI)) return "jpeg EOI marker missing"
  return null
}

function validateGif(data: Buffer): string | null {
  if (data.length < 14) return "truncated gif"
  const header = data.subarray(0, 6)
  if (!header.equals(GIF87A) && !header.equals(GIF89A)) return "gif header mismatch"
  if (data[data.length - 1] !== 0x3b) return "gif trailer missing"
  return null
}

function validateWebp(data: Buffer): string | null {
  if (data.length < 16) return "truncated webp"
  if (!data.subarray(0, 4).equals(WEBP_RIFF)) return "webp RIFF header missing"
  if (!data.subarray(8, 12).equals(WEBP_TAG)) return "webp tag missing"
  const declaredSize = data.readUInt32LE(4) + 8
  if (declaredSize > data.length) return "webp size exceeds file length"
  return null
}

function validateBmp(data: Buffer): string | null {
  if (data.length < 26) return "truncated bmp"
  if (!data.subarray(0, 2).equals(BMP_SIGNATURE)) return "bmp signature mismatch"
  const declaredSize = data.readUInt32LE(2)
  if (declaredSize > data.length) return "bmp size exceeds file length"
  const dibHeaderSize = data.readUInt32LE(14)
  if (dibHeaderSize < 12) return "invalid bmp DIB header"
  return null
}

function validateSvg(data: Buffer): string | null {
  const text = data.toString("utf-8", 0, Math.min(data.length, 4096)).trimStart()
  if (!text) return "empty svg"
  if (!text.startsWith("<") && !text.startsWith("<?xml")) return "svg does not start with markup"
  if (!SVG_TAG.test(text)) return "svg tag missing"
  return null
}

function validateTiff(data: Buffer): string | null {
  if (data.length < 8) return "truncated tiff"
  const byteOrder = data.subarray(0, 2).toString("ascii")
  const littleEndian = byteOrder === "II"
  const bigEndian = byteOrder === "MM"
  if (!littleEndian && !bigEndian) return "tiff byte order marker missing"
  const readUInt16 = littleEndian ? Buffer.prototype.readUInt16LE : Buffer.prototype.readUInt16BE
  const readUInt32 = littleEndian ? Buffer.prototype.readUInt32LE : Buffer.prototype.readUInt32BE
  const magic = readUInt16.call(data, 2)
  if (magic !== 42 && magic !== 43) return "tiff magic number mismatch"
  const firstIfdOffset = readUInt32.call(data, 4)
  if (firstIfdOffset >= data.length) return "tiff first IFD offset out of range"
  return null
}

function validateHeif(data: Buffer): string | null {
  if (data.length < 12) return "truncated heif"
  const boxSize = data.readUInt32BE(0)
  const boxType = data.subarray(4, 8).toString("ascii")
  if (boxType !== "ftyp") return "heif ftyp box missing"
  if (boxSize > data.length) return "heif ftyp box exceeds file length"
  const majorBrand = data.subarray(8, 12).toString("ascii")
  if (!HEIF_BRANDS.has(majorBrand)) return `unsupported heif brand ${majorBrand}`
  return null
}

async function ocrPdf(
  service: PaddleOcrService,
  file: PpuOcrFile,
  onProgress?: (page: number, total: number) => void,
  shouldAbort?: () => boolean,
): Promise<boolean> {
  const pages = await withPdfDocument(file.src, async (doc) => {
    const output = new Map<number, string>()
    for (let page = 1; page <= doc.numPages; page++) {
      throwIfSpinosaCancelled(shouldAbort)
      const pngBuffer = await pdfRenderDocumentPageToPng(doc, page, 180)
      throwIfSpinosaCancelled(shouldAbort)
      const buffer = pngBuffer.buffer.slice(pngBuffer.byteOffset, pngBuffer.byteOffset + pngBuffer.byteLength) as ArrayBuffer
      const result = await withTimeout(service.recognize(buffer), OCR_PAGE_TIMEOUT_MS, `OCR page ${page}`) as PaddleOcrResult
      throwIfSpinosaCancelled(shouldAbort)
      output.set(page, result.text)
      onProgress?.(page, doc.numPages)
    }
    return output
  })
  if (pages.size === 0) throw new Error("PDF rendered no pages")
  writeSplitPages(file.dest, titleFromRel(file.rel), file.rel, pages)
  return true
}

export async function runPpuOcrBatch(
  files: PpuOcrFile[],
  options?: {
    onProgress?: (current: number, total: number, relPath: string) => void
    onPageProgress?: (current: number, total: number, relPath: string, page: string) => void
    onLog?: (line: string) => void
    shouldAbort?: () => boolean
  },
): Promise<PpuOcrBatchResult> {
  let converted = 0
  let skipped = 0
  let service: PaddleOcrService
  try {
    throwIfSpinosaCancelled(options?.shouldAbort)
    service = await ppuService(options?.onLog)
  } catch (err) {
    if (isSpinosaCancellationError(err)) throw err
    options?.onLog?.(`PPU PaddleOCR engine initialization failed: ${err instanceof Error ? err.message : String(err)} — skipping all ${files.length} file(s)`)
    skipped = files.length
    return { converted: 0, skipped }
  }
  const total = files.length
  activeBatches++

  try {
    for (let i = 0; i < files.length; i++) {
      throwIfSpinosaCancelled(options?.shouldAbort)
      const file = files[i]!
      options?.onLog?.(`  ${file.rel} → OCR ...`)
      try {
        const ext = fileExt(file.src)
        const ok = ext === "pdf"
          ? await ocrPdf(service, file, (page, pageTotal) => options?.onPageProgress?.(i + 1, total, file.rel, `${page}/${pageTotal}`), options?.shouldAbort)
          : await ocrImage(service, file, options?.shouldAbort)
        if (ok) {
          converted++
          injectColdFrontmatter(file.dest)
          injectPageDirFrontmatter(file.dest)
        } else {
          skipped++
        }
      } catch (err) {
        if (isSpinosaCancellationError(err)) throw err
        skipped++
        options?.onLog?.(`PPU PaddleOCR failed: ${file.rel} - ${err}`)
      }
      options?.onProgress?.(i + 1, total, file.rel)
      const { promise, resolve } = Promise.withResolvers<void>()
      setTimeout(resolve, 0)
      await promise
    }

    return { converted, skipped }
  } finally {
    activeBatches--
    if (activeBatches === 0) await disposePpuOcr()
  }
}
