export function pdfjsAvailable(): boolean {
  return true
}

export function pypdfium2Available(): Promise<boolean> {
  return Promise.resolve(true)
}

export function pypdfAvailable(): Promise<boolean> {
  return Promise.resolve(true)
}

const LLM_COMMANDS = [
  { label: "Anthropic", command: "claude" },
  { label: "Gemini", command: "gemini" },
  { label: "OpenAI", command: "openai" },
  { label: "Codex CLI", command: "codex" },
  { label: "OpenCode", command: "opencode" },
] as const

export function detectLlmTools(): string[] {
  return LLM_COMMANDS.filter(({ command }) => {
    if (typeof Bun !== "undefined" && Bun.which) return !!Bun.which(command)
    return false
  }).map(({ label }) => label)
}

export function ocrAvailable(): boolean {
  return true
}
