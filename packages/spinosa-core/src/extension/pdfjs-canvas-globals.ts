/**
 * pdfjs-dist polyfills ImageData/Path2D/DOMMatrix via createRequire("@napi-rs/canvas").
 * Under Bun --compile on Linux that createRequire path fails even when the ESM
 * canvas import works, leaving globalThis.ImageData undefined and breaking
 * paintInlineImageXObject. Install the same constructors from the ESM module
 * we already use for NodeCanvasFactory / createCanvas.
 *
 * Import this module before pdfjs-dist so init sees the globals.
 */
import { DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas"
import { canvasDebugLog } from "./canvas-debug"

export function ensurePdfJsCanvasGlobals(): void {
  const g = globalThis as Record<string, unknown>
  // Always assign: kernel may have installed a stub DOMMatrix at CLI entry.
  g.ImageData = ImageData
  g.Path2D = Path2D
  g.DOMMatrix = DOMMatrix
  canvasDebugLog("ensurePdfJsCanvasGlobals", {
    ImageData: typeof g.ImageData,
    Path2D: typeof g.Path2D,
    DOMMatrix: typeof g.DOMMatrix,
  })
}

ensurePdfJsCanvasGlobals()
