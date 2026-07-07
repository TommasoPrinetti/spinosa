import { existsSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { spawn, type ChildProcess } from "node:child_process"
import { readBundledFrameworkVersion } from "./service"
import type { ReleaseChannel } from "@opencode-ai/spinosa-core/system/channels"
import { tuiLog } from "./log"
import { resolveFrameworkBin, resolveFrameworkRoot } from "@opencode-ai/spinosa-core/framework/discovery"
import { createWorkspace } from "@opencode-ai/spinosa-core/commands/create"
import {
  runOnboarding,
  prepareOnboarding,
  runImportPhase,
  completeOnboarding,
} from "@opencode-ai/spinosa-core/commands/onboard"
import { ProgressEmitter } from "@opencode-ai/spinosa-core/progress/progress"
import type { OnboardingContext, PhaseAccumulator, OnboardingResult } from "@opencode-ai/spinosa-core/commands/onboard"
import { runStartup as tsRunStartup } from "@opencode-ai/spinosa-core/commands/startup"
import { addFiles } from "@opencode-ai/spinosa-core/commands/add"
import { upgradeFramework } from "@opencode-ai/spinosa-core/commands/upgrade"
import { updateWorkspace } from "@opencode-ai/spinosa-core/commands/update"
import type { CliRunResult } from "./types"

const CANDIDATE_BINS = [
  () => process.env.SPINOSA_BIN,
  () => {
    const devBin = path.join(homedir(), "Documents", "spinosa-main", ".bin", "spinosa")
    if (existsSync(devBin)) return devBin
    return resolveFrameworkBin()
  },
  () => path.join(homedir(), ".spinosa", "bin", "spinosa"),
  (workspacePath?: string) =>
    workspacePath ? path.join(workspacePath, ".bin", "spinosa") : undefined,
]

export async function resolveSpinosaBin(workspacePath?: string): Promise<string | undefined> {
  for (const candidate of CANDIDATE_BINS) {
    const value = candidate(workspacePath)
    if (value && existsSync(value)) return value
  }
  return undefined
}

// ── Legacy fallback: spawn Bash CLI for operations not yet ported ──────────

export async function runSpinosa(
  args: string[],
  input?: {
    cwd?: string
    workspacePath?: string
    env?: NodeJS.ProcessEnv
    onStdout?: (chunk: string) => void
    onStderr?: (chunk: string) => void
    onSpawn?: (child: ChildProcess) => void
  },
): Promise<CliRunResult> {
  const ws = input?.workspacePath
  tuiLog(`runSpinosa args=${JSON.stringify(args)} ws=${ws ?? "none"}`)
  const bin = await resolveSpinosaBin(ws)
  if (!bin) {
    tuiLog(`ERR bin not found workspace=${ws ?? "none"} SPINOSA_BIN=${process.env.SPINOSA_BIN ?? "unset"}`)
    return {
      exitCode: 127,
      stdout: "",
      stderr: "Spinosa CLI not found. Install via spinosa or set SPINOSA_BIN.",
    }
  }

  const frameworkRoot = resolveFrameworkRoot()
  const SPINOSA_RUN_TIMEOUT_MS = 600_000
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      cwd: input?.cwd ?? frameworkRoot,
      env: {
        ...process.env,
        NO_COLOR: "1",
        SPINOSA_NO_UPGRADE_CHECK: "1",
        SPINOSA_PROGRESS_NEWLINES: "1",
        ...(frameworkRoot ? { SPINOSA_FRAMEWORK_ROOT: frameworkRoot } : {}),
        ...input?.env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    })
    input?.onSpawn?.(child)

    const timeout = setTimeout(() => {
      tuiLog(`timeout pid=${child.pid} killing after ${SPINOSA_RUN_TIMEOUT_MS}ms`)
      child.kill("SIGTERM")
    }, SPINOSA_RUN_TIMEOUT_MS)

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
      clearTimeout(timeout)
      resolve({
        exitCode: code,
        stdout,
        stderr,
        signal: signal ?? undefined,
      })
    })
    child.on("error", (error) => {
      clearTimeout(timeout)
      resolve({
        exitCode: 1,
        stdout,
        stderr: `${stderr}\n${error.message}`.trim(),
      })
    })
  })
}

// ── Ported operations (TypeScript) ────────────────────────────────────────

export type CopyProgress = { phase: string; curr: number; total: number; rel: string }
export type NewWorkspacePhase =
  | "setup"
  | "scan"
  | "batch_selection"
  | "tool_validation"
  | "import"
  | "direct"
  | "markitdown"
  | "ocr"
  | "verification"
  | "cli_selection"
  | "prompt"
  | "complete"
  | "blocked"

export const PHASES = {
  SETUP: "setup",
  SCAN: "scan",
  BATCH_SELECTION: "batch_selection",
  TOOL_VALIDATION: "tool_validation",
  IMPORT: "import",
  DIRECT_COPY: "direct",
  MARKITDOWN: "markitdown",
  OCR: "ocr",
  VERIFICATION: "verification",
  CLI_SELECTION: "cli_selection",
  PROMPT: "prompt",
  COMPLETE: "complete",
  BLOCKED: "blocked",
} as const

export async function runNew(
  corpusPath: string,
  input?: {
    extensions?: string
    cli?: string
    launch?: string
    onStdout?: (chunk: string) => void
    onStderr?: (chunk: string) => void
    onPhase?: (phase: NewWorkspacePhase, message: string) => void
    onCopyProgress?: (prog: CopyProgress) => void
  },
) {
  tuiLog(`runNew corpusPath=${corpusPath} extensions=${input?.extensions ?? "none"}`)

  const frameworkRoot = resolveFrameworkRoot()
  if (!frameworkRoot) {
    return { exitCode: 1, stdout: "", stderr: "Framework root not found." } satisfies CliRunResult
  }

  try {
    const result = await createWorkspace({
      corpusPath,
      frameworkRoot,
      extensions: input?.extensions,
      preferredCli: input?.cli ?? "opencode",
      launch: (input?.launch as "copy" | "run" | undefined) ?? "run",
      onProgress: (msg) => {
        input?.onPhase?.("setup", msg)
        input?.onStdout?.(msg + "\n")
      },
    })

    if (!result.success) {
      return { exitCode: 1, stdout: "", stderr: "Workspace creation failed." } satisfies CliRunResult
    }

    const projectTitle = path.basename(corpusPath)
    const onboardingResult = await runOnboarding({
      workspacePath: result.workspacePath,
      frameworkRoot,
      sourcePath: corpusPath,
      projectTitle,
      flagExtensions: input?.extensions,
      flagCli: input?.cli ?? "opencode",
      flagLaunch: (input?.launch as "copy" | "run" | undefined) ?? "run",
      onPhase: (phase, msg) => {
        input?.onPhase?.(phase as NewWorkspacePhase, msg)
        input?.onStdout?.(msg + "\n")
      },
      onCopyProgress: (phase, curr, total, rel) => {
        input?.onCopyProgress?.({ phase, curr, total, rel })
      },
    })

    if (!onboardingResult.success) {
      return { exitCode: 1, stdout: "", stderr: "Onboarding failed." } satisfies CliRunResult
    }

    const cr = onboardingResult.copyResult
    const summary = cr
      ? `Imported ${cr.imported} file(s): ${cr.copied} direct, ${cr.mdConverted} MarkItDown, ${cr.ocrConverted} OCR\n`
      : "Workspace created and onboarded.\n"
    return { exitCode: 0, stdout: summary, stderr: "" } satisfies CliRunResult
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    tuiLog(`runNew error: ${msg}`)
    return { exitCode: 1, stdout: "", stderr: msg } satisfies CliRunResult
  }
}

// ── Phased onboarding (TUI controls flow between phases) ─────────────────

export async function prepareNew(
  corpusPath: string,
  input?: {
    extensions?: string
    onPhase?: (phase: NewWorkspacePhase, message: string) => void
    onStdout?: (chunk: string) => void
  },
): Promise<OnboardingContext | null> {
  tuiLog(`prepareNew corpusPath=${corpusPath}`)

  const frameworkRoot = resolveFrameworkRoot()
  if (!frameworkRoot) return null

  const wsResult = await createWorkspace({
    corpusPath,
    frameworkRoot,
    extensions: input?.extensions,
    preferredCli: "opencode",
    launch: "copy",
    onProgress: (msg) => {
      input?.onPhase?.("setup", msg)
      input?.onStdout?.(msg + "\n")
    },
  })
  if (!wsResult.success) return null

  const projectTitle = path.basename(corpusPath)
  const prepared = await prepareOnboarding({
    workspacePath: wsResult.workspacePath,
    frameworkRoot,
    sourcePath: corpusPath,
    projectTitle,
    flagExtensions: input?.extensions,
    onPhase: (phase, msg) => {
      input?.onPhase?.(phase as NewWorkspacePhase, msg)
      input?.onStdout?.(msg + "\n")
    },
  })
  if ("success" in prepared && !prepared.success) return null
  return prepared as OnboardingContext
}

export async function runNewPhase(
  ctx: OnboardingContext,
  phase: "direct" | "markitdown" | "ocr",
  prog?: ProgressEmitter,
  onLog?: (msg: string) => void,
): Promise<
  | { copied: number; skipped: number; failed: number }
  | { mdConverted: number; mdSkipped: number }
  | { ocrConverted: number; ocrSkipped: number }
> {
  return runImportPhase(ctx, phase, prog, onLog)
}

export async function completeNew(
  ctx: OnboardingContext,
  acc: PhaseAccumulator,
  input?: {
    onPhase?: (phase: NewWorkspacePhase, message: string) => void
    onStdout?: (chunk: string) => void
  },
): Promise<OnboardingResult> {
  return completeOnboarding(ctx, acc, {
    workspacePath: ctx.workspacePath,
    frameworkRoot: ctx.frameworkRoot,
    sourcePath: ctx.sourcePath,
    projectTitle: ctx.projectTitle,
    onPhase: (phase, msg) => {
      input?.onPhase?.(phase as NewWorkspacePhase, msg)
      input?.onStdout?.(msg + "\n")
    },
  })
}

export async function runStartup(workspacePath: string, input?: { cli?: string; launch?: string }) {
  tuiLog(`runStartup ws=${workspacePath} cli=${input?.cli ?? "opencode"}`)
  const frameworkRoot = resolveFrameworkRoot()

  try {
    const result = await tsRunStartup({
      workspacePath,
      frameworkRoot: frameworkRoot ?? "",
      preferredCli: input?.cli ?? "opencode",
    })
    return { exitCode: 0, stdout: result.prompt + "\n", stderr: "" } satisfies CliRunResult
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { exitCode: 1, stdout: "", stderr: msg } satisfies CliRunResult
  }
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
    onSpawn?: (child: ChildProcess) => void
  },
) {
  tuiLog(`runAdd ws=${workspacePath} src=${sourcePath} dir=${input?.dir ?? false}`)

  try {
    const result = await addFiles({
      workspacePath,
      sourcePath,
      sourceIsDir: input?.dir ?? false,
      extensions: input?.extensions,
      onProgress: (msg) => {
        input?.onStdout?.(msg + "\n")
      },
    })

    if (result.success) {
      return { exitCode: 0, stdout: `Imported ${result.totalTargeted} files.\n`, stderr: "" } satisfies CliRunResult
    }
    return { exitCode: 1, stdout: "", stderr: "Add files failed." } satisfies CliRunResult
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { exitCode: 1, stdout: "", stderr: msg } satisfies CliRunResult
  }
}

// ── Still Bash-spawned (not yet ported) ───────────────────────────────────

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
    child.stdout?.on("data", (chunk) => { stdout += String(chunk) })
    child.stderr?.on("data", (chunk) => { stderr += String(chunk) })
    child.on("close", (code, signal) => {
      resolve({ exitCode: code, stdout, stderr, signal: signal ?? undefined })
    })
    child.on("error", (error) => {
      resolve({ exitCode: 1, stdout, stderr: error.message })
    })
  })
}

export async function runUpgrade(input?: {
  channel?: string
  onStdout?: (chunk: string) => void
  onStderr?: (chunk: string) => void
}) {
  tuiLog("runUpgrade (TS)")
  try {
    const result = await upgradeFramework({
      channel: (input?.channel ?? "stable") as ReleaseChannel,
      yes: true,
      onPhase: (_phase, msg) => input?.onStdout?.(msg + "\n"),
    })
    if (result.success) {
      input?.onStdout?.(`Upgraded to v${result.newVersion}\n`)
      return { exitCode: 0, stdout: "", stderr: "" } satisfies CliRunResult
    }
    return { exitCode: 1, stdout: "", stderr: "Upgrade failed." } satisfies CliRunResult
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { exitCode: 1, stdout: "", stderr: msg } satisfies CliRunResult
  }
}

export async function runReinstall(input?: {
  channel?: string
  onStdout?: (chunk: string) => void
  onStderr?: (chunk: string) => void
}) {
  tuiLog("runReinstall (TS)")
  const fwRoot = resolveFrameworkRoot()
  if (!fwRoot) {
    const msg = "Framework root not found — cannot reinstall vendor tools."
    input?.onStderr?.(msg + "\n")
    return { exitCode: 1, stdout: "", stderr: msg } satisfies CliRunResult
  }
  const localInstaller = path.join(fwRoot, "install.sh")
  if (!existsSync(localInstaller)) {
    const msg = "install.sh not found in framework root."
    input?.onStderr?.(msg + "\n")
    return { exitCode: 1, stdout: "", stderr: msg } satisfies CliRunResult
  }
  const version = await readBundledFrameworkVersion()
  if (!version) {
    const msg = "Could not read bundled framework version."
    input?.onStderr?.(msg + "\n")
    return { exitCode: 1, stdout: "", stderr: msg } satisfies CliRunResult
  }
  input?.onStdout?.(`Reinstalling vendor tools for v${version}...\n`)
  return new Promise<CliRunResult>((resolve) => {
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill("SIGTERM")
      resolve({ exitCode: 124, stdout, stderr: "Reinstall timed out after 120s." })
    }, 120_000)
    const child = spawn("bash", [localInstaller, "--reinstall", "--version", version, "--yes", "--no-launch", "--no-bundled-tools"], {
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf-8")
      stdout += text
      // Strip ANSI escape codes and spinner control chars for clean TUI display
      const clean = text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "").replace(/\r/g, "\n").replace(/\n{2,}/g, "\n").trim()
      if (clean) input?.onStdout?.(clean + "\n")
    })
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf-8")
      stderr += text
      const clean = text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "").replace(/\r/g, "\n").replace(/\n{2,}/g, "\n").trim()
      if (clean) input?.onStderr?.(clean + "\n")
    })
    const done = (code: number | null) => {
      clearTimeout(timer)
      if (timedOut) return
      if (code === 0) {
        input?.onStdout?.(`Reinstall complete.\n`)
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

export async function runUpdate(workspacePath: string, input?: {
  onStdout?: (chunk: string) => void
  onStderr?: (chunk: string) => void
}) {
  tuiLog(`runUpdate (TS) ws=${workspacePath}`)
  const frameworkRoot = resolveFrameworkRoot()
  if (!frameworkRoot) {
    return { exitCode: 1, stdout: "", stderr: "Framework root not found." } satisfies CliRunResult
  }
  try {
    const result = await updateWorkspace({
      workspacePath,
      frameworkRoot,
      onPhase: (_phase, msg) => input?.onStdout?.(msg + "\n"),
    })
    if (result.success) {
      input?.onStdout?.(`Update complete: ${result.added} added, ${result.updated} updated, ${result.removed} removed\n`)
      return { exitCode: 0, stdout: "", stderr: "" } satisfies CliRunResult
    }
    return { exitCode: 1, stdout: "", stderr: "Update failed." } satisfies CliRunResult
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { exitCode: 1, stdout: "", stderr: msg } satisfies CliRunResult
  }
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
    child.stdout?.on("data", (chunk) => { stdout += String(chunk) })
    child.stderr?.on("data", (chunk) => { stderr += String(chunk) })
    child.on("close", (code, signal) => {
      resolve({ exitCode: code, stdout, stderr, signal: signal ?? undefined })
    })
    child.on("error", (error) => {
      resolve({ exitCode: 1, stdout, stderr: error.message })
    })
  })
}
