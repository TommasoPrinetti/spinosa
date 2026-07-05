import { existsSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { spawn } from "node:child_process"
import { resolveFrameworkBin, resolveFrameworkRoot } from "./framework"
import type { CliRunResult } from "./types"

const CANDIDATE_BINS = [
  () => process.env.SPINOSA_BIN,
  () => resolveFrameworkBin(),
  () => path.join(homedir(), ".spinosa", "bin", "spinosa"),
  (workspacePath?: string) =>
    workspacePath ? path.join(workspacePath, ".bin", "spinosa") : undefined,
  () => path.join(homedir(), "Documents", "spinosa-main", ".bin", "spinosa"),
]

export async function resolveSpinosaBin(workspacePath?: string): Promise<string | undefined> {
  for (const candidate of CANDIDATE_BINS) {
    const value = candidate(workspacePath)
    if (value && existsSync(value)) return value
  }
  return undefined
}

export async function runSpinosa(
  args: string[],
  input?: {
    cwd?: string
    workspacePath?: string
    env?: NodeJS.ProcessEnv
    onStdout?: (chunk: string) => void
    onStderr?: (chunk: string) => void
  },
): Promise<CliRunResult> {
  const bin = await resolveSpinosaBin(input?.workspacePath)
  if (!bin) {
    return {
      exitCode: 127,
      stdout: "",
      stderr: "Spinosa CLI not found. Install via spinosa or set SPINOSA_BIN.",
    }
  }

  const frameworkRoot = resolveFrameworkRoot()
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      cwd: input?.cwd ?? frameworkRoot,
      env: {
        ...process.env,
        NO_COLOR: "1",
        ...(frameworkRoot ? { SPINOSA_FRAMEWORK_ROOT: frameworkRoot } : {}),
        ...input?.env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    })

    let stdout = ""
    let stderr = ""
    child.stdout?.on("data", (chunk) => {
      const text = String(chunk)
      stdout += text
      input?.onStdout?.(text)
    })
    child.stderr?.on("data", (chunk) => {
      const text = String(chunk)
      stderr += text
      input?.onStderr?.(text)
    })
    child.on("close", (code, signal) => {
      resolve({
        exitCode: code,
        stdout,
        stderr,
        signal: signal ?? undefined,
      })
    })
    child.on("error", (error) => {
      resolve({
        exitCode: 1,
        stdout,
        stderr: `${stderr}\n${error.message}`.trim(),
      })
    })
  })
}

export async function runCheckStartup(workspacePath: string) {
  const script = path.join(workspacePath, ".bin", "check-startup.sh")
  if (!existsSync(script)) {
    return {
      exitCode: 127,
      stdout: "",
      stderr: `Missing ${script}`,
    } satisfies CliRunResult
  }

  return new Promise<CliRunResult>((resolve) => {
    const child = spawn("bash", [script], {
      cwd: workspacePath,
      env: { ...process.env, NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk)
    })
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk)
    })
    child.on("close", (code, signal) => {
      resolve({ exitCode: code, stdout, stderr, signal: signal ?? undefined })
    })
    child.on("error", (error) => {
      resolve({ exitCode: 1, stdout, stderr: error.message })
    })
  })
}

export async function runUpgrade(input?: {
  onStdout?: (chunk: string) => void
  onStderr?: (chunk: string) => void
}) {
  return runSpinosa(["upgrade"], {
    onStdout: input?.onStdout,
    onStderr: input?.onStderr,
  })
}

export async function runReinstall(input?: {
  onStdout?: (chunk: string) => void
  onStderr?: (chunk: string) => void
}) {
  return runSpinosa(
    ["upgrade", "--reinstall"],
    {
      onStdout: input?.onStdout,
      onStderr: input?.onStderr,
    },
  )
}

export async function runUpdate(workspacePath: string, input?: {
  onStdout?: (chunk: string) => void
  onStderr?: (chunk: string) => void
}) {
  return runSpinosa(["update", "--yes", workspacePath], {
    cwd: workspacePath,
    workspacePath,
    onStdout: input?.onStdout,
    onStderr: input?.onStderr,
  })
}

export async function runNew(
  corpusPath: string,
  input?: {
    extensions?: string
    cli?: string
    launch?: string
    onStdout?: (chunk: string) => void
    onStderr?: (chunk: string) => void
  },
) {
  const args = ["new", corpusPath, "--no-color", "--cli", input?.cli ?? "opencode", "--launch", input?.launch ?? "run"]
  if (input?.extensions) args.push("--extensions", input.extensions)
  return runSpinosa(args, {
    onStdout: input?.onStdout,
    onStderr: input?.onStderr,
  })
}

export async function runSyncAgents(workspacePath: string) {
  const script = path.join(workspacePath, ".bin", "sync-agents.sh")
  if (!existsSync(script)) {
    return {
      exitCode: 127,
      stdout: "",
      stderr: `Missing ${script}`,
    } satisfies CliRunResult
  }
  return new Promise<CliRunResult>((resolve) => {
    const child = spawn("bash", [script], {
      cwd: workspacePath,
      env: { ...process.env, NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk)
    })
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk)
    })
    child.on("close", (code, signal) => {
      resolve({ exitCode: code, stdout, stderr, signal: signal ?? undefined })
    })
    child.on("error", (error) => {
      resolve({ exitCode: 1, stdout, stderr: error.message })
    })
  })
}

export async function runStartup(workspacePath: string, input?: { cli?: string; launch?: string }) {
  return runSpinosa(
    ["startup", "--workspace", workspacePath, "--cli", input?.cli ?? "opencode", "--launch", input?.launch ?? "run", "--no-color"],
    { cwd: workspacePath, workspacePath },
  )
}

export async function runAdd(
  workspacePath: string,
  sourcePath: string,
  input?: {
    dir?: boolean
    extensions?: string
    cli?: string
    onStdout?: (chunk: string) => void
    onStderr?: (chunk: string) => void
  },
) {
  const args = [
    "add",
    "--workspace",
    workspacePath,
    input?.dir ? "--dir" : "--file",
    sourcePath,
    "--no-color",
    "--cli",
    input?.cli ?? "opencode",
    "--launch",
    "run",
  ]
  if (input?.extensions) args.push("--extensions", input.extensions)
  return runSpinosa(args, {
    cwd: workspacePath,
    workspacePath,
    onStdout: input?.onStdout,
    onStderr: input?.onStderr,
  })
}
