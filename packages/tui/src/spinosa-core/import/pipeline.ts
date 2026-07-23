import { existsSync, mkdirSync, appendFileSync, readFileSync, readdirSync, rmSync } from "node:fs"
import * as path from "node:path"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { MarkItDown } from "markitdown-ts"

import stripAnsi from "strip-ansi"
import { fileExt } from "../constants"
import {
  shouldSkipSourceFile,
  findSourceFiles,
  markdownRawRelPath,
  markitdownOutputRelPath,
  ocrOutputRelPath,
  safeRelPath,
  scanClassifySourceFile,
  importRouteForFile,
} from "../extension/classifier"
import { safeCopyAsync, writeTextAtomic, writeTextAtomicSafe } from "../utils/fs"
import { spinosaLogInfo } from "../utils/log"
import type { FileClass, ImportRoute } from "../extension/types"
import { injectColdFrontmatter, convertedOutputExists } from "./frontmatter"
import type { ImportBatchManager } from "./batch"
import { isSpinosaCancellationError, throwIfSpinosaCancelled } from "./cancellation"
import type { PpuOcrFile, PpuOcrBatchResult } from "./ppu-ocr"
import { runPpuOcrBatch } from "./ppu-ocr"
import { ProgressEmitter } from "../progress/progress"
import { ocrAvailable } from "../tools/detection"
import { pdfPageCount, pdfExtractPageTexts } from "../extension/pdf-js"

export interface CopyResult {
  copied: number
  skipped: number
  failed: number
  mdConverted: number
  mdSkipped: number
  mdFailed: number
  ocrConverted: number
  ocrSkipped: number
  ocrFailed: number
  totalCopied: number
  stillMissing: number
  recovered: number
  failedFileCount: number
  failedFilePaths: string[]
}

type CopyPhase = "all" | "direct" | "markitdown" | "ocr"

interface CopyOptions {
  markitdownChoice?: boolean
  ocrChoice?: boolean
  runPhase?: CopyPhase
  verifyAfter?: boolean
  batchManager?: ImportBatchManager
  overwrite?: boolean
  subfolder?: string
  onProgress?: (phase: string, current: number, total: number, relPath: string) => void
  onLog?: (line: string) => void
  onClassified?: (classified: { directFiles: ClassifiedEntry[]; markitdownFiles: ClassifiedEntry[]; ocrFiles: ClassifiedEntry[]; logsDir: string }) => void
  onPhaseChange?: (phase: string, message: string) => void
  shouldAbort?: () => boolean
}



export interface PhaseResult {
  converted: number
  skipped: number
  failed: number
  renamed: number
  recoverable: { src: string; dest: string }[]
}

// ── Single-pass scan & classify ──────────────────────────────────────────

interface ClassifiedEntry {
  src: string
  rel: string
  dest: string
}

export async function scanAndClassifySource(
  sourcePath: string,
  destDir: string,
  batchManager?: ImportBatchManager,
  subfolder?: string,
  shouldAbort?: () => boolean,
): Promise<{
  directFiles: ClassifiedEntry[]
  markitdownFiles: ClassifiedEntry[]
  ocrFiles: ClassifiedEntry[]
  logsDir: string
} | null> {
  const allFiles: string[] = []
  try {
    allFiles.push(...findSourceFiles(sourcePath, shouldAbort))
  } catch {
    return null
  }
  if (allFiles.length === 0) return null

  const entries: Array<{ filePath: string; relPath: string; ext: string; klass: FileClass }> = []
  for (const fp of allFiles) {
    throwIfSpinosaCancelled(shouldAbort)
    if (shouldSkipSourceFile(fp)) continue
    let rel = fp.replace(sourcePath, "").replace(/^\//, "")
    if (subfolder) rel = path.join(subfolder, rel)
    rel = safeRelPath(rel)
    const ext = fileExt(fp)
    entries.push({ filePath: fp, relPath: rel, ext, klass: await scanClassifySourceFile(fp) })
    throwIfSpinosaCancelled(shouldAbort)
  }

  // Log each file's classification for diagnostics
  for (const e of entries) {
    spinosaLogInfo("classify", `file=${e.relPath} ext=${e.ext} class=${e.klass}`)
  }
  // Log classification summary
  const markdown = entries.filter(e => e.klass === "markdown").length
  const native = entries.filter(e => e.klass === "native").length
  const md = entries.filter(e => e.klass === "markitdown").length
  const ocr = entries.filter(e => e.klass === "ocr_convertible").length
  const other = entries.filter(e => !["markdown", "native", "markitdown", "ocr_convertible"].includes(e.klass)).length
  spinosaLogInfo("classify", `summary: ${entries.length} total, ${native} native, ${markdown} markdown, ${md} markitdown, ${ocr} ocr_convertible, ${other} other`)

  const logsDir = path.resolve(destDir, "..", ".logs")
  mkdirSync(logsDir, { recursive: true })

  const directFiles: ClassifiedEntry[] = []
  const markitdownFiles: ClassifiedEntry[] = []
  const ocrFiles: ClassifiedEntry[] = []

  const filtered = (...klasses: FileClass[]) =>
    entries.filter(e => klasses.includes(e.klass) && isExtSelected(e.ext, batchManager))

  for (const e of filtered("markdown")) {
    directFiles.push({ src: e.filePath, rel: e.relPath, dest: path.join(destDir, markdownRawRelPath(e.relPath)) })
  }
  for (const e of filtered("native")) {
    directFiles.push({ src: e.filePath, rel: e.relPath, dest: path.join(destDir, e.relPath) })
  }
  for (const e of filtered("audio", "video")) {
    directFiles.push({ src: e.filePath, rel: e.relPath, dest: path.join(destDir, e.relPath) })
  }
  for (const e of filtered("binary_copyable")) {
    directFiles.push({ src: e.filePath, rel: e.relPath, dest: path.join(destDir, e.relPath) })
  }
  for (const e of filtered("markitdown")) {
    markitdownFiles.push({ src: e.filePath, rel: e.relPath, dest: path.join(destDir, markitdownOutputRelPath(e.relPath)) })
  }
  for (const e of filtered("ocr_convertible")) {
    ocrFiles.push({ src: e.filePath, rel: e.relPath, dest: path.join(destDir, ocrOutputRelPath(e.relPath)) })
  }

  return { directFiles, markitdownFiles, ocrFiles, logsDir }
}

// ── Phase runners (receive pre-classified file lists) ────────────────────

const DIRECT_COPY_CONCURRENCY = 8
const DIRECT_COPY_RETRY_DELAY_MS = 5_000
const DIRECT_COPY_MAX_RETRIES = 3

export async function processDirectCopy(
  files: ClassifiedEntry[],
  prog?: ProgressEmitter,
  onLog?: (msg: string) => void,
  overwrite?: boolean,
  shouldAbort?: () => boolean,
  onRetry?: (attempt: number, reason: string) => void,
  onRename?: (original: string, renamed: string) => void,
): Promise<PhaseResult> {
  let converted = 0; let skipped = 0; let failed = 0; let renamed = 0
  const recoverable: { src: string; dest: string }[] = []
  let completed = 0
  const total = files.length

  // Stable per-file sequence number so the progress numerator never exceeds
  // the total during parallel + retry rounds (it tracks the logical file,
  // not the per-attempt copy).
  const seqOf = new Map<ClassifiedEntry, number>()
  files.forEach((f, i) => seqOf.set(f, i))

  const tryCopy = async (entry: ClassifiedEntry, attempt: number, current: number): Promise<"copied" | "skipped" | "failed"> => {
    const { src, rel, dest } = entry
    return copyDirectRawFile(src, dest, rel, prog, onLog, current, total, overwrite, shouldAbort, (a, r) => onRetry?.(attempt || a, r), (o, rn) => { renamed++; onRename?.(o, rn) })
  }

  const handleResult = (entry: ClassifiedEntry, result: "copied" | "skipped" | "failed", bucket: ClassifiedEntry[]) => {
    if (result === "failed") {
      // A failed copy is not counted yet — it is still retrying. It only
      // counts as processed once it either succeeds or exhausts retries.
      bucket.push(entry)
      return
    }
    completed++
    // Count a file as processed only when it reaches a terminal success, so
    // the numerator reflects the amount of work done (and the % can reach
    // 100% once every file has been resolved one way or another).
    prog?.file("direct-progress", completed, total, entry.rel)
    if (result === "copied") {
      converted++
      if (entry.dest.endsWith(".md")) injectColdFrontmatter(entry.dest)
      recoverable.push({ src: entry.src, dest: entry.dest })
    } else { skipped++ }
  }

  // First pass: bounded-concurrency parallel fast attempts.
  const retryBucket: ClassifiedEntry[] = []
  const runChunk = async (chunk: ClassifiedEntry[]) => {
    await Promise.all(chunk.map(async (entry, idx) => {
      throwIfSpinosaCancelled(shouldAbort)
      const result = await tryCopy(entry, 0, (seqOf.get(entry) ?? idx) + 1)
      handleResult(entry, result, retryBucket)
    }))
  }

  for (let i = 0; i < files.length; i += DIRECT_COPY_CONCURRENCY) {
    if (shouldAbort?.()) break
    await runChunk(files.slice(i, i + DIRECT_COPY_CONCURRENCY))
  }

  // Retry bucket: backoff between rounds, then drop remaining as errors.
  for (let attempt = 1; attempt <= DIRECT_COPY_MAX_RETRIES && retryBucket.length > 0; attempt++) {
    if (shouldAbort?.()) break
    await new Promise((r) => setTimeout(r, DIRECT_COPY_RETRY_DELAY_MS))
    const pending = retryBucket.splice(0, retryBucket.length)
    const stillFailing: ClassifiedEntry[] = []
    await Promise.all(pending.map(async (entry, idx) => {
      throwIfSpinosaCancelled(shouldAbort)
      const result = await tryCopy(entry, attempt, (seqOf.get(entry) ?? idx) + 1)
      handleResult(entry, result, stillFailing)
    }))
    retryBucket.push(...stillFailing)
  }

  // Files that exhausted every retry are permanently failed. Count them as
  // processed so the progress numerator reaches the total and the bar hits
  // 100% (worked = successes + final failures), not stuck below it.
  for (const entry of retryBucket) {
    completed++
    prog?.file("direct-progress", completed, total, entry.rel)
  }
  failed = retryBucket.length
  return { converted, skipped, failed, renamed, recoverable }
}

export async function processMarkitdown(
  files: ClassifiedEntry[],
  logsDir: string,
  prog?: ProgressEmitter,
  onLog?: (msg: string) => void,
  shouldAbort?: () => boolean,
): Promise<PhaseResult> {
  let converted = 0; let skipped = 0; let failed = 0
  const recoverable: { src: string; dest: string }[] = []
  // Monotonic count of files that have reached a terminal state (skip,
  // success, or failure). Drives the progress numerator so the bar reflects
  // the amount of work done and reaches 100% once every file is resolved.
  let processed = 0

  const preSkipped: ClassifiedEntry[] = []
  const toProcess: ClassifiedEntry[] = []
  for (const f of files) {
    if (convertedOutputExists(f.dest)) { preSkipped.push(f) } else { toProcess.push(f) }
  }

  skipped += preSkipped.length
  const total = preSkipped.length + toProcess.length
  for (const [i, ps] of preSkipped.entries()) {
    throwIfSpinosaCancelled(shouldAbort)
    onLog?.(`  ${ps.rel} → already converted, skipped`)
    appendNdjson(path.join(logsDir, "markitdown-processed.ndjson"), {
      ts: isoNow(), status: "skip", source: ps.rel,
      output: markitdownOutputRelPath(ps.rel),
      engine: "markitdown", pages: "", duration_s: 0,
    })
    prog?.file("MarkItDown", ++processed, total, ps.rel)
  }

  const nonPdfFiles: ClassifiedEntry[] = []
  const pdfRemaining: ClassifiedEntry[] = []
  const pdfOcrFallback: ClassifiedEntry[] = []

  for (const f of toProcess) {
    throwIfSpinosaCancelled(shouldAbort)
    if (fileExt(f.src) !== "pdf") { nonPdfFiles.push(f); continue }
    onLog?.(`  ${f.rel} → pdf-js ...`)
    const startTime = Date.now()
    try {
      await convertTextPdf(f.src, f.dest, f.rel, shouldAbort)
      throwIfSpinosaCancelled(shouldAbort)
      converted++
      recoverable.push({ src: f.src, dest: f.dest })
      appendNdjson(path.join(logsDir, "markitdown-processed.ndjson"), {
        ts: isoNow(), status: "ok", source: f.rel,
        output: markitdownOutputRelPath(f.rel),
        engine: "pdf-js", pages: "",
        duration_s: (Date.now() - startTime) / 1000,
      })
      prog?.file("MarkItDown", ++processed, total, f.rel)
      await yieldToEL()
    } catch (err) {
      if (isSpinosaCancellationError(err)) throw err
      pdfRemaining.push(f)
    }
  }

  const remainingMd = [...nonPdfFiles, ...pdfRemaining]
  const preCount = preSkipped.length + (toProcess.length - remainingMd.length)

  const mdLog = path.join(logsDir, "markitdown-processed.ndjson")
  if (remainingMd.length > 0) {
    const converter = new MarkItDown()
    // Formats markitdown-ts doesn't handle — convert inline
    const INLINE_FORMATS = new Set(["json", "csv", "xml"])
    for (const [i, f] of remainingMd.entries()) {
      throwIfSpinosaCancelled(shouldAbort)
      const ext = fileExt(f.src).toLowerCase()

      // Inline conversion for formats markitdown-ts doesn't support
      if (INLINE_FORMATS.has(ext)) {
        onLog?.(`  ${f.rel} → ${ext} ...`)
        const startTime = Date.now()
        try {
          const raw = readFileSync(f.src, "utf-8")
          throwIfSpinosaCancelled(shouldAbort)
          mkdirSync(path.dirname(f.dest), { recursive: true })
          writeTextAtomicSafe(f.dest, `# ${path.basename(f.rel)}\n\n\`\`\`${ext}\n${raw}\n\`\`\`\n`)
          injectColdFrontmatter(f.dest)
          converted++
          prog?.file("MarkItDown", ++processed, total, f.rel)
          recoverable.push({ src: f.src, dest: f.dest })
          appendNdjson(mdLog, {
            ts: isoNow(), status: "ok", source: f.rel,
            output: markitdownOutputRelPath(f.rel),
            engine: `inline-${ext}`, pages: "",
            duration_s: (Date.now() - startTime) / 1000,
          })
        } catch (err) {
          if (isSpinosaCancellationError(err)) throw err
          const errMsg = err instanceof Error ? err.message : String(err)
          failed++
          prog?.file("MarkItDown", ++processed, total, f.rel)
          appendNdjson(mdLog, {
            ts: isoNow(), status: "fail", source: f.rel,
            output: markitdownOutputRelPath(f.rel),
            engine: `inline-${ext}`, pages: "",
            duration_s: (Date.now() - startTime) / 1000,
            error: errMsg,
          })
          onLog?.(`${ext} conversion failed: ${f.rel} — ${errMsg}`)
        }
        continue
      }

      onLog?.(`  ${f.rel} → markitdown-ts ...`)
      const startTime = Date.now()
      try {
        mkdirSync(path.dirname(f.dest), { recursive: true })
        const result = await converter.convert(f.src)
        throwIfSpinosaCancelled(shouldAbort)
        const text = result?.markdown ?? ""
        if (!text.trim()) throw new Error("MarkItDown returned no content")
        writeTextAtomicSafe(f.dest, text)
        injectColdFrontmatter(f.dest)
        converted++
        prog?.file("MarkItDown", ++processed, total, f.rel)
        recoverable.push({ src: f.src, dest: f.dest })
        appendNdjson(mdLog, {
          ts: isoNow(), status: "ok", source: f.rel,
          output: markitdownOutputRelPath(f.rel),
          engine: "markitdown-ts", pages: "",
          duration_s: (Date.now() - startTime) / 1000,
        })
      } catch (err) {
        if (isSpinosaCancellationError(err)) throw err
        const errMsg = err instanceof Error ? err.message : String(err)
        onLog?.(`MarkItDown failed: ${f.rel} — ${errMsg}`)
        if (fileExt(f.src) === "pdf") {
          pdfOcrFallback.push(f)
          prog?.file("MarkItDown", ++processed, total, `${f.rel} → OCR fallback`)
        } else {
          failed++
          prog?.file("MarkItDown", ++processed, total, f.rel)
          appendNdjson(mdLog, {
            ts: isoNow(), status: "fail", source: f.rel,
            output: markitdownOutputRelPath(f.rel),
            engine: "markitdown-ts", pages: "",
            duration_s: (Date.now() - startTime) / 1000,
            error: errMsg,
          })
        }
      }
    }
  }

  // Recover PDFs that failed both pdf-js and MarkItDown via OCR
  if (pdfOcrFallback.length > 0) {
    onLog?.(`Falling back to OCR for ${pdfOcrFallback.length} PDF(s) that failed text extraction...`)
    for (const f of pdfOcrFallback) {
      throwIfSpinosaCancelled(shouldAbort)
      const startTime = Date.now()
      let ok = false
      try {
        const result = await runOcrWorker([{ src: f.src, rel: f.rel, dest: f.dest }], { onLog })
        ok = result.converted > 0 && convertedOutputExists(f.dest)
        if (ok) {
          converted++
          recoverable.push({ src: f.src, dest: f.dest })
          onLog?.(`  ${f.rel} → OCR fallback succeeded`)
        } else {
          skipped++
          onLog?.(`  ${f.rel} → OCR fallback returned no content`)
        }
      } catch (err) {
        if (isSpinosaCancellationError(err)) throw err
        const errMsg = err instanceof Error ? err.message : String(err)
        skipped++
        onLog?.(`  ${f.rel} → OCR fallback failed: ${errMsg}`)
      }
      appendNdjson(mdLog, {
        ts: isoNow(), status: ok ? "ok" : "fail",
        source: f.rel, output: markitdownOutputRelPath(f.rel),
        engine: "ppu-paddle-ocr", pages: "", duration_s: (Date.now() - startTime) / 1000,
      })
      prog?.file("MarkItDown", ++processed, total, f.rel)
    }
  }

  return { converted, skipped, failed, renamed: 0, recoverable }
}

export async function processOcr(
  files: ClassifiedEntry[],
  logsDir: string,
  prog?: ProgressEmitter,
  onLog?: (msg: string) => void,
  shouldAbort?: () => boolean,
): Promise<PhaseResult> {
  let converted = 0; let skipped = 0; let failed = 0
  const recoverable: { src: string; dest: string }[] = []
  // Monotonic count of files that have reached a terminal state (skip,
  // success, or failure). Drives the progress numerator so the bar reflects
  // the amount of work done and reaches 100% once every file is resolved.
  let processed = 0

  const toProcess: ClassifiedEntry[] = []
  const preSkipped: ClassifiedEntry[] = []
  for (const f of files) {
    if (convertedOutputExists(f.dest)) { preSkipped.push(f) } else { toProcess.push(f) }
  }

  skipped += preSkipped.length
  const total = preSkipped.length + toProcess.length
  for (const [i, ps] of preSkipped.entries()) {
    throwIfSpinosaCancelled(shouldAbort)
    onLog?.(`  ${ps.rel} → already converted, skipped`)
    appendNdjson(path.join(logsDir, "ocr-processed.ndjson"), {
      ts: isoNow(), status: "skip", source: ps.rel,
      output: ocrOutputRelPath(ps.rel),
      engine: "ppu-paddle-ocr", pages: "", duration_s: 0,
    })
    prog?.file("OCR", ++processed, total, ps.rel)
  }

  if (toProcess.length > 0) {
    const ocrLog = path.join(logsDir, "ocr-processed.ndjson")
    onLog?.(`PPU PaddleOCR: Processing ${toProcess.length} files`)

    for (let i = 0; i < toProcess.length; i++) {
      throwIfSpinosaCancelled(shouldAbort)
      const f = toProcess[i]!
      onLog?.(`  ${f.rel} → OCR ...`)

      try {
        const result = await runOcrWorker([f as PpuOcrFile], { onLog })
        const ok = result.converted > 0 && convertedOutputExists(f.dest)
        appendNdjson(ocrLog, {
          ts: isoNow(), status: ok ? "ok" : "fail",
          source: f.rel, output: ocrOutputRelPath(f.rel),
          engine: "ppu-paddle-ocr", pages: "", duration_s: 0,
        })
        if (ok) {
          converted++
          recoverable.push({ src: f.src, dest: f.dest })
        } else {
          skipped++
        }
      } catch (err) {
        if (isSpinosaCancellationError(err)) throw err
        onLog?.(`  PPU PaddleOCR failed: ${f.rel} — ${err instanceof Error ? err.message : String(err)}`)
        appendNdjson(ocrLog, {
          ts: isoNow(), status: "fail",
          source: f.rel, output: ocrOutputRelPath(f.rel),
          engine: "ppu-paddle-ocr", pages: "", duration_s: 0,
        })
        skipped++
      }
      prog?.file("OCR", ++processed, total, f.rel)
    }
    prog?.file("OCR", processed, total, "")
  }

  return { converted, skipped, failed, renamed: 0, recoverable }
}

function workerScriptPath(): string {
  return fileURLToPath(new URL("ppu-ocr-worker.ts", import.meta.url))
}

async function runOcrWorker(
  files: PpuOcrFile[],
  options?: {
    onLog?: (msg: string) => void
    onProgress?: (current: number, total: number, relPath: string) => void
    onPageProgress?: (current: number, total: number, relPath: string, page: string) => void
  },
): Promise<PpuOcrBatchResult> {
  const workerScript = workerScriptPath()
  const engine = process.env.SPINOSA_OCR_ENGINE ?? "ppu-paddle-ocr"
  const workerArgs = JSON.stringify({ files, engine })
  const child = spawn(process.argv0, ["run", workerScript, workerArgs], {
    stdio: ["ignore", "pipe", "ignore"],
    detached: true,
  })
  child.unref()

  let stdoutBuf = ""
  child.stdout.on("data", (chunk: Buffer) => { stdoutBuf += chunk.toString() })

  const { code, signal } = await new Promise<{ code: number | null; signal: string | null }>((resolve) => {
    child.on("close", (c, s) => resolve({ code: c, signal: s }))
  })

  let workerConverted = 0
  let workerSkipped = 0

  for (const line of stdoutBuf.split("\n").filter(Boolean)) {
    try {
      const msg = JSON.parse(line)
      switch (msg.type) {
        case "progress":
          options?.onProgress?.(msg.current, msg.total, msg.relPath)
          break
        case "pageProgress":
          options?.onPageProgress?.(msg.current, msg.total, msg.relPath, msg.page)
          break
        case "log":
          options?.onLog?.(msg.message)
          break
        case "done":
          workerConverted = msg.converted
          workerSkipped = msg.skipped
          break
        case "error":
          options?.onLog?.(`PPU PaddleOCR worker: ${msg.message}`)
          break
      }
    } catch {
      options?.onLog?.(`PPU PaddleOCR worker: ${line}`)
    }
  }

  if (signal) {
    options?.onLog?.(`PPU PaddleOCR worker terminated by signal ${signal} — worker crash`)
  } else if (code !== 0) {
    options?.onLog?.(`PPU PaddleOCR worker exited with code ${code}`)
  }

  return { converted: workerConverted, skipped: workerSkipped }
}


// ── Helpers ───────────────────────────────────────────────────────────────

function isoNow(): string {
  return new Date().toISOString()
}

function yieldToEL(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  setTimeout(resolve, 0)
  return promise
}

function isExtSelected(ext: string, bm?: ImportBatchManager): boolean {
  return !bm || bm.isSelected(ext)
}

function expectedImportDestRel(sourceRoot: string, srcFile: string, route: ImportRoute): string | undefined {
  const rel = srcFile.replace(sourceRoot, "").replace(/^\//, "")
  switch (route) {
    case "markdown_rename":
      return markdownRawRelPath(rel)
    case "native_copy":
    case "media_copy":
    case "binary_copy":
      return rel
    case "markitdown":
      return markitdownOutputRelPath(rel)
    case "ocr":
      return ocrOutputRelPath(rel)
    default:
      return undefined
  }
}

function importOutputExists(destDir: string, relDest: string): boolean {
  return convertedOutputExists(path.join(destDir, relDest))
}

interface VerifyResult {
  missing: number
  recovered: number
  stillMissing: number
}


function appendNdjson(path: string, obj: Record<string, unknown>): void {
  appendFileSync(path, JSON.stringify(obj) + "\n", "utf-8")
}

async function convertTextPdf(srcFile: string, destFile: string, relPath: string, shouldAbort?: () => boolean): Promise<void> {
  const title = path.basename(relPath, path.extname(relPath))
  const pageTexts = await pdfExtractPageTexts(srcFile)
  throwIfSpinosaCancelled(shouldAbort)
  const pages = pageTexts.length

  if (pages === 1) {
    mkdirSync(path.dirname(destFile), { recursive: true })
    writeTextAtomicSafe(destFile, `# ${title}\n\n${pageTexts[0]!.text.trim() || "[No text extracted]"}\n`)
    injectColdFrontmatter(destFile)
    return
  }

  const pageDir = destFile.endsWith(".md") ? destFile.slice(0, -3) : `${destFile}_pages`
  rmSync(pageDir, { recursive: true, force: true })
  mkdirSync(pageDir, { recursive: true })
  for (const { page, text } of pageTexts) {
    throwIfSpinosaCancelled(shouldAbort)
    const pageFile = path.join(pageDir, `page-${String(page).padStart(3, "0")}.md`)
    writeTextAtomicSafe(
      pageFile,
      [
        "---",
        `source_document: "${path.basename(relPath).replace(/"/g, '\\"')}"`,
        `page: ${page}`,
        `page_count: ${pages}`,
        "---",
        "",
        `# ${title} - Page ${page}`,
        "",
        text.trim() || "[No text extracted on this page]",
        "",
      ].join("\n"),
    )
    injectColdFrontmatter(pageFile)
  }
  mkdirSync(path.dirname(destFile), { recursive: true })
  writeTextAtomicSafe(
    destFile,
    `# ${title}\n\n${pageTexts.map(({ page }) => `- [Page ${page}](${path.basename(pageDir)}/page-${String(page).padStart(3, "0")}.md)`).join("\n")}\n`,
  )
  injectColdFrontmatter(destFile)
}

type CopyDirectResult = "copied" | "skipped" | "failed"

async function copyDirectRawFile(
  srcFile: string,
  destFile: string,
  relPath: string,
  prog?: ProgressEmitter,
  onLog?: (msg: string) => void,
  current?: number,
  total?: number,
  overwrite?: boolean,
  shouldAbort?: () => boolean,
  onRetry?: (attempt: number, reason: string) => void,
  onRename?: (original: string, renamed: string) => void,
): Promise<CopyDirectResult> {
  const c = current ?? 0
  const t = total ?? 0
  onLog?.(`  ${relPath}`)

  if (existsSync(destFile)) {
    if (!overwrite) {
      prog?.file("direct-skipped", c, t, relPath)
      onLog?.(`  ${relPath} → skipped`)
      return "skipped"
    }
  }

  // Yield before copy so the "starting" progress event renders
  await yieldToEL()
  throwIfSpinosaCancelled(shouldAbort)

  if (await safeCopyAsync(srcFile, destFile, {
    onRetry: (attempt, reason) => {
      onLog?.(`  ${relPath} → retry ${attempt} (${reason})`)
      onRetry?.(attempt, reason)
    },
    onRename: (original, renamed) => {
      onLog?.(`  ${relPath} → renamed (name too long)`)
      onRename?.(original, renamed)
    },
  })) {
    prog?.file("direct-copied", c, t, relPath)
    onLog?.(`  ${relPath} → copied`)
    return "copied"
  }

  return "failed"
}


// ── Verify & recover (full source-tree scan, route-aware) ──────────────────

export async function verifyAndRecoverImport(
  sourcePath: string,
  destDir: string,
  batchManager: ImportBatchManager | undefined,
  markitdownChoice: boolean | undefined,
  ocrChoice: boolean | undefined,
  onLog?: (msg: string) => void,
  shouldAbort?: () => boolean,
): Promise<VerifyResult> {
  let missing = 0
  let recovered = 0
  let stillMissing = 0

  onLog?.("Verify & recover: scanning source tree...")

  for (const srcFile of findSourceFiles(sourcePath)) {
    throwIfSpinosaCancelled(shouldAbort)
    if (shouldSkipSourceFile(srcFile)) continue

    const ext = fileExt(srcFile)
    if (batchManager && !batchManager.isSelected(ext)) continue

    const route = await importRouteForFile(srcFile, {
      markitdownChoice: markitdownChoice ?? false,
      ocrChoice: ocrChoice ?? false,
    })
    throwIfSpinosaCancelled(shouldAbort)
    if (!route) continue

    const expectedRel = expectedImportDestRel(sourcePath, srcFile, route)
    if (!expectedRel) continue

    if (importOutputExists(destDir, expectedRel)) continue

    const relPath = srcFile.replace(sourcePath, "").replace(/^\//, "")
    missing++
    onLog?.(`  Missing: ${relPath} → expected ${expectedRel} (route=${route})`)

    const destFile = path.join(destDir, expectedRel)
    let ok = false

    switch (route) {
      case "markdown_rename":
      case "native_copy":
      case "media_copy":
      case "binary_copy": {
        if (await safeCopyAsync(srcFile, destFile)) {
          throwIfSpinosaCancelled(shouldAbort)
          if (destFile.endsWith(".md")) injectColdFrontmatter(destFile)
          onLog?.(`    Recovered (direct copy): ${relPath}`)
          ok = true
        }
        break
      }
      case "markitdown": {
        try {
          mkdirSync(path.dirname(destFile), { recursive: true })
          const converter = new MarkItDown()
          const result = await converter.convert(srcFile)
          throwIfSpinosaCancelled(shouldAbort)
        const text = stripAnsi(result?.markdown ?? "")
          writeTextAtomicSafe(destFile, text)
          injectColdFrontmatter(destFile)
          onLog?.(`    Recovered (markitdown-ts): ${relPath}`)
          ok = true
        } catch (error) {
          if (isSpinosaCancellationError(error)) throw error
          const fallbackDest = destFile
          mkdirSync(path.dirname(fallbackDest), { recursive: true })
          if (await safeCopyAsync(srcFile, fallbackDest)) {
            onLog?.(`    Recovered (source copy fallback, markitdown failed): ${relPath}`)
            ok = true
          }
        }
        break
      }
      case "ocr": {
        let ppuConverted = 0
        if (ocrAvailable()) {
          try {
            const ppuResult = await runOcrWorker([{ src: srcFile, rel: relPath, dest: destFile }], { onLog })
            ppuConverted = ppuResult.converted
          } catch (err) {
            if (isSpinosaCancellationError(err)) throw err
            onLog?.(`    PPU OCR engine failed: ${err instanceof Error ? err.message : String(err)} — skipping OCR recovery`)
          }
        }
        if (ppuConverted > 0) {
          injectColdFrontmatter(destFile)
          onLog?.(`    Recovered (ocr retry): ${relPath}`)
          ok = true
        } else {
          const fallbackDest = destFile
          mkdirSync(path.dirname(fallbackDest), { recursive: true })
          if (await safeCopyAsync(srcFile, fallbackDest)) {
            onLog?.(`    Recovered (source copy fallback, ocr retry failed): ${relPath}`)
            ok = true
          }
        }
        break
      }
    }

    if (ok) {
      recovered++
    } else {
      stillMissing++
      onLog?.(`    Still missing: ${relPath}`)
    }
  }

  onLog?.(`Verify & recover: ${missing} missing, ${recovered} recovered, ${stillMissing} still missing`)

  return { missing, recovered, stillMissing }
}

// ── Main copy pipeline ────────────────────────────────────────────────────
export async function copySource(
  sourcePath: string,
  destDir: string,
  options?: CopyOptions,
): Promise<CopyResult> {
  const res: CopyResult = {
    copied: 0, skipped: 0, failed: 0,
    mdConverted: 0, mdSkipped: 0, mdFailed: 0,
    ocrConverted: 0, ocrSkipped: 0, ocrFailed: 0,
    totalCopied: 0, stillMissing: 0, recovered: 0,
    failedFileCount: 0, failedFilePaths: [],
  }

  throwIfSpinosaCancelled(options?.shouldAbort)
  const classified = await scanAndClassifySource(sourcePath, destDir, options?.batchManager, options?.subfolder, options?.shouldAbort)
  if (!classified) {
    options?.onLog?.(`Failed to scan source: ${sourcePath}`)
    return res
  }

  options?.onClassified?.({
    directFiles: classified.directFiles,
    markitdownFiles: classified.markitdownFiles,
    ocrFiles: classified.ocrFiles,
    logsDir: classified.logsDir,
  })

  const prog = new ProgressEmitter()
  prog.on((e) => { options?.onProgress?.(e.phase, e.current, e.total, e.relPath) })

  const runPhase = (p: "direct" | "markitdown" | "ocr"): boolean => {
    const rp = options?.runPhase ?? "all"
    return rp === "all" || rp === p
  }

  if (runPhase("direct") && classified.directFiles.length > 0) {
    options?.onPhaseChange?.("direct", `Copying ${classified.directFiles.length} files...`)
    const dr = await processDirectCopy(classified.directFiles, prog, options?.onLog, options?.overwrite, options?.shouldAbort)
    res.copied += dr.converted; res.skipped += dr.skipped; res.failed += dr.failed
  }

  if (runPhase("markitdown") && classified.markitdownFiles.length > 0 && options?.markitdownChoice) {
    options?.onPhaseChange?.("markitdown", `Converting ${classified.markitdownFiles.length} files with MarkItDown...`)
      const mr = await processMarkitdown(classified.markitdownFiles, classified.logsDir, prog, options?.onLog, options?.shouldAbort)
    res.mdConverted += mr.converted; res.mdSkipped += mr.skipped; res.mdFailed += mr.failed
  }

  if (runPhase("ocr") && classified.ocrFiles.length > 0 && options?.ocrChoice) {
    options?.onPhaseChange?.("ocr", `Processing ${classified.ocrFiles.length} OCR files...`)
      const or = await processOcr(classified.ocrFiles, classified.logsDir, prog, options?.onLog, options?.shouldAbort)
    res.ocrConverted += or.converted; res.ocrSkipped += or.skipped; res.ocrFailed += or.failed
  }

  res.totalCopied = res.copied + res.mdConverted + res.ocrConverted

  if (options?.verifyAfter !== false) {
    const verifyResult = await verifyAndRecoverImport(sourcePath, destDir, options?.batchManager, options?.markitdownChoice, options?.ocrChoice, options?.onLog, options?.shouldAbort)
    res.stillMissing = verifyResult.stillMissing
    res.recovered = verifyResult.recovered
  }

  options?.onLog?.(`Copy complete: ${res.totalCopied} total (${res.copied} direct, ${res.mdConverted} MarkItDown, ${res.ocrConverted} OCR), ${res.skipped} skipped, ${res.failed} failed, ${res.stillMissing} still missing`)

  // Collect failed files and copy originals to _failed_files/ for manual review
  if (classified) {
    const allInputs = [
      ...classified.markitdownFiles.map((f) => ({ ...f, phase: "markitdown" })),
      ...classified.ocrFiles.map((f) => ({ ...f, phase: "ocr" })),

    ]
    for (const f of allInputs) {
      if (!convertedOutputExists(f.dest)) {
        const dest = path.join(destDir, "_failed_files", f.rel)
        mkdirSync(path.dirname(dest), { recursive: true })
        try { safeCopyAsync(f.src, dest) } catch { /* best-effort */ }
        res.failedFileCount++
        res.failedFilePaths.push(f.rel)
      }
    }
  }

  if (res.failedFileCount > 0) {
    options?.onLog?.(`${res.failedFileCount} failed file(s) saved to raw/_failed_files/ for review`)
  }

  return res
}
