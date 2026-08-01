/**
 * Product OCR (ppu-paddle-ocr / onnxruntime) platform gate.
 *
 * `spinosa-linux-x64` Bun `--compile` hits `ERR_DLOPEN_FAILED` on
 * `libonnxruntime.so.1` when OCR natives load. OCR is explicitly unsupported
 * there — not a soft probe failure. Darwin and linux-arm64 keep OCR.
 */

export type OcrPlatformHints = {
  platform?: NodeJS.Platform
  arch?: string
}

/** True when this OS/arch is allowed to load OCR/onnx natives. */
export function isOcrPlatformSupported(hints: OcrPlatformHints = {}): boolean {
  const platform = hints.platform ?? process.platform
  const arch = hints.arch ?? process.arch
  if (platform === "linux" && arch === "x64") return false
  return true
}

/** Human reason when OCR must not load; undefined when supported. */
export function ocrUnsupportedReason(hints: OcrPlatformHints = {}): string | undefined {
  if (isOcrPlatformSupported(hints)) return undefined
  const platform = hints.platform ?? process.platform
  const arch = hints.arch ?? process.arch
  return `OCR is unsupported on ${platform}-${arch} in this build (onnxruntime native load is not available)`
}
