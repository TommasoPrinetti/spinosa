/**
 * Stage onnxruntime companion shared libraries into os.tmpdir() before any
 * `onnxruntime_binding.node` dlopen. Bun --compile extracts the `.node` addon
 * into the process temp dir as a hashed `.<id>.node`; the loader resolves
 * `@rpath` / `$ORIGIN` libs next to that extraction (tmpdir root). Staging
 * here is what makes OCR work without user-facing LD_LIBRARY_PATH.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { isCompiledBinaryDistribution } from "@spinosa/core/distribution/bootstrap"
import { ONNX_SHARED_LIB_FILES } from "../generated/onnx-native.gen"

export type OnnxSharedLibFile = {
  name: string
  file: string
}

function readEmbeddedBytes(file: string): Uint8Array {
  // Compiled binaries expose `with { type: "file" }` paths under /$bunfs; Bun's
  // readFileSync materializes them. Dev/source uses real filesystem paths.
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

/** Idempotent: write each embedded shared lib into os.tmpdir() when missing/stale. */
export function ensureOnnxRuntimeSharedLibs(
  files: readonly OnnxSharedLibFile[] = ONNX_SHARED_LIB_FILES,
): { staged: string[]; skipped: string[] } {
  const staged: string[] = []
  const skipped: string[] = []
  if (!files.length) {
    // Empty embed means the binary was built without onnx companion libs — OCR
    // will fail at dlopen. Surface once at startup instead of failing silently.
    if (isCompiledBinaryDistribution()) {
      console.error(
        "[spinosa] onnxruntime companion libs were not embedded in this binary; OCR/ONNX will fail",
      )
    }
    return { staged, skipped }
  }

  const destDir = tmpdir()
  for (const entry of files) {
    if (!entry?.name || !entry?.file) continue
    const dest = path.join(destDir, entry.name)
    try {
      const bytes = readEmbeddedBytes(entry.file)
      if (bytes.byteLength < 1024) {
        throw new Error(`embedded ${entry.name} is too small (${bytes.byteLength} bytes)`)
      }
      const result = stageOne(dest, bytes)
      if (result === "staged") staged.push(dest)
      else skipped.push(dest)
    } catch (error) {
      // Fail open at runtime: version/doctor should still run if OCR natives are
      // absent; OCR feature paths will surface the original dlopen error.
      const detail = error instanceof Error ? error.message : String(error)
      console.error(`[spinosa] failed to stage onnxruntime lib ${entry.name}: ${detail}`)
    }
  }
  return { staged, skipped }
}
