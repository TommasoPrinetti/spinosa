import { existsSync, mkdirSync, appendFileSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import * as path from "node:path"
import { spawn, spawnSync } from "node:child_process"
import { createInterface } from "node:readline"
import { MarkItDown } from "markitdown-ts"

import { fileExt, STRUCTURED_FALLBACK_EXTENSIONS } from "../constants"
import {
  shouldSkipSourceFile,
  findSourceFiles,
  markdownRawRelPath,
  markitdownOutputRelPath,
  ocrOutputRelPath,
  classifySourceFile,
  importRouteForFile,
} from "../extension/classifier"
import { safeCopy, safeCopyAsync } from "../utils/fs"
import { isTextBasedPdf } from "../extension/pdf"
import type { FileClass, ImportRoute } from "../extension/types"
import { injectColdFrontmatter, convertedOutputExists } from "./frontmatter"
import type { ImportBatchManager } from "./batch"
import { runPpuOcrBatch } from "./ppu-ocr"
import { ProgressEmitter } from "../progress/progress"

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

export type CopyPhase = "all" | "direct" | "markitdown" | "ocr"

export interface CopyOptions {
  markitdownChoice?: boolean
  ocrChoice?: boolean
  runPhase?: CopyPhase
  verifyAfter?: boolean
  batchManager?: ImportBatchManager
  onProgress?: (phase: string, current: number, total: number, relPath: string) => void
  onLog?: (line: string) => void
}

// ── Single-pass scan & classify ──────────────────────────────────────────

export interface ClassifiedEntry {
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

export async function runDirectPhase(
  files: ClassifiedEntry[],
  prog: ProgressEmitter,
  onLog?: (msg: string) => void,
): Promise<{ copied: number; skipped: number; failed: number; recoverable: { src: string; dest: string }[] }> {
  let copied = 0; let skipped = 0; let failed = 0
  const recoverable: { src: string; dest: string }[] = []

  for (let i = 0; i < files.length; i++) {
    const { src, rel, dest } = files[i]!
    const result = await copyDirectRawFile(src, dest, rel, prog, onLog, i + 1, files.length)
    if (result === "copied") { copied++; injectColdFrontmatter(dest); recoverable.push({ src, dest }) }
    else if (result === "skipped") { skipped++ }
    else { failed++ }
    await yieldToEL()
  }

  return { copied, skipped, failed, recoverable }
}

export async function runMarkitdownPhase(
  files: ClassifiedEntry[],
  sourcePath: string,
  destDir: string,
  prog: ProgressEmitter,
  onLog?: (msg: string) => void,
): Promise<{ mdConverted: number; mdSkipped: number; recoverable: { src: string; dest: string }[] }> {
  let mdConverted = 0; let mdSkipped = 0
  const recoverable: { src: string; dest: string }[] = []
  const logsDir = path.resolve(destDir, "..", ".logs")
  mkdirSync(logsDir, { recursive: true })

  const preSkipped: ClassifiedEntry[] = []
  const toProcess: ClassifiedEntry[] = []
  for (const f of files) {
    if (convertedOutputExists(f.dest)) { preSkipped.push(f) } else { toProcess.push(f) }
  }

  mdSkipped += preSkipped.length
  const total = preSkipped.length + toProcess.length
  for (let i = 0; i < preSkipped.length; i++) {
    const ps = preSkipped[i]!
    onLog?.(`  ${ps.rel} → already converted, skipped`)
    appendNdjson(path.join(logsDir, "markitdown-processed.ndjson"), {
      ts: isoNow(), status: "skip", source: ps.rel,
      output: ps.dest.replace(destDir, "").replace(/^\//, ""),
      engine: "markitdown", pages: "", duration_s: 0,
    })
    prog.file("MarkItDown", i + 1, total, ps.rel)
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
        mdConverted++
        recoverable.push({ src: f.src, dest: f.dest })
        appendNdjson(path.join(logsDir, "markitdown-processed.ndjson"), {
          ts: isoNow(), status: "ok", source: f.rel,
          output: f.dest.replace(destDir, "").replace(/^\//, ""),
          engine: "pdftotext", pages: "",
          duration_s: (Date.now() - startTime) / 1000,
        })
        prog.file("MarkItDown", preSkipped.length + mdConverted + mdSkipped, total, f.rel)
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
  const preCount = preSkipped.length

  if (remainingMd.length > 0) {
    const markitdownBin = resolveBinary("markitdown-cli")

    if (markitdownBin) {
      onLog?.(`MarkItDown: Converting ${remainingMd.length} files`)
      const mdLog = path.join(logsDir, "markitdown-processed.ndjson")
      const mdResult = await runConverterBatch("markitdown", markitdownBin, remainingMd, sourcePath, destDir, mdLog, prog, onLog)
      mdConverted += mdResult.converted
      mdSkipped += mdResult.skipped
      for (const f of remainingMd) {
        if (convertedOutputExists(f.dest)) recoverable.push({ src: f.src, dest: f.dest })
      }
      await yieldToEL()
    } else {
      const converter = new MarkItDown()
      const mdLog = path.join(logsDir, "markitdown-processed.ndjson")
      for (let i = 0; i < remainingMd.length; i++) {
        const f = remainingMd[i]!
        onLog?.(`  ${f.rel} → markitdown-ts ...`)
        const startTime = Date.now()
        try {
          mkdirSync(path.dirname(f.dest), { recursive: true })
          const result = await converter.convert(f.src)
          const text = result?.markdown ?? ""
          writeFileSync(f.dest, text, "utf-8")
          injectColdFrontmatter(f.dest)
          mdConverted++
          recoverable.push({ src: f.src, dest: f.dest })
          appendNdjson(mdLog, {
            ts: isoNow(), status: "ok", source: f.rel,
            output: f.dest.replace(destDir, "").replace(/^\//, ""),
            engine: "markitdown-ts", pages: "",
            duration_s: (Date.now() - startTime) / 1000,
          })
        } catch (err) {
          if (writeStructuredFallbackMarkdown(f.src, f.dest, f.rel)) {
            mdConverted++
            recoverable.push({ src: f.src, dest: f.dest })
            appendNdjson(mdLog, {
              ts: isoNow(), status: "ok", source: f.rel,
              output: f.dest.replace(destDir, "").replace(/^\//, ""),
              engine: "structured-fallback", pages: "",
              duration_s: (Date.now() - startTime) / 1000,
            })
            onLog?.(`MarkItDown fallback converted: ${f.rel}`)
          } else {
            mdSkipped++
            appendNdjson(mdLog, {
              ts: isoNow(), status: "fail", source: f.rel,
              output: f.dest.replace(destDir, "").replace(/^\//, ""),
              engine: "markitdown-ts", pages: "",
              duration_s: (Date.now() - startTime) / 1000,
            })
            onLog?.(`MarkItDown failed: ${f.rel} — ${err}`)
          }
        }
        prog.file("MarkItDown", preCount + i + 1, total, f.rel)
        await yieldToEL()
      }
    }
  }

  return { mdConverted, mdSkipped, recoverable }
}

export async function runOcrPhase(
  files: ClassifiedEntry[],
  sourcePath: string,
  destDir: string,
  toolStatus: { rapidocr: boolean },
  prog: ProgressEmitter,
  onLog?: (msg: string) => void,
): Promise<{ ocrConverted: number; ocrSkipped: number; recoverable: { src: string; dest: string }[] }> {
  let ocrConverted = 0; let ocrSkipped = 0
  const recoverable: { src: string; dest: string }[] = []
  const logsDir = path.resolve(destDir, "..", ".logs")
  mkdirSync(logsDir, { recursive: true })

  const toProcess: ClassifiedEntry[] = []
  const preSkipped: ClassifiedEntry[] = []
  for (const f of files) {
    if (convertedOutputExists(f.dest)) { preSkipped.push(f) } else { toProcess.push(f) }
  }

  ocrSkipped += preSkipped.length
  const total = preSkipped.length + toProcess.length
  for (let i = 0; i < preSkipped.length; i++) {
    const ps = preSkipped[i]!
    onLog?.(`  ${ps.rel} → already converted, skipped`)
    appendNdjson(path.join(logsDir, "ocr-processed.ndjson"), {
      ts: isoNow(), status: "skip", source: ps.rel,
      output: ps.dest.replace(destDir, "").replace(/^\//, ""),
      engine: "ppu-paddle-ocr", pages: "", duration_s: 0,
    })
    prog.file("OCR", i + 1, total, ps.rel)
  }

  if (toProcess.length > 0 && toolStatus.rapidocr) {
    onLog?.(`PPU PaddleOCR: Processing ${toProcess.length} files`)
    const ocrLog = path.join(logsDir, "ocr-processed.ndjson")
    try {
      const ocrResult = await runPpuOcrBatch(toProcess, {
        onLog,
        onProgress: (current, total, relPath) => {
          prog.file("OCR", preSkipped.length + current, preSkipped.length + total, relPath)
        },
        onPageProgress: (current, total, relPath, page) => {
          prog.file("OCR", preSkipped.length + current, preSkipped.length + total, `${relPath} page ${page}`)
        },
      })
      ocrConverted += ocrResult.converted
      ocrSkipped += ocrResult.skipped
      for (const f of toProcess) {
        appendNdjson(ocrLog, {
          ts: isoNow(), status: convertedOutputExists(f.dest) ? "ok" : "fail",
          source: f.rel, output: f.dest.replace(destDir, "").replace(/^\//, ""),
          engine: "ppu-paddle-ocr", pages: "", duration_s: 0,
        })
        if (convertedOutputExists(f.dest)) recoverable.push({ src: f.src, dest: f.dest })
      }
    } catch (err) {
      onLog?.(`PPU PaddleOCR engine failed: ${err instanceof Error ? err.message : String(err)} — skipping OCR pass`)
      ocrSkipped = toProcess.length
    }
  } else if (toProcess.length > 0 && legacyRapidocrEnabled()) {
    const ocrBin = resolveBinary("rapidocr-cli")
    if (!ocrBin) {
      onLog?.("legacy rapidocr-cli not found on PATH — skipping OCR pass")
    } else {
      onLog?.(`Legacy RapidOCR: Processing ${toProcess.length} files`)
      const ocrLog = path.join(logsDir, "ocr-processed.ndjson")
      const ocrResult = await runConverterBatch("ocr", ocrBin, toProcess, sourcePath, destDir, ocrLog, prog, onLog, 600_000)
      ocrConverted += ocrResult.converted
      ocrSkipped += ocrResult.skipped
    }
  } else if (toProcess.length > 0) {
    onLog?.("PPU PaddleOCR not available — skipping OCR pass")
  }

  return { ocrConverted, ocrSkipped, recoverable }
}

export function copyDirectFiles(
  sourcePath: string,
  destDir: string,
  options?: CopyOptions,
): Promise<CopyResult> {
  return copySource(sourcePath, destDir, {
    ...options,
    runPhase: "direct",
    markitdownChoice: false,
    ocrChoice: false,
    verifyAfter: false,
  })
}

export function convertWithMarkItDown(
  sourcePath: string,
  destDir: string,
  options?: CopyOptions,
): Promise<CopyResult> {
  return copySource(sourcePath, destDir, {
    ...options,
    runPhase: "markitdown",
    markitdownChoice: options?.markitdownChoice ?? true,
    ocrChoice: false,
    verifyAfter: false,
  })
}

export function runOcrFiles(
  sourcePath: string,
  destDir: string,
  options?: CopyOptions,
): Promise<CopyResult> {
  return copySource(sourcePath, destDir, {
    ...options,
    runPhase: "ocr",
    markitdownChoice: false,
    ocrChoice: options?.ocrChoice ?? true,
    verifyAfter: false,
  })
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

function retryConverterSingle(
  engine: string,
  srcFile: string,
  destFile: string,
  sourcePath: string,
): boolean {
  const binName = engine === "ocr" ? "rapidocr-cli" : "markitdown-cli"
  const binary = resolveBinary(binName)
  if (!binary) return false
  try {
    mkdirSync(path.dirname(destFile), { recursive: true })
    const result = spawnSync(binary, ["--batch"], {
      stdio: ["pipe", "pipe", "pipe"],
      input: `SOURCE\t${sourcePath}\nFILE\t${srcFile}\t${destFile}\n`,
      timeout: 120_000,
    })
    const stderr = (result.stderr || "").toString()
    return stderr.includes("END\tok\t")
  } catch {
    return false
  }
}

export interface VerifyResult {
  missing: number
  recovered: number
  stillMissing: number
}

function appendNdjson(path: string, obj: Record<string, unknown>): void {
  appendFileSync(path, JSON.stringify(obj) + "\n", "utf-8")
}

function writeStructuredFallbackMarkdown(srcFile: string, destFile: string, relPath: string): boolean {
  const ext = fileExt(srcFile).toLowerCase()
  if (!STRUCTURED_FALLBACK_EXTENSIONS.includes(ext)) return false

  try {
    const raw = readFileSync(srcFile, "utf-8")
    mkdirSync(path.dirname(destFile), { recursive: true })
    writeFileSync(
      destFile,
      `# ${path.basename(relPath)}\n\nConverted from \`${relPath}\`.\n\n\`\`\`${ext}\n${raw}\n\`\`\`\n`,
      "utf-8",
    )
    injectColdFrontmatter(destFile)
    return true
  } catch {
    return false
  }
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

// ── Binary lookup ────────────────────────────────────────────────────────

import { legacyRapidocrEnabled, markitdownBin, ocrAvailable, rapidocrOcrBin } from "../tools/detection"

function resolveBinary(name: string): string | null {
  // Check vendor dirs first (markitdown-cli, legacy rapidocr-cli)
  if (name === "markitdown-cli") return markitdownBin() ?? null
  if (name === "rapidocr-cli") return rapidocrOcrBin() ?? null
  // Fallback: Bun.which, then PATH
  if (typeof Bun !== "undefined" && Bun.which) {
    return Bun.which(name) ?? null
  }
  const pathDirs = (process.env.PATH || "").split(path.delimiter)
  for (const dir of pathDirs) {
    const full = path.join(dir, name)
    if (existsSync(full)) return full
  }
  return null
}

type CopyDirectResult = "copied" | "skipped" | "failed"

async function copyDirectRawFile(
  srcFile: string,
  destFile: string,
  relPath: string,
  prog: ProgressEmitter,
  onLog?: (msg: string) => void,
  current?: number,
  total?: number,
): Promise<CopyDirectResult> {
  const c = current ?? 0
  const t = total ?? 0
  prog.file("direct-copy", c, t, relPath)
  onLog?.(`  ${relPath}`)

  if (existsSync(destFile)) {
    prog.file("direct-skipped", c, t, relPath)
    onLog?.(`  ${relPath} → skipped`)
    return "skipped"
  }

  // Yield before copy so the "starting" progress event renders
  await new Promise((r) => setTimeout(r, 0))

  if (await safeCopyAsync(srcFile, destFile)) {
    prog.file("direct-copied", c, t, relPath)
    onLog?.(`  ${relPath} → copied`)
    return "copied"
  }

  return "failed"
}

// ── Converter batch (MarkItDown / OCR – same FIFO protocol) ───────────────

interface BatchFileEntry {
  src: string
  rel: string
  dest: string
}

interface ConverterResult {
  converted: number
  skipped: number
}

async function runConverterBatch(
  engine: string,
  binary: string,
  files: BatchFileEntry[],
  sourcePath: string,
  destDir: string,
  logFile: string,
  prog: ProgressEmitter,
  onLog?: (msg: string) => void,
  timeoutMs = 300_000,
): Promise<ConverterResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, ["--batch"], {
      stdio: ["pipe", "pipe", "pipe"],
    })

    let converted = 0
    let skipped = 0
    let currentRel = ""
    let currentPage = ""
    let endCount = 0
    const total = files.length
    let timedOut = false

    const timer = setTimeout(() => {
      timedOut = true
      child.kill("SIGTERM")
      onLog?.(`${engine} timed out after ${timeoutMs}ms — ${endCount}/${total} files processed`)
    }, timeoutMs)

    child.stdin!.write(`SOURCE\t${sourcePath}\n`)
    for (const f of files) {
      child.stdin!.write(`FILE\t${f.src}\t${f.dest}\n`)
    }
    child.stdin!.end()

    const rl = createInterface({ input: child.stderr!, crlfDelay: Infinity })

    rl.on("line", (raw: string) => {
      const line = raw.trim()
      if (!line) return

      const tabIdx = line.indexOf("\t")
      const type = tabIdx >= 0 ? line.slice(0, tabIdx) : line
      const rest = tabIdx >= 0 ? line.slice(tabIdx + 1) : ""

      switch (type) {
        case "BEGIN": {
          currentRel = rest
          onLog?.(`  ${currentRel} → ${engine} ...`)
          currentPage = ""
          break
        }
        case "PROGRESS": {
          currentPage = rest
          break
        }
        case "END": {
          const parts = rest.split("\t")
          const endStatus = parts[0] ?? ""
          const endRel = parts[1] ?? ""
          const endDur = parts[2] ?? "0"

          let outRel: string
          if (engine === "ocr") {
            const dir = path.dirname(endRel)
            const stem = path.basename(endRel, path.extname(endRel))
            outRel = dir === "." ? `${stem}.md` : `${dir}/${stem}.md`
          } else {
            outRel = markitdownOutputRelPath(endRel)
          }
          const outFull = path.join(destDir, outRel)

          endCount++

          if (endStatus === "ok") {
            converted++
            injectColdFrontmatter(outFull)
            const pageFolder = outRel.replace(/\.md$/, "")
            if (pageFolder) {
              const fullPageFolder = path.join(destDir, pageFolder)
              if (existsSync(fullPageFolder)) {
                try {
                  const pageFiles = readdirSync(fullPageFolder).filter((f) => f.startsWith("page-") && f.endsWith(".md")).sort()
                  for (const pf of pageFiles) injectColdFrontmatter(path.join(fullPageFolder, pf))
                } catch { /* page folder exists but may be unreadable */ }
              }
            }
          } else {
            skipped++
          }

          appendNdjson(logFile, {
            ts: isoNow(),
            status: endStatus === "ok" ? "ok" : "fail",
            source: endRel, output: outRel, engine,
            pages: currentPage || "", duration_s: Number.parseFloat(endDur) || 0,
          })

          prog.file(engine, endCount, total, endRel)
          break
        }
      }
    })

    child.on("close", (code) => {
      clearTimeout(timer)
      if (timedOut) { resolve({ converted, skipped }); return }
      if (code !== 0 && code !== null) {
        onLog?.(`${engine} exited ${code} — ${endCount}/${total} files processed`)
      }
      resolve({ converted, skipped })
    })

    child.on("error", (err: Error) => {
      clearTimeout(timer)
      reject(err)
    })
  })
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
        if (retryConverterSingle("markitdown", srcFile, destFile, sourcePath)) {
          injectColdFrontmatter(destFile)
          onLog?.(`    Recovered (markitdown retry): ${relPath}`)
          ok = true
        } else {
          const fallbackDest = path.join(destDir, relPath)
          mkdirSync(path.dirname(fallbackDest), { recursive: true })
          if (await safeCopyAsync(srcFile, fallbackDest)) {
            onLog?.(`    Recovered (source copy fallback, markitdown retry failed): ${relPath}`)
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
        if (ppuConverted > 0 || (legacyRapidocrEnabled() && retryConverterSingle("ocr", srcFile, destFile, sourcePath))) {
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

  const allRecoverable: { src: string; dest: string }[] = []
  const runPhase = (p: "direct" | "markitdown" | "ocr"): boolean => {
    const rp = options?.runPhase ?? "all"
    return rp === "all" || rp === p
  }

  if (runPhase("direct")) {
    const dr = await runDirectPhase(classified.directFiles, prog, options?.onLog)
    res.copied += dr.copied; res.skipped += dr.skipped; res.failed += dr.failed
    allRecoverable.push(...dr.recoverable)
  }

  if (runPhase("markitdown") && options?.markitdownChoice) {
    const mr = await runMarkitdownPhase(classified.markitdownFiles, sourcePath, destDir, prog, options?.onLog)
    res.mdConverted += mr.mdConverted; res.mdSkipped += mr.mdSkipped
    allRecoverable.push(...mr.recoverable)
  }

  if (runPhase("ocr") && options?.ocrChoice) {
    const or = await runOcrPhase(classified.ocrFiles, sourcePath, destDir, { rapidocr: ocrAvailable() }, prog, options?.onLog)
    res.ocrConverted += or.ocrConverted; res.ocrSkipped += or.ocrSkipped
    allRecoverable.push(...or.recoverable)
  }

  res.totalCopied = res.copied + res.mdConverted + res.ocrConverted

  if (options?.verifyAfter !== false) {
    const verifyResult = await verifyAndRecoverImport(sourcePath, destDir, options?.batchManager, options?.markitdownChoice, options?.ocrChoice, options?.onLog)
    res.stillMissing = verifyResult.stillMissing
  }

  options?.onLog?.(`Copy complete: ${res.totalCopied} total (${res.copied} direct, ${res.mdConverted} MarkItDown, ${res.ocrConverted} OCR), ${res.skipped} skipped, ${res.failed} failed, ${res.stillMissing} still missing`)

  return res
}
