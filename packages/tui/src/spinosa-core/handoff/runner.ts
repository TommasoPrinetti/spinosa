import { spawn, spawnSync } from "node:child_process"
import { chmodSync, mkdtempSync, renameSync, writeFileSync } from "node:fs"
import { platform } from "node:os"

function existsOnPath(bin: string): boolean {
  const result = spawnSync("which", [bin], { stdio: "ignore" })
  return result.status === 0
}

export function detectLlmClis(): string[] {
  const results: string[] = []
  const checks: [string, string][] = [
    ["claude", "Claude Code"],
    ["codex", "Codex"],
    ["gemini", "Gemini"],
    ["opencode", "OpenCode"],
    ["spinosa-tui", "OpenCode"],
    ["hermes", "Hermes Agent"],
    ["qwen", "Qwen"],
    ["kilo", "Kilo"],
  ]
  const seen = new Set<string>()
  for (const [bin, label] of checks) {
    if (existsOnPath(bin) && !seen.has(label)) {
      seen.add(label)
      results.push(label)
    }
  }
  if (results.length === 0) results.push("Other (manual)")
  return results
}

export function copyToClipboard(text: string): boolean {
  const os = platform()
  if (os === "darwin") {
    const result = spawnSync("pbcopy", { input: text, encoding: "utf-8" })
    return result.status === 0
  }
  const xclip = spawnSync("which", ["xclip"], { stdio: "ignore" })
  if (xclip.status === 0) {
    const result = spawnSync("xclip", ["-selection", "clipboard"], { input: text, encoding: "utf-8" })
    return result.status === 0
  }
  const xsel = spawnSync("which", ["xsel"], { stdio: "ignore" })
  if (xsel.status === 0) {
    const result = spawnSync("xsel", ["--clipboard", "--input"], { input: text, encoding: "utf-8" })
    return result.status === 0
  }
  return false
}

function detachProcess(command: string, args: string[]): void {
  const proc = spawn(command, args, { detached: true, stdio: "ignore" })
  proc.unref()
}

function launchInTerminal(scriptPath: string): void {
  const os = platform()
  if (os === "darwin") {
    const macScript = scriptPath.replace(/\.sh$/, ".command")
    renameSync(scriptPath, macScript)
    chmodSync(macScript, 0o755)
    detachProcess("open", [macScript])
    return
  }
  if (existsOnPath("x-terminal-emulator")) {
    detachProcess("x-terminal-emulator", ["-e", "bash", scriptPath])
    return
  }
  if (existsOnPath("gnome-terminal")) {
    detachProcess("gnome-terminal", ["--", "bash", scriptPath])
    return
  }
  if (existsOnPath("xterm")) {
    detachProcess("xterm", ["-hold", "-e", "bash", scriptPath])
    return
  }
  spawnSync("bash", [scriptPath], { stdio: "inherit" })
}

function writeLaunchScript(scriptPath: string, scriptBody: string): void {
  writeFileSync(scriptPath, scriptBody, "utf-8")
  chmodSync(scriptPath, 0o755)
}

function createTempDir(): string {
  return mkdtempSync("/tmp/spinosa-launch-XXXXXX")
}

function prepareTempPrompt(dir: string, prompt: string): string {
  const promptPath = `${dir}/prompt.txt`
  writeFileSync(promptPath, prompt, "utf-8")
  return promptPath
}

function promptLaunchScript(
  promptPath: string,
  root: string,
  cliCommand: string,
  dir: string,
): string {
  const scriptPath = `${dir}/launch.sh`
  const escapedPrompt = promptPath.replace(/'/g, "'\\''")
  const escapedRoot = root.replace(/'/g, "'\\''")
  const body = `#!/bin/bash\n_prompt='${escapedPrompt}'\ntrap 'rm -f "$0" "$_prompt"' EXIT\ncd '${escapedRoot}' && ${cliCommand}\n`
  writeLaunchScript(scriptPath, body)
  return scriptPath
}

export function runCliWithPrompt(root: string, cli: string, prompt: string): boolean {
  switch (cli) {
    case "codex": {
      if (!existsOnPath("codex")) return false
      const dir = createTempDir()
      const promptPath = prepareTempPrompt(dir, prompt)
      const escapedRoot = root.replace(/'/g, "'\\''")
      const scriptPath = promptLaunchScript(promptPath, root, `codex -C '${escapedRoot}' "$(cat "$_prompt")"`, dir)
      launchInTerminal(scriptPath)
      return true
    }
    case "codex_app": {
      if (!existsOnPath("codex")) return false
      copyToClipboard(prompt)
      detachProcess("codex", ["app", root])
      return true
    }
    case "opencode": {
      const hasBundledTui = existsOnPath("spinosa-tui")
      const hasSystemOpencode = existsOnPath("opencode")
      if (!hasBundledTui && !hasSystemOpencode) return false
      const dir = createTempDir()
      const promptPath = prepareTempPrompt(dir, prompt)
      const escapedRoot = root.replace(/'/g, "'\\''")
      const cliCommand = hasBundledTui
        ? `npx @spinosa/tui --prompt "$(cat "$_prompt")" '${escapedRoot}'`
        : `opencode --prompt "$(cat "$_prompt")" '${escapedRoot}'`
      const scriptPath = promptLaunchScript(promptPath, root, cliCommand, dir)
      launchInTerminal(scriptPath)
      return true
    }
    case "opencode_desktop": {
      if (!existsOnPath("opencode")) return false
      copyToClipboard(prompt)
      detachProcess("opencode", [root])
      return true
    }
    case "gemini": {
      if (!existsOnPath("gemini")) return false
      const dir = createTempDir()
      const promptPath = prepareTempPrompt(dir, prompt)
      const scriptPath = promptLaunchScript(promptPath, root, `gemini -i "$(cat "$_prompt")"`, dir)
      launchInTerminal(scriptPath)
      return true
    }
    case "qwen": {
      if (!existsOnPath("qwen")) return false
      const dir = createTempDir()
      const promptPath = prepareTempPrompt(dir, prompt)
      const scriptPath = promptLaunchScript(promptPath, root, `qwen -i "$(cat "$_prompt")"`, dir)
      launchInTerminal(scriptPath)
      return true
    }
    case "claude_code": {
      if (!existsOnPath("claude")) return false
      const dir = createTempDir()
      const promptPath = prepareTempPrompt(dir, prompt)
      const scriptPath = promptLaunchScript(promptPath, root, `claude "$(cat "$_prompt")"`, dir)
      launchInTerminal(scriptPath)
      return true
    }
    case "claude_code_desktop": {
      const encodedPrompt = encodeURIComponent(prompt)
      if (platform() === "darwin") {
        detachProcess("open", [`claude://code/new?q=${encodedPrompt}&folder=${root}`])
      } else {
        copyToClipboard(prompt)
      }
      return true
    }
    case "hermes": {
      if (!existsOnPath("hermes")) return false
      copyToClipboard(prompt)
      const dir = createTempDir()
      const scriptPath = `${dir}/launch.sh`
      const escapedRoot = root.replace(/'/g, "'\\''")
      const body = `#!/bin/bash\ntrap 'rm -f "$0"' EXIT\ncd '${escapedRoot}' && hermes chat\n`
      writeLaunchScript(scriptPath, body)
      launchInTerminal(scriptPath)
      return true
    }
    case "kilo": {
      if (!existsOnPath("kilo")) return false
      const dir = createTempDir()
      const promptPath = prepareTempPrompt(dir, prompt)
      const scriptPath = promptLaunchScript(promptPath, root, `kilo "$(cat "$_prompt")"`, dir)
      launchInTerminal(scriptPath)
      return true
    }
    default:
      return false
  }
}

export type HandoffResult =
  | "selected_cli_opened"
  | "launch_command_copied"
  | "run_failed_command_copied"
  | "prompt_copied"
  | "run_requested"

export function handoffSelectedCli(
  root: string,
  cli: string,
  prompt: string,
  launchCommand: string,
): HandoffResult {
  if (cli === "other") {
    copyToClipboard(launchCommand)
    return "launch_command_copied"
  }

  if (runCliWithPrompt(root, cli, prompt)) {
    return "selected_cli_opened"
  }

  copyToClipboard(launchCommand)
  return "run_failed_command_copied"
}
