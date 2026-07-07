import { statSync, existsSync } from "node:fs"
import * as path from "node:path"
import { findSourceFiles, classifySourceFile } from "../extension/classifier"
import { fileExt } from "../constants"
import { resolveUserPath } from "../utils/path"
import type { ImportBatchManager } from "../import/batch"
import { ocrAvailable, pypdfium2Available, pypdfAvailable } from "../tools/detection"
export { detectLlmTools } from "../tools/detection"

export interface ScanCounts {
  markdown: number
  markitdown: number
  native: number
  binaryCopyable: number
  ocrConvertible: number
  video: number
  audio: number
  unknown: number
  ignored: number
  total: number
}

export interface ScanBytes {
  markdown: number
  markitdown: number
  native: number
  binaryCopyable: number
  ocrConvertible: number
  video: number
  audio: number
  unknown: number
}

export interface ToolStatus {
  markitdown: boolean
  pypdfium2: boolean
  pypdf: boolean
}

export interface OnboardingPreviewRow {
  label: string
  status: string
  detail?: string
  tone?: "ok" | "warn"
}

export async function scanSource(
  sourcePath: string,
  importBatches: ImportBatchManager,
): Promise<ScanCounts & ScanBytes> {
  const out = {
    markdown: 0,
    markitdown: 0,
    native: 0,
    binaryCopyable: 0,
    ocrConvertible: 0,
    video: 0,
    audio: 0,
    unknown: 0,
    ignored: 0,
    total: 0,
  } as ScanCounts & ScanBytes

  for (const fp of findSourceFiles(sourcePath)) {
    const klass = await classifySourceFile(fp)

    if (klass === "ignored") {
      out.ignored++
      continue
    }

    out.total++
    const sz = statSync(fp).size
    const ext = fileExt(fp)

    switch (klass) {
      case "markdown":
        out.markdown++
        if (ext) importBatches.record(ext, sz)
        break
      case "markitdown":
        out.markitdown++
        if (ext) importBatches.record(ext, sz)
        break
      case "native":
        out.native++
        if (ext) importBatches.record(ext, sz)
        break
      case "binary_copyable":
        out.binaryCopyable++
        break
      case "ocr_convertible":
        out.ocrConvertible++
        if (ext) importBatches.record(ext, sz)
        break
      case "video":
        out.video++
        if (ext) importBatches.record(ext, sz)
        break
      case "audio":
        out.audio++
        if (ext) importBatches.record(ext, sz)
        break
      case "unknown":
        out.unknown++
        break
    }
  }

  importBatches.sort()
  importBatches.selectAll()

  return out
}

export async function detectDocumentTools(): Promise<ToolStatus> {
  const [pypdfium2, pypdf] = await Promise.all([
    pypdfium2Available(),
    pypdfAvailable(),
  ])
  return {
    markitdown: true,
    pypdfium2,
    pypdf,
  }
}

export function suggestWorkspacePath(sourcePath: string): string | undefined {
  const resolved = resolveUserPath(sourcePath)
  if (!resolved) return undefined
  const corpusName = path.basename(resolved)
  const parentDir = path.dirname(resolved)
  const base = path.join(parentDir, `${corpusName}-spinosa`)
  let candidate = base
  let index = 2
  while (existsSync(candidate)) {
    candidate = `${base}-${index}`
    index++
  }
  return candidate
}
