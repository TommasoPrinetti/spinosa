import { readdirSync, statSync } from "node:fs"
import * as path from "node:path"
import { homedir } from "node:os"
import {
  fileExt,
  extInList,
  MARKDOWN_EXTENSIONS,
  NATIVE_EXTENSIONS,
  MARKITDOWN_EXTENSIONS,
  IMAGE_EXTENSIONS,
  AUDIO_VIDEO_EXTENSIONS,
  BINARY_COPYABLE_EXTENSIONS,
} from "../constants"
import { isTextBasedPdf } from "./pdf"
import type { FileClass, ImportRoute } from "./types"

const HOME = homedir()

const TCC_SKIP_DIRS: string[] = [
  "/System",
  "/private",
  ...(HOME ? [`${HOME}/Music`] : []),
  ...(HOME ? [`${HOME}/Library/Calendar`] : []),
  ...(HOME ? [`${HOME}/Library/Calendars`] : []),
  ...(HOME ? [`${HOME}/Library/Mail`] : []),
  ...(HOME ? [`${HOME}/Library/Messages`] : []),
  ...(HOME ? [`${HOME}/Library/Safari`] : []),
  ...(HOME ? [`${HOME}/Pictures/Photos Library.photoslibrary`] : []),
]

function isTccSensitiveSourcePath(filePath: string): boolean {
  const normal = filePath.replace(/\/+$/, "")
  for (const dir of TCC_SKIP_DIRS) {
    if (normal === dir || normal.startsWith(dir + "/")) return true
  }
  const name = path.basename(normal)
  if (name.endsWith(".app")) return true
  if (name === "Photos Library.photoslibrary") return true
  if (name.endsWith(".photoslibrary")) return true
  return false
}

export function shouldSkipSourceFile(filePath: string): boolean {
  if (isTccSensitiveSourcePath(filePath)) return true
  const name = path.basename(filePath)
  const lower = name.toLowerCase()
  if (lower === "agents.md") return true

  const normal = filePath.replace(/\/+$/, "")
  if (normal.endsWith("/.DS_Store")) return true
  if (normal.includes("/.__")) return true // matches ._* pattern
  if (normal.endsWith("/.localized")) return true
  if (normal.includes("/__MACOSX/")) return true
  if (normal.endsWith("/.gitkeep")) return true
  if (normal.includes("/node_modules/")) return true
  if (normal.includes("/.git/")) return true

  // Check for ._ prefix on basename (Apple Double files)
  if (name.startsWith("._")) return true

  return false
}

export function findSourceFiles(sourcePath: string): string[] {
  const results: string[] = []

  function walk(dir: string) {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (isTccSensitiveSourcePath(fullPath)) continue
      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (entry.isFile()) {
        results.push(fullPath)
      }
    }
  }

  walk(sourcePath)
  return results
}

export async function classifySourceFile(filePath: string): Promise<FileClass> {
  if (shouldSkipSourceFile(filePath)) return "ignored"

  const ext = fileExt(filePath)

  if (extInList(ext, MARKDOWN_EXTENSIONS)) return "markdown"
  if (extInList(ext, MARKITDOWN_EXTENSIONS)) return "markitdown"
  if (extInList(ext, NATIVE_EXTENSIONS)) return "native"

  if (ext === "pdf") {
    return (await isTextBasedPdf(filePath)) ? "markitdown" : "ocr_convertible"
  }

  if (extInList(ext, IMAGE_EXTENSIONS)) return "ocr_convertible"

  if (extInList(ext, AUDIO_VIDEO_EXTENSIONS)) {
    const audioExts = ["mp3", "wav", "m4a", "aac", "flac", "ogg", "opus", "aiff"]
    return audioExts.includes(ext) ? "audio" : "video"
  }

  if (extInList(ext, BINARY_COPYABLE_EXTENSIONS)) return "binary_copyable"

  return "unknown"
}

export async function importRouteForFile(
  srcFile: string,
  opts?: { markitdownChoice?: boolean; ocrChoice?: boolean },
): Promise<ImportRoute | undefined> {
  const klass = await classifySourceFile(srcFile)

  switch (klass) {
    case "markdown":
      return "markdown_rename"
    case "native":
      return "native_copy"
    case "video":
    case "audio":
      return "media_copy"
    case "markitdown":
      if (opts?.markitdownChoice) return "markitdown"
      return undefined
    case "ocr_convertible":
      if (opts?.ocrChoice) return "ocr"
      return undefined
    case "binary_copyable":
      return "binary_copy"
    default:
      return undefined
  }
}

export function markdownRawRelPath(relPath: string): string {
  const ext = fileExt(relPath)
  if (ext === "md") return relPath

  const dir = path.dirname(relPath)
  const name = path.basename(relPath)
  const stem = name.slice(0, name.lastIndexOf("."))
  const result = `${stem}__${ext}.md`

  if (dir === ".") return result
  return `${dir}/${result}`
}

export function markitdownOutputRelPath(relPath: string): string {
  const dir = path.dirname(relPath)
  const name = path.basename(relPath)
  const stem = name.slice(0, name.lastIndexOf("."))
  const ext = fileExt(relPath)
  const mdOut = ext === "md" || !ext ? `${stem}.md` : `${stem}__${ext}.md`
  if (dir === ".") return mdOut
  return `${dir}/${mdOut}`
}

export function ocrOutputRelPath(relPath: string): string {
  const dir = path.dirname(relPath)
  const name = path.basename(relPath)
  const stem = name.slice(0, name.lastIndexOf("."))
  if (dir === ".") return `${stem}.md`
  return `${dir}/${stem}.md`
}
