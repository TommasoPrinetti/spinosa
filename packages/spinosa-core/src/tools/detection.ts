import { existsSync, accessSync, constants } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"
import { resolveFrameworkRoot } from "../framework/discovery"
import { IMAGE_EXTENSIONS, MARKITDOWN_EXTENSIONS, extInList } from "../constants"

const platform = `${process.platform === "darwin" ? "darwin" : "linux"}-${process.arch === "arm64" ? "arm64" : "amd64"}`
const require = createRequire(import.meta.url)

function isExecutable(filePath: string): boolean {
  try {
    accessSync(filePath, constants.X_OK)
    return true
  } catch {
    return false
  }
}

function commandOnPath(name: string): boolean {
  const envPath = process.env.PATH ?? ""
  for (const dir of envPath.split(path.delimiter)) {
    if (!dir) continue
    const candidate = path.join(dir, name)
    if (isExecutable(candidate)) return true
  }
  return false
}

function unifiedVendorDir(): string {
  return path.join(homedir(), ".spinosa", "vendor", `spinosa-${platform}`)
}

function frameworkVendorDir(): string | undefined {
  const root = resolveFrameworkRoot()
  if (!root) return undefined
  return path.join(root, ".bin", "lib", "vendor", `spinosa-${platform}`)
}

export function vendorPythonForTool(toolPath: string): string | undefined {
  const vendorDir = path.dirname(toolPath)
  const candidates = [
    path.join(vendorDir, "python", "bin", "python3"),
    path.join(vendorDir, "Python.framework", "Versions", "Current", "bin", "python3"),
  ]
  for (const candidate of candidates) {
    if (isExecutable(candidate)) return candidate
  }
  return undefined
}

export function markitdownToolAvailable(toolPath: string): boolean {
  if (!isExecutable(toolPath)) return false
  const result = spawnSync(toolPath, ["--check-markitdown"], {
    stdio: ["ignore", "pipe", "pipe"],
  })
  if (result.status === 0) return true
  const output = (result.stdout?.toString() ?? "") + (result.stderr?.toString() ?? "")
  if (output.includes("unrecognized arguments: --check-markitdown")) {
    const pythonBin = vendorPythonForTool(toolPath)
    if (!pythonBin) return false
    const pyResult = spawnSync(pythonBin, ["-c", "from markitdown import MarkItDown"], {
      stdio: ["ignore", "pipe", "pipe"],
    })
    return pyResult.status === 0
  }
  return false
}

export function rapidocrToolAvailable(toolPath: string): boolean {
  if (!isExecutable(toolPath)) return false
  const result = spawnSync(toolPath, ["--check-rapidocr"], {
    stdio: ["ignore", "pipe", "pipe"],
  })
  if (result.status === 0) return true
  const output = (result.stdout?.toString() ?? "") + (result.stderr?.toString() ?? "")
  if (output.includes("unrecognized arguments: --check-rapidocr")) {
    const pythonBin = vendorPythonForTool(toolPath)
    if (!pythonBin) return false
    const pyResult = spawnSync(pythonBin, ["-c", "from rapidocr import RapidOCR; import onnxruntime; import pypdfium2"], {
      stdio: ["ignore", "pipe", "pipe"],
    })
    return pyResult.status === 0
  }
  return false
}

export function rapidocrOcrAvailable(): boolean {
  const unifiedBin = path.join(unifiedVendorDir(), "rapidocr-cli")
  if (rapidocrToolAvailable(unifiedBin)) return true
  const fwDir = frameworkVendorDir()
  if (fwDir) {
    const frameworkBin = path.join(fwDir, "rapidocr-cli")
    if (rapidocrToolAvailable(frameworkBin)) return true
  }
  return false
}

export function rapidocrOcrBin(): string | undefined {
  const unifiedBin = path.join(unifiedVendorDir(), "rapidocr-cli")
  if (isExecutable(unifiedBin)) return unifiedBin
  const fwDir = frameworkVendorDir()
  if (fwDir) {
    const frameworkBin = path.join(fwDir, "rapidocr-cli")
    if (isExecutable(frameworkBin)) return frameworkBin
  }
  return undefined
}

export function ppuPaddleOcrAvailable(): boolean {
  try {
    require.resolve("ppu-paddle-ocr")
    return true
  } catch {
    return false
  }
}

export function legacyRapidocrEnabled(): boolean {
  return process.env.SPINOSA_USE_LEGACY_RAPIDOCR === "1"
}

export function ocrAvailable(): boolean {
  if (ppuPaddleOcrAvailable()) return true
  return legacyRapidocrEnabled() && rapidocrOcrAvailable()
}

export function markitdownAvailable(): boolean {
  const unifiedBin = path.join(unifiedVendorDir(), "markitdown-cli")
  if (markitdownToolAvailable(unifiedBin)) return true
  const fwDir = frameworkVendorDir()
  if (fwDir) {
    const frameworkBin = path.join(fwDir, "markitdown-cli")
    if (markitdownToolAvailable(frameworkBin)) return true
  }
  return false
}

export function markitdownBin(): string | undefined {
  const unifiedBin = path.join(unifiedVendorDir(), "markitdown-cli")
  if (isExecutable(unifiedBin)) return unifiedBin
  const fwDir = frameworkVendorDir()
  if (fwDir) {
    const frameworkBin = path.join(fwDir, "markitdown-cli")
    if (isExecutable(frameworkBin)) return frameworkBin
  }
  return undefined
}

export function pypdfium2Available(): Promise<boolean> {
  return Promise.resolve(commandOnPath("pdftoppm"))
}

export function pypdfAvailable(): Promise<boolean> {
  if (commandOnPath("pdftotext") && commandOnPath("pdfinfo")) return Promise.resolve(true)
  const pythonBin = fallbackPythonBin()
  if (!pythonBin) return Promise.resolve(false)
  const result = spawnSync(pythonBin, ["-c", "import pypdf"], {
    stdio: ["ignore", "pipe", "pipe"],
  })
  return Promise.resolve(result.status === 0)
}

export function bundledPythonBin(): string | undefined {
  const vendorRoot = unifiedVendorDir()
  const candidates = [
    path.join(vendorRoot, "python", "bin", "python3"),
    path.join(vendorRoot, "Python.framework", "Versions", "Current", "bin", "python3"),
  ]
  for (const candidate of candidates) {
    if (isExecutable(candidate)) return candidate
  }
  return undefined
}

export function fallbackPythonBin(): string | undefined {
  const bundled = bundledPythonBin()
  if (bundled) return bundled
  if (commandOnPath("python3")) return "python3"
  return undefined
}

export function markitdownScriptPath(): string | undefined {
  const root = resolveFrameworkRoot()
  if (!root) return undefined
  const script = path.join(root, ".bin", "lib", "markitdown-cli.py")
  return existsSync(script) ? script : undefined
}

export function structuredFallbackAvailable(): boolean {
  const pythonBin = fallbackPythonBin()
  if (!pythonBin) return false
  const scriptPath = markitdownScriptPath()
  if (!scriptPath) return false
  return true
}

const LLM_COMMANDS = [
  { command: "claude", label: "Claude Code" },
  { command: "codex", label: "Codex" },
  { command: "gemini", label: "Gemini" },
  { command: "opencode", label: "OpenCode" },
  { command: "hermes", label: "Hermes Agent" },
  { command: "qwen", label: "Qwen" },
  { command: "kilo", label: "Kilo" },
] as const

export function detectLlmTools(): string[] {
  return LLM_COMMANDS.filter(({ command }) => commandOnPath(command)).map(({ label }) => label)
}

export function isRapidocrImage(ext: string): boolean {
  return extInList(ext, IMAGE_EXTENSIONS)
}

export function isRapidocrPdf(ext: string): boolean {
  return ext === "pdf"
}

export interface ToolChoices {
  markitdownChoice: boolean
  ocrChoice: boolean
}

export function configureSelectedImportTools(
  selectedExtensions: string[],
): { choices: ToolChoices; warnings: string[]; ok: boolean } {
  let markitdownChoice = false
  let ocrChoice = false
  const warnings: string[] = []

  for (const ext of selectedExtensions) {
    if (extInList(ext, MARKITDOWN_EXTENSIONS)) {
      if (markitdownAvailable()) {
        markitdownChoice = true
      } else {
        warnings.push(`MarkItDown is required for .${ext} but is not available.`)
      }
    } else if (ext === "pdf") {
      if (markitdownAvailable()) markitdownChoice = true
      if (ocrAvailable()) ocrChoice = true
      if (!markitdownAvailable() && !ocrAvailable()) {
        warnings.push("PDF import requires MarkItDown or PPU PaddleOCR, but neither converter is available.")
      }
    } else if (extInList(ext, IMAGE_EXTENSIONS)) {
      if (ocrAvailable()) {
        ocrChoice = true
      } else {
        warnings.push(`PPU PaddleOCR is required for .${ext} but is not available.`)
      }
    }
  }

  return { choices: { markitdownChoice, ocrChoice }, warnings, ok: warnings.length === 0 }
}
