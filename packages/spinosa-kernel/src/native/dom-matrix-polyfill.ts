/**
 * pdfjs-dist optionally loads `@napi-rs/canvas` and otherwise expects DOMMatrix.
 * When canvas is unresolved in a compiled binary (no host node_modules), pdfjs
 * throws ReferenceError at module init. Provide a minimal stub so CLI parse
 * paths (version/doctor) stay alive; real PDF render still needs canvas.
 */
export function installDomMatrixPolyfill(): void {
  const g = globalThis as Record<string, unknown>
  if (typeof g.DOMMatrix !== "undefined") return
  g.DOMMatrix = class DOMMatrix {
    constructor(_init?: string | number[]) {}
  }
}
