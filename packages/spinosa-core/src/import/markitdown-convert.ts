import { readFileSync } from "node:fs"
import path from "node:path"
import { MarkItDown } from "markitdown-ts"
import { ensureSheetJsFs } from "./sheetjs-fs"

type MarkItDownResult = Awaited<ReturnType<MarkItDown["convert"]>>

/**
 * Convert a local file with markitdown-ts.
 *
 * SheetJS 0.20+ ESM cannot `readFile` until `set_fs` is injected. For `.xlsx`
 * we also prefer buffer conversion so a mismatched xlsx module instance cannot
 * resurface as "The .xlsx are not supported."
 */
export async function markitdownConvertFile(
  converter: MarkItDown,
  src: string,
): Promise<MarkItDownResult> {
  ensureSheetJsFs()
  if (path.extname(src).toLowerCase() === ".xlsx") {
    return converter.convertBuffer(readFileSync(src), { file_extension: ".xlsx" })
  }
  return converter.convert(src)
}
