let _pdfjsAvailable: boolean | undefined

export function pdfjsAvailable(): boolean {
  if (_pdfjsAvailable !== undefined) return _pdfjsAvailable
  try {
    require.resolve("pdfjs-dist/legacy/build/pdf.mjs")
    _pdfjsAvailable = true
  } catch {
    _pdfjsAvailable = false
  }
  return _pdfjsAvailable
}

export async function pypdfium2Available(): Promise<boolean> {
  try {
    require.resolve("pypdfium2")
    return true
  } catch {
    return false
  }
}

export async function pypdfAvailable(): Promise<boolean> {
  try {
    require.resolve("pypdf")
    return true
  } catch {
    return false
  }
}

const LLM_COMMANDS = [
  { label: "Anthropic", command: "claude" },
  { label: "Gemini", command: "gemini" },
  { label: "OpenAI", command: "openai" },
  { label: "Codex CLI", command: "codex" },
  { label: "Spinosa", command: "spinosa" },
] as const

export function detectLlmTools(): string[] {
  return LLM_COMMANDS.filter(({ command }) => {
    if (typeof Bun !== "undefined" && Bun.which) return !!Bun.which(command)
    return false
  }).map(({ label }) => label)
}

let _ocrAvailable: boolean | undefined

export function ocrAvailable(): boolean {
  if (_ocrAvailable !== undefined) return _ocrAvailable
  try {
    require.resolve("ppu-paddle-ocr")
    _ocrAvailable = true
  } catch {
    _ocrAvailable = false
  }
  return _ocrAvailable
}
