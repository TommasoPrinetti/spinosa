import path from "node:path"
import { existsSync } from "node:fs"
import { tmpdir } from "node:os"
import type { Argv, CommandModule } from "yargs"
import {
  readWorkspaceMeta,
  isSpinosaWorkspace,
  getFrameworkHealth,
} from "@spinosa/core/workspace/meta"
import { readFrameworkVersionFromRoot, resolveFrameworkRoot } from "@spinosa/core/framework/discovery"
import { detectDocumentTools } from "@spinosa/core/scan/scanner"
import {
  isCompiledBinaryDistribution,
  compiledTemplatePackId,
  installedBinaryPath,
  resolveTemplateCacheRoot,
  verifyEmbeddedTemplateCache,
  readCompiledDistribution,
  readInstalledBinaryVersion,
} from "@spinosa/core/distribution/bootstrap"
import { getFormat, log, emitResult, errorOut, type OutputFormat } from "../output"

interface DoctorArgs {
  workspace?: string
  json?: boolean
  quiet?: boolean
}

/** Static-specifier probes so Bun --compile can embed the modules (variable import() cannot). */
async function probePdfEngine(): Promise<boolean> {
  try {
    await import("pdfjs-dist/legacy/build/pdf.mjs")
    return true
  } catch {
    return false
  }
}

function stagedOnnxRuntimeLibPresent(): boolean {
  const name =
    process.platform === "darwin"
      ? "libonnxruntime.1.dylib"
      : process.platform === "linux"
        ? "libonnxruntime.so.1"
        : process.platform === "win32"
          ? "onnxruntime.dll"
          : ""
  return Boolean(name) && existsSync(path.join(tmpdir(), name))
}

async function probeOcrEngine(): Promise<boolean> {
  try {
    await import("ppu-paddle-ocr")
    return true
  } catch {
    // Import can still fail under Bun --compile even when companion libs were
    // staged at process start; treat staged onnxruntime natives as OCR-ready.
    return isCompiledBinaryDistribution() && stagedOnnxRuntimeLibPresent()
  }
}

async function probeMarkitdown(): Promise<boolean> {
  // Do not `import("markitdown-ts")` from doctor: its optional dynamic deps
  // (youtube-transcript, unzipper) can resolve via polluted global node_modules
  // and fail the compile. It is a hard dependency of the import/add path.
  if (isCompiledBinaryDistribution()) return true
  try {
    require.resolve("markitdown-ts")
    return true
  } catch {
    return false
  }
}

async function probeCanvas(): Promise<boolean> {
  try {
    await import("@napi-rs/canvas")
    return true
  } catch {
    return false
  }
}

export const DoctorCommand = {
  command: "doctor",
  describe: "Diagnose Spinosa framework and workspace health",
  builder: (yargs: Argv) =>
    yargs.option("workspace", { describe: "Workspace path to check", type: "string" }),
  handler: async (args: DoctorArgs) => {
    const fmt: OutputFormat = getFormat(args)
    const binaryMode = isCompiledBinaryDistribution()
    let healthy = true

    if (binaryMode) {
      const executable = process.execPath
      const installed = installedBinaryPath()
      const packId = compiledTemplatePackId()
      const cacheRoot = resolveTemplateCacheRoot()
      const verified = verifyEmbeddedTemplateCache()
      const metaVersion = readInstalledBinaryVersion()

      log(fmt, `Distribution: binary`)
      log(fmt, `Executable version: ${readFrameworkVersionFromRoot(undefined)}`)
      log(fmt, `Executable path: ${executable}`)
      log(fmt, `Installed binary: ${existsSync(installed) ? installed : "missing"}`)
      log(fmt, `Template pack: ${packId || "unknown"}`)
      log(fmt, `Template cache: ${verified.ok ? "valid" : `invalid (${verified.error})`}`)
      log(fmt, `Installation metadata: ${metaVersion ? `valid (${metaVersion})` : "missing"}`)
      if (!verified.ok) healthy = false
      if (!existsSync(cacheRoot) && !verified.ok) healthy = false

      const [pdf, ocr, markitdown, canvas] = await Promise.all([
        probePdfEngine(),
        probeOcrEngine(),
        probeMarkitdown(),
        probeCanvas(),
      ])
      log(fmt, `Document converter: ${markitdown ? "available" : "missing"}`)
      log(fmt, `PDF engine: ${pdf ? "available" : "missing"}`)
      log(fmt, `OCR engine: ${ocr ? "available" : "missing"}`)
      log(fmt, `Canvas: ${canvas ? "available" : "missing"}`)
      if (!pdf || !ocr || !markitdown) healthy = false
    } else {
      const frameworkRoot = resolveFrameworkRoot()
      healthy = Boolean(frameworkRoot)
      log(fmt, `Distribution: ${readCompiledDistribution()}`)
      log(fmt, `Framework: ${frameworkRoot ?? "not found"}`)
      log(fmt, `Version: ${readFrameworkVersionFromRoot(frameworkRoot)}`)
      const tools = await detectDocumentTools()
      for (const [name, available] of Object.entries(tools)) {
        log(fmt, `${name}: ${available ? "ok" : "missing"}`)
        if (!available) healthy = false
      }
    }

    const requestedWorkspace = args.workspace
    const workspacePath = requestedWorkspace ? path.resolve(requestedWorkspace) : process.cwd()
    if (requestedWorkspace || isSpinosaWorkspace(workspacePath)) {
      const meta = await readWorkspaceMeta(workspacePath)
      if (!meta) {
        errorOut(fmt, `Workspace: invalid (${workspacePath})`)
        healthy = false
      } else {
        log(fmt, `Workspace: ${workspacePath}`)
        log(fmt, `Workspace version: ${meta.frameworkVersion}`)
        log(fmt, `Workspace registry: valid`)
        for (const check of getFrameworkHealth(workspacePath)) {
          if (!check.ok) healthy = false
          log(fmt, `${check.ok ? "ok" : "missing"}: ${check.label}`)
        }
      }
    }

    const frameworkRoot = resolveFrameworkRoot()
    emitResult(
      fmt,
      "doctor",
      {
        healthy,
        distribution: readCompiledDistribution(),
        frameworkRoot,
        version: readFrameworkVersionFromRoot(frameworkRoot),
        templatePackId: binaryMode ? compiledTemplatePackId() : undefined,
      },
      healthy ? "healthy" : "issues found",
    )
    if (!healthy) process.exitCode = 1
  },
} satisfies CommandModule<object, DoctorArgs>
