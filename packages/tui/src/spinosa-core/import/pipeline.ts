import { existsSync, mkdirSync, appendFileSync, readFileSync, readdirSync, rmSync } from "node:fs"
import * as path from "node:path"
import { MarkItDown } from "markitdown-ts"

import { fileExt } from "../constants"
import {
  shouldSkipSourceFile,
  findSourceFiles,
  markdownRawRelPath,
  markitdownOutputRelPath,
  ocrOutputRelPath,
  classifySourceFile,
  scanClassifySourceFile,
  importRouteForFile,
} from "../extension/classifier"
import { safeCopyAsync, writeTextAtomic } from "../utils/fs"
import { spinosaLogInfo } from "../utils/log"
import type { FileClass, ImportRoute } from "../extension/types"
import { injectColdFrontmatter, convertedOutputExists } from "./frontmatter"
import type { ImportBatchManager } from "./batch"
import { isSpinosaCancellationError, throwIfSpinosaCancelled } from "./cancellation"
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
    allFiles.push(...findSourceFiles(sourcePath))
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

export async function processDirectCopy(
  files: ClassifiedEntry[],
  prog?: ProgressEmitter,
  onLog?: (msg: string) => void,
  overwrite?: boolean,
  shouldAbort?: () => boolean,
): Promise<PhaseResult> {
  let converted = 0; let skipped = 0; let failed = 0
  const recoverable: { src: string; dest: string }[] = []

  for (const [i, entry] of files.entries()) {
    throwIfSpinosaCancelled(shouldAbort)
    const { src, rel, dest } = entry
    const result = await copyDirectRawFile(src, dest, rel, prog, onLog, i + 1, files.length, overwrite)
    throwIfSpinosaCancelled(shouldAbort)
    if (result === "copied") {
      converted++
      if (dest.endsWith(".md")) injectColdFrontmatter(dest)
      recoverable.push({ src, dest })
    } else if (result === "skipped") { skipped++ }
    else { failed++ }
  }

  return { converted, skipped, failed, recoverable }
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
    prog?.file("MarkItDown", i + 1, total, ps.rel)
  }

  const nonPdfFiles: ClassifiedEntry[] = []
  const pdfRemaining: ClassifiedEntry[] = []

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
      prog?.file("MarkItDown", preSkipped.length + converted + skipped, total, f.rel)
      await yieldToEL()
    } catch (err) {
      if (isSpinosaCancellationError(err)) throw err
      pdfRemaining.push(f)
    }
  }

  const remainingMd = [...nonPdfFiles, ...pdfRemaining]
  const preCount = preSkipped.length + (toProcess.length - remainingMd.length)

  if (remainingMd.length > 0) {
    const converter = new MarkItDown()
    const mdLog = path.join(logsDir, "markitdown-processed.ndjson")
    // Formats markitdown-ts doesn't handle — convert inline
    const INLINE_FORMATS = new Set(["json", "csv", "xml"])
    for (const [i, f] of remainingMd.entries()) {
      throwIfSpinosaCancelled(shouldAbort)
      const ext = fileExt(f.src).toLowerCase()

      // Inline conversion for formats markitdown-ts doesn't support
      if (INLINE_FORMATS.has(ext)) {
        prog?.file("MarkItDown", preCount + i + 1, total, f.rel)
        onLog?.(`  ${f.rel} → ${ext} ...`)
        const startTime = Date.now()
        try {
          const raw = readFileSync(f.src, "utf-8")
          throwIfSpinosaCancelled(shouldAbort)
          mkdirSync(path.dirname(f.dest), { recursive: true })
          writeTextAtomic(f.dest, `# ${path.basename(f.rel)}\n\n\`\`\`${ext}\n${raw}\n\`\`\`\n`)
          injectColdFrontmatter(f.dest)
          converted++
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

      prog?.file("MarkItDown", preCount + i + 1, total, f.rel)
      onLog?.(`  ${f.rel} → markitdown-ts ...`)
      const startTime = Date.now()
      try {
        mkdirSync(path.dirname(f.dest), { recursive: true })
        const result = await converter.convert(f.src)
        throwIfSpinosaCancelled(shouldAbort)
        const text = result?.markdown ?? ""
        if (!text.trim()) throw new Error("MarkItDown returned no content")
        writeTextAtomic(f.dest, text)
        injectColdFrontmatter(f.dest)
        converted++
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
        failed++
        appendNdjson(mdLog, {
          ts: isoNow(), status: "fail", source: f.rel,
          output: markitdownOutputRelPath(f.rel),
          engine: "markitdown-ts", pages: "",
          duration_s: (Date.now() - startTime) / 1000,
          error: errMsg,
        })
        onLog?.(`MarkItDown failed: ${f.rel} — ${errMsg}`)
      }
    }
  }

  return { converted, skipped, failed, recoverable }
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
    prog?.file("OCR", i + 1, total, ps.rel)
  }

  if (toProcess.length > 0) {
    throwIfSpinosaCancelled(shouldAbort)
    onLog?.(`PPU PaddleOCR: Processing ${toProcess.length} files`)
    const ocrLog = path.join(logsDir, "ocr-processed.ndjson")
    try {
      const ocrResult = await runPpuOcrBatch(toProcess, {
        onLog,
        shouldAbort,
        onProgress: (current, total, relPath) => {
          prog?.file("OCR", preSkipped.length + current, preSkipped.length + total, relPath)
        },
        onPageProgress: (current, total, relPath, page) => {
          prog?.file("OCR", preSkipped.length + current, preSkipped.length + total, `${relPath} page ${page}`)
        },
      })
      converted += ocrResult.converted
      for (const f of toProcess) {
        const ok = convertedOutputExists(f.dest)
        appendNdjson(ocrLog, {
          ts: isoNow(), status: ok ? "ok" : "fail",
          source: f.rel, output: ocrOutputRelPath(f.rel),
          engine: "ppu-paddle-ocr", pages: "", duration_s: 0,
        })
        if (ok) {
          recoverable.push({ src: f.src, dest: f.dest })
        } else {
          failed++
        }
      }
    } catch (err) {
      if (isSpinosaCancellationError(err)) throw err
      onLog?.(`PPU PaddleOCR engine failed: ${err instanceof Error ? err.message : String(err)} — skipping OCR pass`)
      failed = toProcess.length
    }
  }

  return { converted, skipped, failed, recoverable }
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
    writeTextAtomic(destFile, `# ${title}\n\n${pageTexts[0]!.text.trim() || "[No text extracted]"}\n`)
    injectColdFrontmatter(destFile)
    return
  }

  const pageDir = destFile.endsWith(".md") ? destFile.slice(0, -3) : `${destFile}_pages`
  rmSync(pageDir, { recursive: true, force: true })
  mkdirSync(pageDir, { recursive: true })
  for (const { page, text } of pageTexts) {
    throwIfSpinosaCancelled(shouldAbort)
    const pageFile = path.join(pageDir, `page-${String(page).padStart(3, "0")}.md`)
    writeTextAtomic(
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
  writeTextAtomic(
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
): Promise<CopyDirectResult> {
  const c = current ?? 0
  const t = total ?? 0
  prog?.file("direct-copy", c, t, relPath)
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

  if (await safeCopyAsync(srcFile, destFile)) {
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
          const text = result?.markdown ?? ""
          writeTextAtomic(destFile, text)
          injectColdFrontmatter(destFile)
          onLog?.(`    Recovered (markitdown-ts): ${relPath}`)
          ok = true
        } catch (error) {
          if (isSpinosaCancellationError(error)) throw error
          const fallbackDest = path.join(destDir, relPath)
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
            const ppuResult = await runPpuOcrBatch([{ src: srcFile, rel: relPath, dest: destFile }], { onLog, shouldAbort })
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
          const fallbackDest = path.join(destDir, relPath)
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

  return res
}
