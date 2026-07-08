import { existsSync, mkdirSync, appendFileSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import * as path from "node:path"
import { spawnSync } from "node:child_process"
import { MarkItDown } from "markitdown-ts"

import { fileExt } from "../constants"
import {
  shouldSkipSourceFile,
  findSourceFiles,
  markdownRawRelPath,
  markitdownOutputRelPath,
  ocrOutputRelPath,
  classifySourceFile,
  importRouteForFile,
} from "../extension/classifier"
import { safeCopyAsync } from "../utils/fs"
import type { FileClass, ImportRoute } from "../extension/types"
import { injectColdFrontmatter, convertedOutputExists } from "./frontmatter"
import type { ImportBatchManager } from "./batch"
import { runPpuOcrBatch } from "./ppu-ocr"
import { ProgressEmitter } from "../progress/progress"
import { ocrAvailable } from "../tools/detection"

export interface CopyResult {
  copied: number
  skipped: number
  failed: number
  mdConverted: number
  mdSkipped: number
  ocrConverted: number
  ocrSkipped: number
  totalCopied: number
  stillMissing: number
}

type CopyPhase = "all" | "direct" | "markitdown" | "ocr"

interface CopyOptions {
  markitdownChoice?: boolean
  ocrChoice?: boolean
  runPhase?: CopyPhase
  verifyAfter?: boolean
  batchManager?: ImportBatchManager
  onProgress?: (phase: string, current: number, total: number, relPath: string) => void
  onLog?: (line: string) => void
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
    if (shouldSkipSourceFile(fp)) continue
    const rel = fp.replace(sourcePath, "").replace(/^\//, "")
    const ext = fileExt(fp)
    entries.push({ filePath: fp, relPath: rel, ext, klass: await classifySourceFile(fp) })
  }

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
): Promise<PhaseResult> {
  let converted = 0; let skipped = 0; let failed = 0
  const recoverable: { src: string; dest: string }[] = []

  for (const [i, entry] of files.entries()) {
    const { src, rel, dest } = entry
    const result = await copyDirectRawFile(src, dest, rel, prog, onLog, i + 1, files.length)
    if (result === "copied") { converted++; injectColdFrontmatter(dest); recoverable.push({ src, dest }) }
    else if (result === "skipped") { skipped++ }
    else { failed++ }
  }

  return { converted, skipped, failed, recoverable }
}

export async function processMarkitdown(
  files: ClassifiedEntry[],
  logsDir: string,
  prog?: ProgressEmitter,
  onLog?: (msg: string) => void,
): Promise<PhaseResult> {
  let converted = 0; let skipped = 0
  const recoverable: { src: string; dest: string }[] = []

  const preSkipped: ClassifiedEntry[] = []
  const toProcess: ClassifiedEntry[] = []
  for (const f of files) {
    if (convertedOutputExists(f.dest)) { preSkipped.push(f) } else { toProcess.push(f) }
  }

  skipped += preSkipped.length
  const total = preSkipped.length + toProcess.length
  for (const [i, ps] of preSkipped.entries()) {
    onLog?.(`  ${ps.rel} → already converted, skipped`)
    appendNdjson(path.join(logsDir, "markitdown-processed.ndjson"), {
      ts: isoNow(), status: "skip", source: ps.rel,
      output: markitdownOutputRelPath(ps.rel),
      engine: "markitdown", pages: "", duration_s: 0,
    })
    prog?.file("MarkItDown", i + 1, total, ps.rel)
  }

  const pdftotextReady = commandOnPath("pdfinfo") && commandOnPath("pdftotext")
  const nonPdfFiles: ClassifiedEntry[] = []
  const pdfRemaining: ClassifiedEntry[] = []

  if (pdftotextReady) {
    for (const f of toProcess) {
      if (fileExt(f.src) !== "pdf") { nonPdfFiles.push(f); continue }
      onLog?.(`  ${f.rel} → pdftotext ...`)
      const startTime = Date.now()
      if (convertTextPdfWithPdftotext(f.src, f.dest, f.rel)) {
        converted++
        recoverable.push({ src: f.src, dest: f.dest })
        appendNdjson(path.join(logsDir, "markitdown-processed.ndjson"), {
          ts: isoNow(), status: "ok", source: f.rel,
          output: markitdownOutputRelPath(f.rel),
          engine: "pdftotext", pages: "",
          duration_s: (Date.now() - startTime) / 1000,
        })
        prog?.file("MarkItDown", preSkipped.length + converted + skipped, total, f.rel)
        await yieldToEL()
      } else {
        pdfRemaining.push(f)
      }
    }
  } else {
    nonPdfFiles.push(...toProcess.filter(f => fileExt(f.src) !== "pdf"))
    pdfRemaining.push(...toProcess.filter(f => fileExt(f.src) === "pdf"))
  }

  const remainingMd = [...nonPdfFiles, ...pdfRemaining]
  const preCount = preSkipped.length + (toProcess.length - remainingMd.length)

  if (remainingMd.length > 0) {
    const converter = new MarkItDown()
    const mdLog = path.join(logsDir, "markitdown-processed.ndjson")
    // Formats markitdown-ts doesn't handle — convert inline
    const INLINE_FORMATS = new Set(["json", "csv", "xml"])
    for (const [i, f] of remainingMd.entries()) {
      const ext = fileExt(f.src).toLowerCase()

      // Inline conversion for formats markitdown-ts doesn't support
      if (INLINE_FORMATS.has(ext)) {
        prog?.file("MarkItDown", preCount + i + 1, total, f.rel)
        onLog?.(`  ${f.rel} → ${ext} ...`)
        const startTime = Date.now()
        try {
          const raw = readFileSync(f.src, "utf-8")
          mkdirSync(path.dirname(f.dest), { recursive: true })
          writeFileSync(f.dest, `# ${path.basename(f.rel)}\n\n\`\`\`${ext}\n${raw}\n\`\`\`\n`, "utf-8")
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
          const errMsg = err instanceof Error ? err.message : String(err)
          skipped++
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
        const text = result?.markdown ?? ""
        writeFileSync(f.dest, text, "utf-8")
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
        const errMsg = err instanceof Error ? err.message : String(err)
        skipped++
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

  return { converted, skipped, failed: 0, recoverable }
}

export async function processOcr(
  files: ClassifiedEntry[],
  logsDir: string,
  prog?: ProgressEmitter,
  onLog?: (msg: string) => void,
): Promise<PhaseResult> {
  let converted = 0; let skipped = 0
  const recoverable: { src: string; dest: string }[] = []

  const toProcess: ClassifiedEntry[] = []
  const preSkipped: ClassifiedEntry[] = []
  for (const f of files) {
    if (convertedOutputExists(f.dest)) { preSkipped.push(f) } else { toProcess.push(f) }
  }

  skipped += preSkipped.length
  const total = preSkipped.length + toProcess.length
  for (const [i, ps] of preSkipped.entries()) {
    onLog?.(`  ${ps.rel} → already converted, skipped`)
    appendNdjson(path.join(logsDir, "ocr-processed.ndjson"), {
      ts: isoNow(), status: "skip", source: ps.rel,
      output: ocrOutputRelPath(ps.rel),
      engine: "ppu-paddle-ocr", pages: "", duration_s: 0,
    })
    prog?.file("OCR", i + 1, total, ps.rel)
  }

  if (toProcess.length > 0) {
    onLog?.(`PPU PaddleOCR: Processing ${toProcess.length} files`)
    const ocrLog = path.join(logsDir, "ocr-processed.ndjson")
    try {
      const ocrResult = await runPpuOcrBatch(toProcess, {
        onLog,
        onProgress: (current, total, relPath) => {
          prog?.file("OCR", preSkipped.length + current, preSkipped.length + total, relPath)
        },
        onPageProgress: (current, total, relPath, page) => {
          prog?.file("OCR", preSkipped.length + current, preSkipped.length + total, `${relPath} page ${page}`)
        },
      })
      converted += ocrResult.converted
      skipped += ocrResult.skipped
      for (const f of toProcess) {
        appendNdjson(ocrLog, {
          ts: isoNow(), status: convertedOutputExists(f.dest) ? "ok" : "fail",
          source: f.rel, output: ocrOutputRelPath(f.rel),
          engine: "ppu-paddle-ocr", pages: "", duration_s: 0,
        })
        if (convertedOutputExists(f.dest)) recoverable.push({ src: f.src, dest: f.dest })
      }
    } catch (err) {
      onLog?.(`PPU PaddleOCR engine failed: ${err instanceof Error ? err.message : String(err)} — skipping OCR pass`)
      skipped = toProcess.length
    }
  }

  return { converted, skipped, failed: 0, recoverable }
}


// ── Helpers ───────────────────────────────────────────────────────────────

function isoNow(): string {
  return new Date().toISOString()
}

function yieldToEL(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0))
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


function commandOnPath(name: string): string | undefined {
  if (typeof Bun !== "undefined" && Bun.which) {
    const found = Bun.which(name)
    if (found) return found
  }
  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    const full = path.join(dir, name)
    if (existsSync(full)) return full
  }
  return undefined
}

function appendNdjson(path: string, obj: Record<string, unknown>): void {
  appendFileSync(path, JSON.stringify(obj) + "\n", "utf-8")
}

function convertTextPdfWithPdftotext(srcFile: string, destFile: string, relPath: string): boolean {
  const pdfinfo = commandOnPath("pdfinfo")
  const pdftotext = commandOnPath("pdftotext")
  if (!pdfinfo || !pdftotext) return false

  const info = spawnSync(pdfinfo, [srcFile], { encoding: "utf-8", timeout: 60_000 })
  if (info.status !== 0) return false
  const pages = Number((info.stdout || "").match(/^Pages:\s+(\d+)/m)?.[1] ?? 0)
  if (!Number.isFinite(pages) || pages <= 0) return false

  const title = path.basename(relPath, path.extname(relPath))
  if (pages === 1) {
    const result = spawnSync(pdftotext, ["-layout", "-f", "1", "-l", "1", srcFile, "-"], { encoding: "utf-8", timeout: 120_000 })
    if (result.status !== 0) return false
    mkdirSync(path.dirname(destFile), { recursive: true })
    writeFileSync(destFile, `# ${title}\n\n${(result.stdout || "").trim() || "[No text extracted]"}\n`, "utf-8")
    injectColdFrontmatter(destFile)
    return true
  }

  const pageDir = destFile.endsWith(".md") ? destFile.slice(0, -3) : `${destFile}_pages`
  mkdirSync(pageDir, { recursive: true })
  for (let page = 1; page <= pages; page++) {
    const result = spawnSync(pdftotext, ["-layout", "-f", String(page), "-l", String(page), srcFile, "-"], {
      encoding: "utf-8",
      timeout: 120_000,
    })
    if (result.status !== 0) return false
    const pageFile = path.join(pageDir, `page-${String(page).padStart(3, "0")}.md`)
    writeFileSync(
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
        (result.stdout || "").trim() || "[No text extracted on this page]",
        "",
      ].join("\n"),
      "utf-8",
    )
    injectColdFrontmatter(pageFile)
  }
  mkdirSync(path.dirname(destFile), { recursive: true })
  writeFileSync(
    destFile,
    `# ${title}\n\n${Array.from({ length: pages }, (_, i) => `- [Page ${i + 1}](${path.basename(pageDir)}/page-${String(i + 1).padStart(3, "0")}.md)`).join("\n")}\n`,
    "utf-8",
  )
  injectColdFrontmatter(destFile)
  return true
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
): Promise<CopyDirectResult> {
  const c = current ?? 0
  const t = total ?? 0
  prog?.file("direct-copy", c, t, relPath)
  onLog?.(`  ${relPath}`)

  if (existsSync(destFile)) {
    prog?.file("direct-skipped", c, t, relPath)
    onLog?.(`  ${relPath} → skipped`)
    return "skipped"
  }

  // Yield before copy so the "starting" progress event renders
  await new Promise((r) => setTimeout(r, 0))

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
): Promise<VerifyResult> {
  let missing = 0
  let recovered = 0
  let stillMissing = 0

  onLog?.("Verify & recover: scanning source tree...")

  for (const srcFile of findSourceFiles(sourcePath)) {
    if (shouldSkipSourceFile(srcFile)) continue

    const ext = fileExt(srcFile)
    if (batchManager && !batchManager.isSelected(ext)) continue

    const route = await importRouteForFile(srcFile, {
      markitdownChoice: markitdownChoice ?? false,
      ocrChoice: ocrChoice ?? false,
    })
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
          const text = result?.markdown ?? ""
          writeFileSync(destFile, text, "utf-8")
          injectColdFrontmatter(destFile)
          onLog?.(`    Recovered (markitdown-ts): ${relPath}`)
          ok = true
        } catch {
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
            const ppuResult = await runPpuOcrBatch([{ src: srcFile, rel: relPath, dest: destFile }], { onLog })
            ppuConverted = ppuResult.converted
          } catch (err) {
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
    mdConverted: 0, mdSkipped: 0,
    ocrConverted: 0, ocrSkipped: 0,
    totalCopied: 0, stillMissing: 0,
  }

  const classified = await scanAndClassifySource(sourcePath, destDir, options?.batchManager)
  if (!classified) {
    options?.onLog?.(`Failed to scan source: ${sourcePath}`)
    return res
  }

  const prog = new ProgressEmitter()
  prog.on((e) => { options?.onProgress?.(e.phase, e.current, e.total, e.relPath) })

  const runPhase = (p: "direct" | "markitdown" | "ocr"): boolean => {
    const rp = options?.runPhase ?? "all"
    return rp === "all" || rp === p
  }

  if (runPhase("direct") && classified.directFiles.length > 0) {
    const dr = await processDirectCopy(classified.directFiles, prog, options?.onLog)
    res.copied += dr.converted; res.skipped += dr.skipped; res.failed += dr.failed
  }

  if (runPhase("markitdown") && classified.markitdownFiles.length > 0 && options?.markitdownChoice) {
    const mr = await processMarkitdown(classified.markitdownFiles, classified.logsDir, prog, options?.onLog)
    res.mdConverted += mr.converted; res.mdSkipped += mr.skipped
  }

  if (runPhase("ocr") && classified.ocrFiles.length > 0 && options?.ocrChoice) {
    const or = await processOcr(classified.ocrFiles, classified.logsDir, prog, options?.onLog)
    res.ocrConverted += or.converted; res.ocrSkipped += or.skipped
  }

  res.totalCopied = res.copied + res.mdConverted + res.ocrConverted

  if (options?.verifyAfter !== false) {
    const verifyResult = await verifyAndRecoverImport(sourcePath, destDir, options?.batchManager, options?.markitdownChoice, options?.ocrChoice, options?.onLog)
    res.stillMissing = verifyResult.stillMissing
  }

  options?.onLog?.(`Copy complete: ${res.totalCopied} total (${res.copied} direct, ${res.mdConverted} MarkItDown, ${res.ocrConverted} OCR), ${res.skipped} skipped, ${res.failed} failed, ${res.stillMissing} still missing`)

  return res
}
