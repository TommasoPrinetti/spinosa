import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import * as path from "node:path"
import { tmpdir } from "node:os"
import { spawnSync } from "node:child_process"
import type { PaddleOcrService, PaddleOcrResult } from "ppu-paddle-ocr"
import { fileExt } from "../constants"
import { injectColdFrontmatter } from "./frontmatter"

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

function writeMarkdown(destFile: string, title: string, body: string, sourceRel: string, confidence?: number): void {
  mkdirSync(path.dirname(destFile), { recursive: true })
  const confidenceLine = typeof confidence === "number" ? `\nOCR confidence: ${confidence.toFixed(3)}\n` : ""
  writeFileSync(
    destFile,
    `# ${title}\n\nConverted from \`${sourceRel}\` with ppu-paddle-ocr.${confidenceLine}\n${body.trim() || "[No text detected]"}\n`,
    "utf-8",
  )
  injectColdFrontmatter(destFile)
}

function writeSplitPages(destFile: string, title: string, sourceRel: string, pages: Map<number, string>): void {
  const pageDir = pageDirFor(destFile)
  mkdirSync(pageDir, { recursive: true })
  const pageNumbers = [...pages.keys()].sort((a, b) => a - b)
  const zeroBased = pageNumbers[0] === 0
  const pageCount = pageNumbers.length

  for (const pageNumber of pageNumbers) {
    const displayPage = zeroBased ? pageNumber + 1 : pageNumber
    const pageFile = path.join(pageDir, `page-${String(displayPage).padStart(3, "0")}.md`)
    writeFileSync(
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
        pages.get(pageNumber)?.trim() || "[No text detected on this page]",
        "",
      ].join("\n"),
      "utf-8",
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

async function ocrImage(service: PaddleOcrService, file: PpuOcrFile): Promise<boolean> {
  const data = readFileSync(file.src)
  return ocrImageBuffer(service, data, file.dest, titleFromRel(file.rel), file.rel)
}

async function ocrImageBuffer(
  service: PaddleOcrService,
  data: Buffer,
  destFile: string,
  title: string,
  sourceRel: string,
): Promise<boolean> {
  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
  const result = await service.recognize(buffer) as PaddleOcrResult
  writeMarkdown(destFile, title, result.text, sourceRel, result.confidence)
  return true
}

function commandOnPath(name: string): string | undefined {
  if (typeof Bun !== "undefined" && Bun.which) {
    const found = Bun.which(name)
    if (found) return found
  }
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    const candidate = path.join(dir, name)
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

function sortPdfPages(a: string, b: string): number {
  const ai = Number(a.match(/-(\d+)\.png$/)?.[1] ?? 0)
  const bi = Number(b.match(/-(\d+)\.png$/)?.[1] ?? 0)
  return ai - bi
}

async function ocrPdf(service: PaddleOcrService, file: PpuOcrFile, onProgress?: (page: number, total: number) => void): Promise<boolean> {
  const pdftoppm = commandOnPath("pdftoppm")
  if (!pdftoppm) throw new Error("pdftoppm not found; cannot render scanned PDF pages for OCR")
  const tmp = mkdtempSync(path.join(tmpdir(), "spinosa-ppu-ocr-"))
  try {
    const prefix = path.join(tmp, "page")
    const render = spawnSync(pdftoppm, ["-png", "-r", "180", file.src, prefix], {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 300_000,
    })
    if (render.status !== 0) throw new Error((render.stderr || render.stdout || "").toString().trim() || `pdftoppm exited ${render.status}`)
    const pageFiles = readdirSync(tmp).filter((f) => f.endsWith(".png")).sort(sortPdfPages)
    if (pageFiles.length === 0) throw new Error("pdftoppm rendered no pages")

    const pages = new Map<number, string>()
    for (let i = 0; i < pageFiles.length; i++) {
      const page = i + 1
      const pagePath = path.join(tmp, pageFiles[i]!)
      const data = readFileSync(pagePath)
      const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
      const result = await service.recognize(buffer) as PaddleOcrResult
      pages.set(page, result.text)
      onProgress?.(page, pageFiles.length)
    }
    writeSplitPages(file.dest, titleFromRel(file.rel), file.rel, pages)
    return true
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

export async function runPpuOcrBatch(
  files: PpuOcrFile[],
  options?: {
    onProgress?: (current: number, total: number, relPath: string) => void
    onPageProgress?: (current: number, total: number, relPath: string, page: string) => void
    onLog?: (line: string) => void
  },
): Promise<PpuOcrBatchResult> {
  let converted = 0
  let skipped = 0
  let service: PaddleOcrService
  try {
    service = await ppuService(options?.onLog)
  } catch (err) {
    options?.onLog?.(`PPU PaddleOCR engine initialization failed: ${err instanceof Error ? err.message : String(err)} — skipping all ${files.length} file(s)`)
    skipped = files.length
    return { converted: 0, skipped }
  }
  const total = files.length

  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!
      options?.onLog?.(`  ${file.rel} → OCR ...`)
      try {
        const ext = fileExt(file.src)
        const ok = ext === "pdf"
          ? await ocrPdf(service, file, (page, pageTotal) => options?.onPageProgress?.(i + 1, total, file.rel, `${page}/${pageTotal}`))
          : await ocrImage(service, file)
        if (ok) {
          converted++
          injectColdFrontmatter(file.dest)
          injectPageDirFrontmatter(file.dest)
        } else {
          skipped++
        }
      } catch (err) {
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
    await disposePpuOcr()
  }
}
