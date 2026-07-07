import { existsSync } from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { IMAGE_EXTENSIONS, MARKITDOWN_EXTENSIONS, extInList } from "../constants"

const require = createRequire(import.meta.url)

function commandOnPath(name: string): boolean {
  if (typeof Bun !== "undefined" && Bun.which) {
    return !!Bun.which(name)
  }
  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    const full = path.join(dir, name)
    if (existsSync(full)) return true
  }
  return false
}

export function ppuPaddleOcrAvailable(): boolean {
  try {
    require.resolve("ppu-paddle-ocr")
    return true
  } catch {
    return false
  }
}

export function ocrAvailable(): boolean {
  return ppuPaddleOcrAvailable()
}

export function pypdfium2Available(): Promise<boolean> {
  return Promise.resolve(commandOnPath("pdftoppm"))
}

export function pypdfAvailable(): Promise<boolean> {
  return Promise.resolve(commandOnPath("pdftotext") && commandOnPath("pdfinfo"))
}

const LLM_COMMANDS = [
  { label: "Anthropic", command: "claude" },
  { label: "Gemini", command: "gemini" },
  { label: "OpenAI", command: "openai" },
  { label: "Codex CLI", command: "codex" },
  { label: "OpenCode", command: "opencode" },
] as const

export function detectLlmTools(): string[] {
  return LLM_COMMANDS.filter(({ command }) => commandOnPath(command)).map(({ label }) => label)
}

export function isOcrImage(ext: string): boolean {
  return extInList(ext, IMAGE_EXTENSIONS)
}

export function isOcrPdf(ext: string): boolean {
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
      markitdownChoice = true
    } else if (ext === "pdf") {
      markitdownChoice = true
      ocrChoice = true
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
