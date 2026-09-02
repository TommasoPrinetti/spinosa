import { existsSync } from "node:fs"
import path from "node:path"
import { spawn } from "node:child_process"
import { resolveFrameworkRoot } from "@spinosa/core/framework/discovery"
import { readBundledFrameworkVersion } from "./service"
import { tuiLog } from "./log"
import type { CliRunResult } from "./types"

const REINSTALL_TIMEOUT_MS = 120_000

export type ReinstallInput = {
  channel?: string
  onStdout?: (chunk: string) => void
  onStderr?: (chunk: string) => void
}

/** Strip terminal control output before it is appended to a TUI log. */
export function cleanReinstallOutput(value: string): string {
  return value
    .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "")
    .replace(/\r/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim()
}

/** Reinstall the bundled vendor tools through the framework installer. */
export async function runReinstall(
  input?: ReinstallInput,
): Promise<CliRunResult> {
  tuiLog("runReinstall (bash)")

  const fwRoot = resolveFrameworkRoot()
  if (!fwRoot) {
    const msg = "Framework root not found — cannot reinstall vendor tools."
    input?.onStderr?.(msg + "\n")
    return { exitCode: 1, stdout: "", stderr: msg }
  }

  const localInstaller = path.join(fwRoot, "install.sh")
  if (!existsSync(localInstaller)) {
    const msg = "install.sh not found in framework root."
    input?.onStderr?.(msg + "\n")
    return { exitCode: 1, stdout: "", stderr: msg }
  }

  const version = await readBundledFrameworkVersion()
  if (!version) {
    const msg = "Could not read bundled framework version."
    input?.onStderr?.(msg + "\n")
    return { exitCode: 1, stdout: "", stderr: msg }
  }

  input?.onStdout?.(`Reinstalling vendor tools for v${version}...\n`)

  return new Promise<CliRunResult>((resolve) => {
    let timedOut = false
    let stdout = ""
    let stderr = ""

    const timer = setTimeout(() => {
      timedOut = true
      child.kill("SIGTERM")
      resolve({
        exitCode: 124,
        stdout,
        stderr: "Reinstall timed out after 120s.",
      })
    }, REINSTALL_TIMEOUT_MS)

    const child = spawn(
      "bash",
      [
        localInstaller,
        "--reinstall",
        "--version",
        version,
        "--yes",
        "--no-launch",
        "--no-bundled-tools",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    )

    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf-8")
      stdout += text
      const clean = cleanReinstallOutput(text)
      if (clean) input?.onStdout?.(clean + "\n")
    })
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf-8")
      stderr += text
      const clean = cleanReinstallOutput(text)
      if (clean) input?.onStderr?.(clean + "\n")
    })

    const done = (code: number | null) => {
      clearTimeout(timer)
      if (timedOut) return
      if (code === 0) {
        input?.onStdout?.("Reinstall complete.\n")
        resolve({ exitCode: 0, stdout, stderr })
      } else {
        resolve({ exitCode: code ?? 1, stdout, stderr })
      }
    }
    child.on("close", (code) => done(code))
    child.on("error", (err) => {
      clearTimeout(timer)
      resolve({ exitCode: 1, stdout, stderr: err.message })
    })
  })
}
