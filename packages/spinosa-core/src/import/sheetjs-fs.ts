import * as fs from "node:fs"
import * as XLSX from "xlsx"

let ensured = false

/**
 * SheetJS 0.20+ ESM builds (`xlsx.mjs`) do not auto-require `fs`.
 * `readFile` / `writeFile` need an injected filesystem via `set_fs`.
 * Call once before markitdown-ts path-based `.xlsx` conversion.
 */
export function ensureSheetJsFs(): void {
  if (ensured) return
  ensured = true
  const setFs = (XLSX as { set_fs?: (mod: typeof fs) => void }).set_fs
  if (typeof setFs === "function") setFs(fs)
}
