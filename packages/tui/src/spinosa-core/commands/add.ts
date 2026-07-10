import {
  existsSync,
  mkdirSync,
  rmSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs"
import * as path from "node:path"
import { safeCopy } from "../utils/fs"
import {
  findSourceFiles,
  classifySourceFile,
  markdownRawRelPath,
  markitdownOutputRelPath,
  ocrOutputRelPath,
} from "../extension/classifier"
import { ImportBatchManager } from "../import/batch"
import { injectColdFrontmatter, convertedOutputExists, removeConvertedOutput } from "../import/frontmatter"
import { scanSource } from "../scan/scanner"
import { fileExt } from "../constants"
import { runPpuOcrBatch } from "../import/ppu-ocr"
import type { PpuOcrFile } from "../import/ppu-ocr"
import { spinosaLogInfo } from "../utils/log"
import { MarkItDown } from "markitdown-ts"
import { copySource } from "../import/pipeline"

export interface AddFilesOptions {
  workspacePath: string
  sourcePath: string
  sourceIsDir?: boolean
  subfolder?: string
  extensions?: string
  overwrite?: boolean
  onProgress?: (message: string) => void
}

export interface AddFilesResult {
  success: boolean
  totalTargeted: number
  copied: number
  skipped: number
  failed: number
  mdConverted: number
  mdSkipped: number
  mdFailed: number
  ocrConverted: number
  ocrSkipped: number
  ocrFailed: number
}

export async function addFiles(options: AddFilesOptions): Promise<AddFilesResult> {
  const { workspacePath, sourcePath, sourceIsDir, subfolder, extensions, overwrite, onProgress } = options
  const rawDir = path.join(workspacePath, "raw")
  spinosaLogInfo("add", `sourcePath=${sourcePath} workspacePath=${workspacePath} sourceIsDir=${sourceIsDir}`)

  if (!existsSync(rawDir)) {
    mkdirSync(rawDir, { recursive: true })
  }

  if (sourceIsDir) {
    return addFilesFromDir(sourcePath, rawDir, subfolder, extensions, overwrite, onProgress)
  }
  return addSingleFile(sourcePath, rawDir, overwrite, onProgress)
}

async function addFilesFromDir(
  sourcePath: string,
  rawDir: string,
  subfolder?: string,
  extensions?: string,
  overwrite?: boolean,
  onProgress?: (msg: string) => void,
): Promise<AddFilesResult> {
  const importBatches = new ImportBatchManager()
  await scanSource(sourcePath, importBatches)
  if (extensions) {
    importBatches.parseExtensionsFromFlag(extensions)
  }

  onProgress?.("Scanning source directory...")

  const result = await copySource(sourcePath, rawDir, {
    batchManager: importBatches,
    markitdownChoice: true,
    ocrChoice: true,
    overwrite,
    subfolder,
    verifyAfter: false,
    onPhaseChange: (phase) => {
      switch (phase) {
        case "direct":
          onProgress?.("Importing files...")
          break
        case "markitdown":
          onProgress?.("Converting files with MarkItDown...")
          break
        case "ocr":
          onProgress?.("Processing OCR...")
          break
      }
    },
  })

  const totalTargeted = result.copied + result.skipped + result.failed
    + result.mdConverted + result.mdSkipped + result.mdFailed
    + result.ocrConverted + result.ocrSkipped + result.ocrFailed
  const failed = result.failed + result.mdFailed + result.ocrFailed

  onProgress?.("Import complete.")

  return {
    success: totalTargeted > 0 && failed === 0,
    totalTargeted,
    copied: result.copied,
    skipped: result.skipped,
    failed: result.failed,
    mdConverted: result.mdConverted,
    mdSkipped: result.mdSkipped,
    mdFailed: result.mdFailed,
    ocrConverted: result.ocrConverted,
    ocrSkipped: result.ocrSkipped,
    ocrFailed: result.ocrFailed,
  }
}

async function addSingleFile(
  srcFile: string,
  rawDir: string,
  overwrite?: boolean,
  onProgress?: (msg: string) => void,
): Promise<AddFilesResult> {
  const klass = await classifySourceFile(srcFile)

  if (klass === "ignored") {
    return {
      success: false,
      totalTargeted: 1,
      copied: 0,
      skipped: 0,
      failed: 1,
      mdConverted: 0,
      mdSkipped: 0,
      mdFailed: 0,
      ocrConverted: 0,
      ocrSkipped: 0,
      ocrFailed: 0,
    }
  }

  if (klass === "unknown") {
    return {
      success: false,
      totalTargeted: 1,
      copied: 0,
      skipped: 0,
      failed: 1,
      mdConverted: 0,
      mdSkipped: 0,
      mdFailed: 0,
      ocrConverted: 0,
      ocrSkipped: 0,
      ocrFailed: 0,
    }
  }

  onProgress?.(`Classified as ${klass}`)

  const totalTargeted = 1
  let copied = 0
  let skipped = 0
  let failed = 0
  let mdConverted = 0
  let mdSkipped = 0
  let mdFailed = 0
  let ocrConverted = 0
  let ocrSkipped = 0
  let ocrFailed = 0

  switch (klass) {
    case "markdown":
    case "native": {
      const fileName = path.basename(srcFile)
      const destName = klass === "markdown" ? markdownRawRelPath(fileName) : fileName
      const destFile = path.join(rawDir, destName)

      mkdirSync(path.dirname(destFile), { recursive: true })

      if (existsSync(destFile)) {
        if (!overwrite) {
          skipped = 1
          break
        }
        rmSync(destFile, { force: true })
      }

      if (safeCopy(srcFile, destFile)) {
        copied = 1
        if (destName.endsWith(".md")) {
          injectColdFrontmatter(destFile)
        }
      } else {
        failed = 1
      }

      break
    }

    case "markitdown": {
      const fileName = path.basename(srcFile)
      const stem = fileName.replace(/\.[^.]+$/, "")
      const ext = fileExt(fileName)
      const destName = `${stem}__${ext}.md`
      const destFile = path.join(rawDir, destName)

      mkdirSync(path.dirname(destFile), { recursive: true })

      if (convertedOutputExists(destFile)) {
        if (!overwrite) {
          skipped = 1
          break
        }
      }

      removeConvertedOutput(destFile)

      try {
        const converter = new MarkItDown()
        const result = await converter.convert(srcFile)
        const text = result?.markdown ?? ""
        if (!text.trim()) throw new Error("MarkItDown returned no content")
        writeFileSync(destFile, text, "utf-8")
        mdConverted = 1
        injectColdFrontmatter(destFile)
      } catch {
        mdFailed = 1
      }
      break
    }

    case "ocr_convertible": {
      const fileName = path.basename(srcFile)
      const stem = fileName.replace(/\.[^.]+$/, "")
      const destName = `${stem}.md`
      const destFile = path.join(rawDir, destName)

      mkdirSync(path.dirname(destFile), { recursive: true })

      if (convertedOutputExists(destFile)) {
        if (!overwrite) {
          skipped = 1
          break
        }
      }

      removeConvertedOutput(destFile)

      await runPpuOcrBatch([{ src: srcFile, rel: fileName, dest: destFile }])

      if (convertedOutputExists(destFile)) {
        ocrConverted = 1
        injectColdFrontmatter(destFile)
      } else {
        ocrFailed = 1
      }

      break
    }

    case "video":
    case "audio": {
      const destFile = path.join(rawDir, path.basename(srcFile))

      mkdirSync(path.dirname(destFile), { recursive: true })

      if (existsSync(destFile)) {
        if (!overwrite) {
          skipped = 1
          break
        }
        rmSync(destFile, { force: true })
      }

      if (safeCopy(srcFile, destFile)) {
        copied = 1
      } else {
        failed = 1
      }

      break
    }
  }

  onProgress?.("Single file import complete.")

  return {
    success: failed + mdFailed + ocrFailed === 0,
    totalTargeted,
    copied,
    skipped,
    failed,
    mdConverted,
    mdSkipped,
    mdFailed,
    ocrConverted,
    ocrSkipped,
    ocrFailed,
  }
}
