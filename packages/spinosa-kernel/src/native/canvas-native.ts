/**
 * Stage the embedded `@napi-rs/canvas` skia.<triple>.node and point
 * `NAPI_RS_NATIVE_LIBRARY_PATH` at it before any canvas / OCR import.
 *
 * Bun --compile on Linux cannot `require("@napi-rs/canvas-linux-*-gnu")` from
 * nested chunks (ppu-ocv → @napi-rs/canvas js-binding). Doctor's direct ESM
 * import may still succeed while `import("ppu-paddle-ocr")` fails with
 * "Cannot find native binding". Staging a real filesystem path and setting the
 * napi-rs env override makes every load path use the same binding.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { isCompiledBinaryDistribution, spinosaHome } from "@spinosa/core/distribution/bootstrap"
import { CANVAS_NATIVE_BINDING } from "../generated/canvas-native.gen"
import { directoryAllowsWriteAndExec, resolveOnnxRuntimeStageDir } from "./onnx-runtime-libs"

export type CanvasNativeBindingFile = {
  name: string
  file: string
}

export type EnsureCanvasNativeBindingOptions = {
  binding?: CanvasNativeBindingFile | null
  spinosaHomeDir?: string
  xdgCacheHome?: string
  tmpDir?: string
  platform?: NodeJS.Platform
  canExec?: (dir: string) => boolean
  /** Force stage directory (skips resolve). */
  stageDir?: string
  env?: NodeJS.ProcessEnv
}

function readEmbeddedBytes(file: string): Uint8Array {
  return new Uint8Array(readFileSync(file))
}

function stageOne(dest: string, bytes: Uint8Array): "staged" | "skipped" {
  if (existsSync(dest)) {
    const existing = statSync(dest)
    if (existing.size === bytes.byteLength) return "skipped"
  }
  mkdirSync(path.dirname(dest), { recursive: true })
  writeFileSync(dest, bytes)
  return "staged"
}

/**
 * Prefer `$SPINOSA_HOME/cache/canvas-native` (exec-capable), else the same
 * candidate order as onnx staging (Linux: home → XDG → tmp; Darwin: tmp first).
 */
export function resolveCanvasNativeStageDir(
  options: Pick<
    EnsureCanvasNativeBindingOptions,
    "spinosaHomeDir" | "xdgCacheHome" | "tmpDir" | "platform" | "canExec"
  > = {},
): string {
  const home = options.spinosaHomeDir ?? spinosaHome()
  const preferred = path.join(home, "cache", "canvas-native")
  const canExec = options.canExec ?? directoryAllowsWriteAndExec
  if (canExec(preferred)) return preferred
  // Reuse onnx candidate ordering when the dedicated canvas cache is noexec.
  return resolveOnnxRuntimeStageDir({
    ...options,
    spinosaHomeDir: home,
  })
}

/** Idempotent: write embedded skia .node and set NAPI_RS_NATIVE_LIBRARY_PATH. */
export function ensureCanvasNativeBinding(
  options: EnsureCanvasNativeBindingOptions = {},
): { staged: string | null; skipped: boolean; stageDir: string; nativePath: string | null } {
  const binding = options.binding === undefined ? CANVAS_NATIVE_BINDING : options.binding
  const env = options.env ?? process.env
  if (!binding?.name || !binding?.file) {
    if (isCompiledBinaryDistribution()) {
      console.error(
        "[spinosa] canvas native binding was not embedded in this binary; OCR/@napi-rs/canvas may fail on Linux",
      )
    }
    return {
      staged: null,
      skipped: true,
      stageDir: options.stageDir ?? options.tmpDir ?? tmpdir(),
      nativePath: env.NAPI_RS_NATIVE_LIBRARY_PATH ?? null,
    }
  }

  const stageDir = options.stageDir ?? resolveCanvasNativeStageDir(options)
  const dest = path.join(stageDir, binding.name)
  try {
    const bytes = readEmbeddedBytes(binding.file)
    if (bytes.byteLength < 1024) {
      throw new Error(`embedded ${binding.name} is too small (${bytes.byteLength} bytes)`)
    }
    const result = stageOne(dest, bytes)
    // Always point napi-rs at the staged path so nested require() paths work.
    env.NAPI_RS_NATIVE_LIBRARY_PATH = dest
    return {
      staged: result === "staged" ? dest : null,
      skipped: result === "skipped",
      stageDir,
      nativePath: dest,
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    console.error(`[spinosa] failed to stage canvas native binding ${binding.name}: ${detail}`)
    return {
      staged: null,
      skipped: false,
      stageDir,
      nativePath: env.NAPI_RS_NATIVE_LIBRARY_PATH ?? null,
    }
  }
}
