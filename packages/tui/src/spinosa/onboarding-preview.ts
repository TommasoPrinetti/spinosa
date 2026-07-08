import { existsSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { detectLlmTools as coreDetectLlmTools } from "@opencode-ai/spinosa-core/tools/detection"
import { resolveUserPath } from "@opencode-ai/spinosa-core/utils/path"
import { pluralCount } from "@opencode-ai/spinosa-core/utils/string"
import { fileExt } from "@opencode-ai/spinosa-core/constants"
import { shouldSkipSourceFile, classifySourceFile } from "@opencode-ai/spinosa-core/extension/classifier"
import { suggestWorkspacePath as coreSuggestWorkspacePath } from "@opencode-ai/spinosa-core/scan/scanner"
import { detectDocumentTools as coreDetectDocumentTools } from "@opencode-ai/spinosa-core/scan/scanner"
import type { ToolStatus as CoreToolStatus } from "@opencode-ai/spinosa-core/scan/scanner"

export type OnboardingImportOption = {
  ext: string
  count: number
  bytes: number
  selected: boolean
}

export type OnboardingPreviewRow = {
  label: string
  status: string
  detail?: string
  tone?: "normal" | "muted" | "success" | "error"
}

export type NewWorkspacePreview = {
  projectName: string
  sourcePath: string
  workspacePath: string
  preflightRows: OnboardingPreviewRow[]
  scanRows: OnboardingPreviewRow[]
  importOptions: OnboardingImportOption[]
}

export type ImportScanPreview = {
  projectName: string
  sourcePath: string
  scanRows: OnboardingPreviewRow[]
  importOptions: OnboardingImportOption[]
}

export type ToolStatus = CoreToolStatus

// ── Per-extension scan ───────────────────────────────────────────────

type ExtEntry = { ext: string; count: number; bytes: number }

function shouldSkipScanDir(name: string) {
  return name === ".git" || name === "node_modules" || name === "__MACOSX" || name === ".trash" || name.endsWith(".app") || name.endsWith(".photoslibrary")
}

async function scanByExtension(sourcePath: string): Promise<{
  extMap: Map<string, ExtEntry>
  totals: { markdown: number; markitdown: number; native: number; ocr: number; video: number; audio: number; unknown: number; ignored: number; total: number }
}> {
  const extMap = new Map<string, ExtEntry>()
  const totals = { markdown: 0, markitdown: 0, native: 0, ocr: 0, video: 0, audio: 0, unknown: 0, ignored: 0, total: 0 }

  async function walk(dir: string) {
    let entries: string[]
    try { entries = readdirSync(dir) } catch { return }
    for (const entry of entries) {
      if (entry.startsWith(".") && entry !== "." && entry !== "..") continue
      const fullPath = path.join(dir, entry)
      let st: ReturnType<typeof statSync>
      try { st = statSync(fullPath) } catch { continue }
      if (st.isDirectory()) {
        if (shouldSkipScanDir(entry)) continue
        await walk(fullPath)
        continue
      }
      if (!st.isFile()) continue
      if (shouldSkipSourceFile(fullPath)) { totals.ignored++; continue }
      const ext = fileExt(fullPath)
      try {
        const cls = await classifySourceFile(fullPath)
        switch (cls) {
          case "markdown": totals.markdown++; break
          case "markitdown": totals.markitdown++; break
          case "native": totals.native++; break
          case "ocr_convertible": totals.ocr++; break
          case "video": totals.video++; break
          case "audio": totals.audio++; break
          default: totals.unknown++; break
        }
      } catch {
        // ignored — classifySourceFile may throw on unreadable files
        totals.unknown++; continue
      }
      const existing = extMap.get(ext)
      if (existing) { existing.count++ }
      else { extMap.set(ext, { ext, count: 1, bytes: st.size }) }
    }
  }

  await walk(sourcePath)
  return { extMap, totals }
}

// ── Build scan rows (for display) ────────────────────────────────────

function buildScanRows(totals: { markdown: number; markitdown: number; native: number; ocr: number; video: number; audio: number; unknown: number; ignored: number }): OnboardingPreviewRow[] {
  const rows: OnboardingPreviewRow[] = []
  const push = (count: number, label: string) => {
    if (count > 0) rows.push({ label, status: `${count} file${count === 1 ? "" : "s"}` })
  }
  push(totals.markdown, "Text-based files to rename")
  push(totals.markitdown, "Office docs / HTML / EPUB / text PDFs")
  push(totals.native, "Native Markdown to copy")
  push(totals.ocr, "Scanned PDFs and images for OCR")
  push(totals.video, "Videos")
  push(totals.audio, "Audio")
  if (totals.unknown > 0) rows.push({ label: "Unknown files", status: `${pluralCount(totals.unknown, "file")} unsupported`, tone: "muted" })
  if (totals.ignored > 0) rows.push({ label: "Ignored", status: `${pluralCount(totals.ignored, "file")} skipped`, tone: "muted" })
  return rows
}

// ── Build import options (per extension, for toggles) ────────────────

function extToImportOptions(extMap: Map<string, ExtEntry>): OnboardingImportOption[] {
  const options: OnboardingImportOption[] = []
  // Audio/video are NOT selected by default — same as Bash MULTI_CHOOSE_EXCLUDE
  const audioExts = new Set(["mp3", "wav", "m4a", "aac", "flac", "ogg", "opus", "aiff"])
  const videoExts = new Set(["mp4", "mov", "m4v", "avi", "mkv", "webm", "wmv"])

  for (const [ext, entry] of extMap) {
    const isAv = audioExts.has(ext) || videoExts.has(ext)
    options.push({
      ext,
      count: entry.count,
      bytes: entry.bytes,
      selected: !isAv,
    })
  }
  options.sort((a, b) => a.ext.localeCompare(b.ext))
  return options
}

function buildPreflightRows(workspacePath: string, toolStatus: ToolStatus): OnboardingPreviewRow[] {
  const rows: OnboardingPreviewRow[] = []
  rows.push({ label: "Workspace", status: "writable", detail: path.basename(workspacePath), tone: "success" })
  rows.push({ label: "PPU PaddleOCR", status: "available", tone: "success" })
  rows.push({ label: "MarkItDown", status: toolStatus.markitdown ? "available" : "missing", tone: toolStatus.markitdown ? "success" : "error" })
  rows.push({ label: "pdftoppm", status: toolStatus.pypdfium2 ? "available" : "missing", tone: toolStatus.pypdfium2 ? "success" : "error" })
  rows.push({ label: "pdftotext", status: toolStatus.pypdf ? "available" : "missing", tone: toolStatus.pypdf ? "success" : "error" })
  return rows
}

export async function detectDocumentTools(): Promise<ToolStatus> {
  return coreDetectDocumentTools()
}

export function detectLlmTools(): string[] {
  return coreDetectLlmTools()
}

function resolveWorkspacePath(projectName: string): string {
  const cwd = process.cwd()
  return coreSuggestWorkspacePath(cwd) ?? path.join(path.dirname(cwd), `${projectName}-spinosa`)
}

export async function buildNewWorkspacePreview(sourcePath: string): Promise<NewWorkspacePreview> {
  const projectName = path.basename(sourcePath)
  const workspacePath = resolveWorkspacePath(projectName)
  const toolStatus = await detectDocumentTools()
  const { extMap, totals } = await scanByExtension(sourcePath)

  return {
    projectName,
    sourcePath,
    workspacePath,
    preflightRows: buildPreflightRows(workspacePath, toolStatus),
    scanRows: buildScanRows(totals),
    importOptions: extToImportOptions(extMap),
  }
}

export async function buildImportScanPreview(sourcePath: string): Promise<ImportScanPreview> {
  const projectName = path.basename(sourcePath)
  const workspacePath = resolveWorkspacePath(projectName)
  const { extMap, totals } = await scanByExtension(sourcePath)

  return {
    projectName,
    sourcePath,
    scanRows: buildScanRows(totals),
    importOptions: extToImportOptions(extMap),
  }
}

export { resolveUserPath } from "@opencode-ai/spinosa-core/utils/path"
export { suggestWorkspacePath } from "@opencode-ai/spinosa-core/scan/scanner"
