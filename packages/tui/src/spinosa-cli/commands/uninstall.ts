import { existsSync, rmSync } from "node:fs"
import { homedir } from "node:os"
import type { SpinosaCliIo } from "../io"
import { emitResult } from "../io"

function spinosaHome(): string {
  return process.env.SPINOSA_HOME ?? process.env.SPINOSA_TEMPLATE_ROOT ?? ""
}

function validateHome(home: string): string | undefined {
  if (!home || home === "/" || home === "." || home === ".." || home === homedir() || home === `${homedir()}/`) {
    return "refusing unsafe SPINOSA_HOME"
  }
  if (!home.startsWith("/")) {
    return "SPINOSA_HOME must be an absolute path"
  }
  if (!existsSync(`${home}/metadata`) && !existsSync(`${home}/versions`)) {
    return "does not look like a Spinosa installation"
  }
  return
}

async function confirmUninstall(): Promise<boolean> {
  if (!process.stdin.isTTY) return false

  const stdin = process.stdin
  const stdout = process.stdout

  return new Promise((resolve) => {
    stdin.setRawMode?.(true)
    stdin.resume()
    let selected = 1

    const render = () => {
      stdout.write("\r")
      if (selected === 0) {
        stdout.write(
          `  \x1b[33m\u25c6\x1b[0m  Are you sure you want to uninstall?\n` +
          `  \x1b[2m\u2502\x1b[0m  \x1b[32m\u25cf\x1b[0m Yes / \x1b[2m\u25cb\x1b[0m No\n` +
          `  \x1b[2m\u2514\x1b[0m  \n`,
        )
      } else {
        stdout.write(
          `  \x1b[33m\u25c6\x1b[0m  Are you sure you want to uninstall?\n` +
          `  \x1b[2m\u2502\x1b[0m  \x1b[2m\u25cb\x1b[0m Yes / \x1b[32m\u25cf\x1b[0m No\n` +
          `  \x1b[2m\u2514\x1b[0m  \n`,
        )
      }
    }

    const cleanup = () => {
      stdin.setRawMode?.(false)
      stdin.pause()
      stdin.removeAllListeners("data")
    }

    render()
    const onData = (data: Buffer) => {
      const key = data.toString()
      if (key === "\x1b[A" || key === "\u001b[A") {
        selected = 0
        stdout.write("\x1b[3A")
        render()
      } else if (key === "\x1b[B" || key === "\u001b[B") {
        selected = 1
        stdout.write("\x1b[3A")
        render()
      } else if (key === "\r" || key === "\n") {
        cleanup()
        resolve(selected === 0)
      } else if (key === "\u0003") {
        cleanup()
        resolve(false)
      }
    }
    stdin.on("data", onData)
  })
}

export async function runUninstall(io: SpinosaCliIo, yes: boolean): Promise<number> {
  const home = spinosaHome()
  const validationError = validateHome(home)
  if (validationError) {
    io.error(`Error: ${validationError}: ${home || "<empty>"}`)
    return 1
  }

  if (!yes) {
    if (io.format === "json" || io.format === "quiet") {
      io.error("Uninstall requires --yes in non-interactive mode")
      return 1
    }
    const confirmed = await confirmUninstall()
    if (!confirmed) {
      io.out("Canceled.")
      return 0
    }
  }

  const targets = ["versions", "bin", "lib", "logs", "env.sh"]
  for (const target of targets) {
    const fullPath = `${home}/${target}`
    if (existsSync(fullPath)) {
      rmSync(fullPath, { recursive: true, force: true })
    }
  }

  emitResult(io, "uninstall", { home }, "Spinosa uninstalled. Workspace metadata kept at metadata/")
  return 0
}
