import { readFile } from "node:fs/promises"

export type MarkdownLoadResult =
  | { ok: true; text: string }
  | { ok: false; message: string }

/** Read a markdown file for the TUI viewer without throwing (avoids Solid resource rethrow → hard abort). */
export async function loadMarkdownFile(filepath: string): Promise<MarkdownLoadResult> {
  try {
    return { ok: true, text: await readFile(filepath, "utf-8") }
  } catch (e) {
    const code = e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : undefined
    if (code === "ENOENT") {
      return { ok: false, message: `File not found:\n${filepath}` }
    }
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}
