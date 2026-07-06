import { accessSync, existsSync, readdirSync, statSync, statfsSync, constants } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { spawn } from "node:child_process"
import { resolveFrameworkRoot } from "./framework"

export type OnboardingImportOption = {
  ext: string
  count: number
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

type SourceClass = "markdown" | "markitdown" | "native" | "ocr" | "video" | "audio" | "unknown" | "ignored"

export type ToolStatus = {
  rapidocr: boolean
  markitdown: boolean
  pypdfium2: boolean
  pypdf: boolean
}

type ScanTotals = {
  markdown: { count: number; bytes: number }
  markitdown: { count: number; bytes: number }
  native: { count: number; bytes: number }
  ocr: { count: number; bytes: number }
  video: { count: number; bytes: number }
  audio: { count: number; bytes: number }
  unknown: { count: number; bytes: number }
  ignored: { count: number }
}

const MARKDOWN_EXTENSIONS = new Set(
  "txt|rtf|textile|wiki|mediawiki|dokuwiki|pmwiki|outliner|workflowy|dynalist|yaml|yml|toml|css|js|ts|py|rb|sh|log|ini|cfg|conf|tex|bib|org|adoc|rst|tiddlywiki|logseq|roam|obsidian".split(
    "|",
  ),
)
const NATIVE_EXTENSIONS = new Set(["md"])
const MARKITDOWN_EXTENSIONS = new Set(["docx", "pptx", "xlsx", "xls", "epub", "html", "htm", "msg", "zip", "json", "csv", "xml"])
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "tif", "tiff", "bmp", "svg"])
const AUDIO_VIDEO_EXTENSIONS = new Set(["mp4", "mov", "m4v", "avi", "mkv", "webm", "wmv", "mp3", "wav", "m4a", "aac", "flac", "ogg", "opus", "aiff"])
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "m4a", "aac", "flac", "ogg", "opus", "aiff"])
const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "m4v", "avi", "mkv", "webm", "wmv"])

const LLM_TOOL_COMMANDS = [
  { command: "claude", label: "Claude Code" },
  { command: "codex", label: "Codex" },
  { command: "gemini", label: "Gemini" },
  { command: "opencode", label: "OpenCode" },
  { command: "hermes", label: "Hermes Agent" },
  { command: "qwen", label: "Qwen" },
  { command: "kilo", label: "Kilo" },
] as const

function zeroTotals(): ScanTotals {
  return {
    markdown: { count: 0, bytes: 0 },
    markitdown: { count: 0, bytes: 0 },
    native: { count: 0, bytes: 0 },
    ocr: { count: 0, bytes: 0 },
    video: { count: 0, bytes: 0 },
    audio: { count: 0, bytes: 0 },
    unknown: { count: 0, bytes: 0 },
    ignored: { count: 0 },
  }
}

function commandExists(name: string) {
  const envPath = process.env.PATH ?? ""
  for (const directory of envPath.split(path.delimiter)) {
    if (!directory) continue
    const candidate = path.join(directory, name)
    if (existsSync(candidate)) return true
  }
  return false
}

function runCheck(command: string, args: string[]) {
  return new Promise<boolean>((resolve) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "ignore", "ignore"],
    })
    child.on("close", (code) => resolve(code === 0))
    child.on("error", () => resolve(false))
  })
}

function formatBytes(value: number) {
  if (value <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  let size = value
  let index = 0
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024
    index += 1
  }
  return `${size.toFixed(index === 0 ? 0 : 2)} ${units[index]}`
}

function plural(count: number, singular: string, pluralForm?: string) {
  if (count === 1) return `${count} ${singular}`
  return `${count} ${pluralForm ?? `${singular}s`}`
}

function pushScanRow(rows: OnboardingPreviewRow[], total: { count: number; bytes: number }, label: string, detail?: string) {
  if (total.count <= 0) return
  rows.push({
    label,
    status: detail ?? formatBytes(total.bytes),
  })
}

function yieldToEventLoop() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0))
}

function frameworkVendorBin(name: "markitdown-cli" | "rapidocr-cli") {
  const root = resolveFrameworkRoot()
  if (!root) return
  const platform = `${(process.env.OS ?? process.platform).toLowerCase()}-${process.arch === "x64" ? "amd64" : process.arch === "arm64" ? "arm64" : process.arch}`
  const homeBin = path.join(homedir(), ".spinosa", "vendor", `spinosa-${platform}`, name)
  if (existsSync(homeBin)) return homeBin
  const frameworkBin = path.join(root, ".bin", "lib", "vendor", `spinosa-${platform}`, name)
  if (existsSync(frameworkBin)) return frameworkBin
}

function bundledPythonBin() {
  const platform = `${(process.env.OS ?? process.platform).toLowerCase()}-${process.arch === "x64" ? "amd64" : process.arch === "arm64" ? "arm64" : process.arch}`
  const vendorRoot = path.join(homedir(), ".spinosa", "vendor", `spinosa-${platform}`)
  const candidates = [
    path.join(vendorRoot, "python", "bin", "python3"),
    path.join(vendorRoot, "Python.framework", "Versions", "Current", "bin", "python3"),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
}

function fallbackPythonBin() {
  return bundledPythonBin() ?? (commandExists("python3") ? "python3" : undefined)
}

export async function detectDocumentTools(): Promise<ToolStatus> {
  const markitdownBin = frameworkVendorBin("markitdown-cli")
  const rapidocrBin = frameworkVendorBin("rapidocr-cli")
  const python = fallbackPythonBin()

  const [markitdown, rapidocr, pypdfium2, pypdf] = await Promise.all([
    markitdownBin ? runCheck(markitdownBin, ["--check-markitdown"]) : Promise.resolve(false),
    rapidocrBin ? runCheck(rapidocrBin, ["--check-rapidocr"]) : Promise.resolve(false),
    python ? runCheck(python, ["-c", "import pypdfium2"]) : Promise.resolve(false),
    python ? runCheck(python, ["-c", "import pypdf"]) : Promise.resolve(false),
  ])

  return {
    markitdown,
    rapidocr,
    pypdfium2,
    pypdf,
  }
}

export function detectLlmTools() {
  const tools = LLM_TOOL_COMMANDS.filter((item) => commandExists(item.command)).map((item) => item.label)
  return tools.length > 0 ? tools : ["Other (manual)"]
}

function directoryWritable(targetPath: string) {
  const base = existsSync(targetPath) ? targetPath : path.dirname(targetPath)
  try {
    accessSync(base, constants.W_OK)
    return true
  } catch {
    return false
  }
}

function availableDiskBytes(targetPath: string) {
  try {
    const stats = statfsSync(targetPath)
    return stats.bavail * stats.bsize
  } catch {
    return 0
  }
}

function fileExtension(filePath: string) {
  return path.extname(filePath).slice(1).toLowerCase()
}

function isTextBasedPdf(filePath: string) {
  try {
    const sample = Bun.file(filePath).slice(0, 262_144)
    return sample
      .text()
      .then((text) => {
        if (text.includes("/Encrypt")) return false
        return text.includes("/Font") || text.includes("/CIDFont")
      })
      .catch(() => false)
  } catch {
    return Promise.resolve(false)
  }
}

function shouldSkipDirectory(name: string) {
  return (
    name === ".git" ||
    name === "node_modules" ||
    name === "__MACOSX" ||
    name === ".trash" ||
    name.endsWith(".app") ||
    name.endsWith(".photoslibrary")
  )
}

function shouldSkipFile(name: string, entryPath: string) {
  const lower = name.toLowerCase()
  return (
    lower === "agents.md" ||
    lower === ".ds_store" ||
    lower === ".localized" ||
    lower === ".gitkeep" ||
    lower.startsWith("._") ||
    entryPath.includes(`${path.sep}.git${path.sep}`) ||
    entryPath.includes(`${path.sep}node_modules${path.sep}`)
  )
}

async function classifySourceFile(filePath: string): Promise<SourceClass> {
  const ext = fileExtension(filePath)
  if (!ext) return "unknown"
  if (NATIVE_EXTENSIONS.has(ext)) return "native"
  if (MARKDOWN_EXTENSIONS.has(ext)) return "markdown"
  if (MARKITDOWN_EXTENSIONS.has(ext)) return "markitdown"
  if (ext === "pdf") return (await isTextBasedPdf(filePath)) ? "markitdown" : "ocr"
  if (IMAGE_EXTENSIONS.has(ext)) return "ocr"
  if (VIDEO_EXTENSIONS.has(ext)) return "video"
  if (AUDIO_EXTENSIONS.has(ext)) return "audio"
  if (AUDIO_VIDEO_EXTENSIONS.has(ext)) return "video"
  return "unknown"
}

async function scanSource(sourcePath: string) {
  const totals = zeroTotals()
  const extCounts = new Map<string, number>()
  let processedEntries = 0

  async function walk(currentPath: string): Promise<void> {
    for (const entry of readdirSync(currentPath, { withFileTypes: true })) {
      processedEntries += 1
      if (processedEntries % 128 === 0) {
        await yieldToEventLoop()
      }

      const entryPath = path.join(currentPath, entry.name)
      if (entry.isDirectory()) {
        if (shouldSkipDirectory(entry.name)) continue
        await walk(entryPath)
        continue
      }

      if (!entry.isFile()) continue
      if (shouldSkipFile(entry.name, entryPath)) {
        totals.ignored.count += 1
        continue
      }

      const bytes = statSync(entryPath).size
      const ext = fileExtension(entry.name)
      const klass = await classifySourceFile(entryPath)
      if (ext) {
        extCounts.set(ext, (extCounts.get(ext) ?? 0) + 1)
      }

      if (klass === "markdown") {
        totals.markdown.count += 1
        totals.markdown.bytes += bytes
      } else if (klass === "markitdown") {
        totals.markitdown.count += 1
        totals.markitdown.bytes += bytes
      } else if (klass === "native") {
        totals.native.count += 1
        totals.native.bytes += bytes
      } else if (klass === "ocr") {
        totals.ocr.count += 1
        totals.ocr.bytes += bytes
      } else if (klass === "video") {
        totals.video.count += 1
        totals.video.bytes += bytes
      } else if (klass === "audio") {
        totals.audio.count += 1
        totals.audio.bytes += bytes
      } else if (klass === "unknown") {
        totals.unknown.count += 1
        totals.unknown.bytes += bytes
      }
    }
  }

  await walk(sourcePath)

  const importOptions = [...extCounts.entries()]
    .map(([ext, count]) => ({
      ext,
      count,
      selected: !AUDIO_VIDEO_EXTENSIONS.has(ext),
    }))
    .sort((left, right) => left.ext.localeCompare(right.ext))

  return { totals, importOptions }
}

function buildScanRows(scan: Awaited<ReturnType<typeof scanSource>>): OnboardingPreviewRow[] {
  const scanRows: OnboardingPreviewRow[] = [
    {
      label: "Source scan",
      status: "complete",
      tone: "success",
    },
  ]
  pushScanRow(scanRows, scan.totals.native, `${plural(scan.totals.native.count, "native-readable file")} to copy unchanged`)
  pushScanRow(scanRows, scan.totals.markitdown, `${plural(scan.totals.markitdown.count, "MarkItDown/structured file")} available for Markdown conversion`)
  pushScanRow(scanRows, scan.totals.ocr, `${plural(scan.totals.ocr.count, "scanned PDF and image")} available for OCR`)
  pushScanRow(
    scanRows,
    scan.totals.video,
    `${plural(scan.totals.video.count, "video")} available (not selected by default)`,
  )
  pushScanRow(
    scanRows,
    scan.totals.audio,
    `${plural(scan.totals.audio.count, "audio file")} available (not selected by default)`,
  )
  pushScanRow(scanRows, scan.totals.markdown, `${plural(scan.totals.markdown.count, "text-based file")} to rename to .md`)
  pushScanRow(scanRows, scan.totals.unknown, `${plural(scan.totals.unknown.count, "file")} unsupported or unknown`)
  if (scan.totals.ignored.count > 0) {
    scanRows.push({
      label: `${plural(scan.totals.ignored.count, "file")} skipped`,
      status: "system/dotfile",
      tone: "muted",
    })
  }
  return scanRows
}

export function resolveUserPath(value: string) {
  if (!value) return
  const trimmed = value.trim()
  if (!trimmed) return
  const expanded = trimmed === "~" ? homedir() : trimmed.startsWith("~/") ? path.join(homedir(), trimmed.slice(2)) : trimmed
  return path.resolve(expanded)
}

export function suggestWorkspacePath(sourcePath: string) {
  const resolved = resolveUserPath(sourcePath)
  if (!resolved) return
  const corpusName = path.basename(resolved)
  const parentDir = path.dirname(resolved)
  const base = path.join(parentDir, `${corpusName}-spinosa`)
  let candidate = base
  let index = 2
  while (existsSync(candidate)) {
    candidate = `${base}-${index}`
    index += 1
  }
  return candidate
}

export async function buildImportScanPreview(sourcePathInput: string): Promise<ImportScanPreview> {
  const sourcePath = resolveUserPath(sourcePathInput)
  if (!sourcePath) {
    throw new Error("Source path is required.")
  }

  const scan = await scanSource(sourcePath)

  return {
    projectName: path.basename(sourcePath) || "workspace",
    sourcePath,
    scanRows: buildScanRows(scan),
    importOptions: scan.importOptions,
  }
}

export async function buildNewWorkspacePreview(sourcePathInput: string): Promise<NewWorkspacePreview> {
  const sourcePath = resolveUserPath(sourcePathInput)
  if (!sourcePath) {
    throw new Error("Source path is required.")
  }
  const workspacePath = suggestWorkspacePath(sourcePath)
  if (!workspacePath) {
    throw new Error("Could not derive workspace path.")
  }

  const [toolStatus, scan] = await Promise.all([detectDocumentTools(), scanSource(sourcePath)])
  const llmTools = detectLlmTools()
  const workspaceWritable = directoryWritable(workspacePath)
  const freeBytes = availableDiskBytes(path.dirname(workspacePath))

  const preflightRows: OnboardingPreviewRow[] = [
    {
      label: "Workspace",
      status: workspaceWritable ? "writable" : "blocked",
      detail: path.basename(workspacePath),
      tone: workspaceWritable ? "success" : "error",
    },
    {
      label: "RapidOCR",
      status: toolStatus.rapidocr ? "available" : "missing",
      detail: toolStatus.rapidocr ? "scanned PDFs and images" : "scanned PDFs and images skipped",
      tone: toolStatus.rapidocr ? "success" : "error",
    },
    {
      label: "MarkItDown",
      status: toolStatus.markitdown ? "available" : "missing",
      detail: toolStatus.markitdown ? "Office docs, structured data, EPUB, HTML, text PDFs" : "Office docs, EPUB, HTML, and text PDFs skipped",
      tone: toolStatus.markitdown ? "success" : "error",
    },
    {
      label: "pypdfium2",
      status: toolStatus.pypdfium2 ? "available" : "missing",
      detail: toolStatus.pypdfium2 ? "scanned PDF rendering" : "scanned PDF rendering unavailable",
      tone: toolStatus.pypdfium2 ? "success" : "error",
    },
    {
      label: "pypdf",
      status: toolStatus.pypdf ? "available" : "missing",
      detail: toolStatus.pypdf ? "text PDF splitting" : "multi-page text PDFs not split",
      tone: toolStatus.pypdf ? "success" : "error",
    },
    {
      label: "Free space",
      status: formatBytes(freeBytes),
      tone: "muted",
    },
    {
      label: "Tools",
      status: llmTools.join(", "),
      tone: "muted",
    },
  ]

  return {
    projectName: path.basename(sourcePath) || "workspace",
    sourcePath,
    workspacePath,
    preflightRows,
    scanRows: buildScanRows(scan),
    importOptions: scan.importOptions,
  }
}
