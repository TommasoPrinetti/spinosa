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

export function buildLaunchCommand(root: string, cli: string, prompt: string): string {
  const qroot = shellQuote(root)

  switch (cli) {
    case "codex":
      return `codex -C ${qroot} "$(cat <<'SPINOSA_STARTUP_PROMPT'\n${prompt}\nSPINOSA_STARTUP_PROMPT\n)"`
    case "codex_app":
      return `codex app ${qroot}`
    case "opencode":
      return `npx @spinosa/tui --prompt "$(cat <<'SPINOSA_STARTUP_PROMPT'\n${prompt}\nSPINOSA_STARTUP_PROMPT\n)" ${qroot}`
    case "opencode_desktop":
      return `opencode ${qroot}`
    case "gemini":
      return `cd ${qroot} && gemini -i "$(cat <<'SPINOSA_STARTUP_PROMPT'\n${prompt}\nSPINOSA_STARTUP_PROMPT\n)"`
    case "qwen":
      return `cd ${qroot} && qwen -i "$(cat <<'SPINOSA_STARTUP_PROMPT'\n${prompt}\nSPINOSA_STARTUP_PROMPT\n)"`
    case "claude_code":
      return `cd ${qroot} && claude "$(cat <<'SPINOSA_STARTUP_PROMPT'\n${prompt}\nSPINOSA_STARTUP_PROMPT\n)"`
    case "claude_code_desktop": {
      const encodedPrompt = encodeURIComponent(prompt)
      return `open "claude://code/new?q=${encodedPrompt}&folder=${qroot}"`
    }
    case "hermes":
      return `cd ${qroot} && hermes chat`
    case "kilo":
      return `cd ${qroot} && kilo "$(cat <<'SPINOSA_STARTUP_PROMPT'\n${prompt}\nSPINOSA_STARTUP_PROMPT\n)"`
    default:
      return `cd ${qroot} && <your-llm-cli> "$(cat <<'SPINOSA_STARTUP_PROMPT'\n${prompt}\nSPINOSA_STARTUP_PROMPT\n)"`
  }
}
