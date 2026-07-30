import { createReadStream, openSync } from "node:fs"
import { createInterface } from "node:readline/promises"
import type { Readable, Writable } from "node:stream"

export interface ConfirmPromptOptions {
  input?: Readable
  output?: Writable
}

function controllingTerminalInput(): { input: Readable; owned: boolean } {
  if (process.stdin.isTTY) return { input: process.stdin, owned: false }

  try {
    const fd = openSync("/dev/tty", "r")
    return { input: createReadStream("/dev/tty", { fd, autoClose: true }), owned: true }
  } catch {
    if (process.stdin.readable && !process.stdin.destroyed) {
      return { input: process.stdin, owned: false }
    }
    throw new Error("Cannot read from the terminal. Re-run with --yes to skip prompts.")
  }
}

export async function confirmPrompt(
  question: string,
  defaultYes = false,
  options: ConfirmPromptOptions = {},
): Promise<boolean> {
  const selected = options.input
    ? { input: options.input, owned: false }
    : controllingTerminalInput()
  const output = options.output ?? process.stdout
  const prompt = createInterface({ input: selected.input, output, terminal: false })
  const hint = defaultYes ? "[Y/n]" : "[y/N]"

  try {
    const answer = (await prompt.question(`${question} ${hint} `)).trim().toLowerCase()
    if (!answer) return defaultYes
    return answer === "y" || answer === "yes"
  } catch (error) {
    throw new Error(
      `Cannot read from the terminal. Re-run with --yes to skip prompts.${
        error instanceof Error && error.message ? ` (${error.message})` : ""
      }`,
    )
  } finally {
    prompt.close()
    if (selected.owned) selected.input.destroy()
  }
}
