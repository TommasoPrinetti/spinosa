export function preferredCliName(cli: string): string {
  const names: Record<string, string> = {
    claude_code: "Claude Code",
    claude_code_desktop: "Claude Code Desktop",
    codex: "Codex",
    codex_app: "Codex App",
    gemini: "Gemini",
    qwen: "Qwen",
    opencode: "OpenCode",
    opencode_desktop: "OpenCode Desktop",
    hermes: "Hermes Agent",
    kilo: "Kilo",
    other: "Other",
  }
  return names[cli] ?? cli
}

export function handoffActionLabel(action: string): string {
  const labels: Record<string, string> = {
    copy_command: "Copy launch command",
    run_now: "Run launch command now",
    selected_cli: "Open selected CLI",
  }
  return labels[action] ?? action
}

function shellQuote(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'"
}

function promptCommandSubstitution(prompt: string): string {
  let delimiter = "SPINOSA_STARTUP_PROMPT"
  let suffix = 2
  while (prompt.includes(delimiter)) {
    delimiter = `SPINOSA_STARTUP_PROMPT_${suffix}`
    suffix++
  }
  return `$(cat <<'${delimiter}'\n${prompt}\n${delimiter}\n)`
}

export function buildLaunchCommand(root: string, cli: string, prompt: string): string {
  const qroot = shellQuote(root)
  const qprompt = promptCommandSubstitution(prompt)

  switch (cli) {
    case "codex":
      return `codex -C ${qroot} "${qprompt}"`
    case "codex_app":
      return `codex app ${qroot}`
    case "opencode":
      return `npx @spinosa/tui --prompt "${qprompt}" ${qroot}`
    case "opencode_desktop":
      return `opencode ${qroot}`
    case "gemini":
      return `cd ${qroot} && gemini -i "${qprompt}"`
    case "qwen":
      return `cd ${qroot} && qwen -i "${qprompt}"`
    case "claude_code":
      return `cd ${qroot} && claude "${qprompt}"`
    case "claude_code_desktop": {
      const encodedPrompt = encodeURIComponent(prompt)
      return `open "claude://code/new?q=${encodedPrompt}&folder=${qroot}"`
    }
    case "hermes":
      return `cd ${qroot} && hermes chat`
    case "kilo":
      return `cd ${qroot} && kilo "${qprompt}"`
    default:
      return `cd ${qroot} && <your-llm-cli> "${qprompt}"`
  }
}
