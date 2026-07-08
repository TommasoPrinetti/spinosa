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
  ocrConverted: number
  ocrSkipped: number
}

async function runBatchMarkitdown(
  sourcePath: string,
  files: { srcFile: string; destFile: string; relPath: string }[],
): Promise<{ converted: string[]; failed: string[] }> {
  const converter = new MarkItDown()
  const converted: string[] = []
  const failed: string[] = []

  for (const f of files) {
    try {
      mkdirSync(path.dirname(f.destFile), { recursive: true })
      const result = await converter.convert(f.srcFile)
      const text = result?.markdown ?? ""
      writeFileSync(f.destFile, text, "utf-8")
      converted.push(f.relPath)
    } catch {
      failed.push(f.relPath)
    }
  }

  return { converted, failed }
}

async function runBatchOcr(
  _sourcePath: string,
  files: { srcFile: string; destFile: string; relPath: string }[],
): Promise<{ converted: string[]; failed: string[] }> {
  const toProcess: PpuOcrFile[] = files
    .filter((f) => !convertedOutputExists(f.destFile))
    .map((f) => ({ src: f.srcFile, rel: f.relPath, dest: f.destFile }))
  if (toProcess.length === 0) return { converted: files.map((f) => f.relPath), failed: [] }
  try {
    await runPpuOcrBatch(toProcess)
    const converted = files.filter((f) => convertedOutputExists(f.destFile)).map((f) => f.relPath)
    const failed = files.filter((f) => !convertedOutputExists(f.destFile)).map((f) => f.relPath)
    return { converted, failed }
  } catch {
    return { converted: [], failed: files.map((f) => f.relPath) }
  }
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
  onProgress?.("Scanning source directory...")

  const importBatches = new ImportBatchManager()
  await scanSource(sourcePath, importBatches)

  if (extensions) {
    importBatches.parseExtensionsFromFlag(extensions)
  }

  const allFiles = findSourceFiles(sourcePath)

  const markdownFiles: string[] = []
  const nativeFiles: string[] = []
  const avFiles: string[] = []
  const mdConvertFiles: { srcFile: string; destFile: string; relPath: string }[] = []
  const ocrFiles: { srcFile: string; destFile: string; relPath: string }[] = []

  for (const file of allFiles) {
    const ext = fileExt(file)
    const klass = await classifySourceFile(file)

    if (klass === "ignored" || klass === "unknown") continue
    if (!ext || !importBatches.isSelected(ext)) continue

    const relPath = subfolder ? path.join(subfolder, path.relative(sourcePath, file)) : path.relative(sourcePath, file)

    switch (klass) {
      case "markdown":
        markdownFiles.push(file)
        break
      case "native":
        nativeFiles.push(file)
        break
      case "video":
      case "audio":
        avFiles.push(file)
        break
      case "markitdown": {
        const destRel = markitdownOutputRelPath(relPath)
        const destFile = path.join(rawDir, destRel)
        mdConvertFiles.push({ srcFile: file, destFile, relPath })
        break
      }
      case "ocr_convertible": {
        const destRel = ocrOutputRelPath(relPath)
        const destFile = path.join(rawDir, destRel)
        ocrFiles.push({ srcFile: file, destFile, relPath })
        break
      }
    }
  }

  const totalTargeted =
    markdownFiles.length +
    nativeFiles.length +
    avFiles.length +
    mdConvertFiles.length +
    ocrFiles.length

  if (totalTargeted === 0) {
    return {
      success: false,
      totalTargeted: 0,
      copied: 0,
      skipped: 0,
      failed: 0,
      mdConverted: 0,
      mdSkipped: 0,
      ocrConverted: 0,
      ocrSkipped: 0,
    }
  }

  let copied = 0
  let skipped = 0
  let failed = 0
  let mdConverted = 0
  let mdSkipped = 0
  let ocrConverted = 0
  let ocrSkipped = 0

  onProgress?.(`Importing ${markdownFiles.length} text files...`)

  for (const file of markdownFiles) {
    const relPath = subfolder ? path.join(subfolder, path.relative(sourcePath, file)) : path.relative(sourcePath, file)
    const destRel = markdownRawRelPath(relPath)
    const destFile = path.join(rawDir, destRel)

    mkdirSync(path.dirname(destFile), { recursive: true })

    if (existsSync(destFile)) {
      if (!overwrite) {
        skipped++
        continue
      }
      rmSync(destFile, { force: true })
    }

    if (safeCopy(file, destFile)) {
      copied++
      injectColdFrontmatter(destFile)
    } else {
      failed++
    }
  }

  onProgress?.(`Importing ${nativeFiles.length} native files...`)

  for (const file of nativeFiles) {
    const relPath = subfolder ? path.join(subfolder, path.relative(sourcePath, file)) : path.relative(sourcePath, file)
    const destFile = path.join(rawDir, relPath)

    mkdirSync(path.dirname(destFile), { recursive: true })

    if (existsSync(destFile)) {
      if (!overwrite) {
        skipped++
        continue
      }
      rmSync(destFile, { force: true })
    }

    if (safeCopy(file, destFile)) {
      copied++
      if (relPath.endsWith(".md")) {
        injectColdFrontmatter(destFile)
      }
    } else {
      failed++
    }
  }

  onProgress?.(`Importing ${avFiles.length} media files...`)

  for (const file of avFiles) {
    const relPath = subfolder ? path.join(subfolder, path.relative(sourcePath, file)) : path.relative(sourcePath, file)
    const destFile = path.join(rawDir, relPath)

    mkdirSync(path.dirname(destFile), { recursive: true })

    if (existsSync(destFile)) {
      if (!overwrite) {
        skipped++
        continue
      }
      rmSync(destFile, { force: true })
    }

    if (safeCopy(file, destFile)) {
      copied++
    } else {
      failed++
    }
  }

  if (mdConvertFiles.length > 0) {
    onProgress?.(`Converting ${mdConvertFiles.length} files with MarkItDown...`)

    for (const f of mdConvertFiles) {
      mkdirSync(path.dirname(f.destFile), { recursive: true })

      if (convertedOutputExists(f.destFile)) {
        if (!overwrite) {
          mdSkipped++
          continue
        }
      }

      removeConvertedOutput(f.destFile)
    }

    const active = mdConvertFiles.filter(
      (f) => !convertedOutputExists(f.destFile),
    )

    if (active.length > 0) {
      const mdResult = await runBatchMarkitdown(sourcePath, active)
      for (const rel of mdResult.converted) {
        const entry = active.find((e) => e.relPath === rel)
        if (!entry) continue

        mdConverted++
        injectColdFrontmatter(entry.destFile)

        const pageDir = entry.destFile.replace(/\.md$/, "")
        if (existsSync(pageDir) && statSync(pageDir).isDirectory()) {
          for (const p of readdirSync(pageDir)) {
            if (p.endsWith(".md")) {
              injectColdFrontmatter(path.join(pageDir, p))
            }
          }
        }
      }
      mdSkipped += mdResult.failed.length
    }
  }

  if (ocrFiles.length > 0) {
    onProgress?.(`Converting ${ocrFiles.length} files with OCR...`)

    for (const f of ocrFiles) {
      mkdirSync(path.dirname(f.destFile), { recursive: true })

      if (convertedOutputExists(f.destFile)) {
        if (!overwrite) {
          ocrSkipped++
          continue
        }
      }

      removeConvertedOutput(f.destFile)
    }

    const active = ocrFiles.filter((f) => !convertedOutputExists(f.destFile))

    if (active.length > 0) {
      const ocrResult = await runBatchOcr(sourcePath, active)
      for (const rel of ocrResult.converted) {
        const entry = active.find((e) => e.relPath === rel)
        if (!entry) continue

        ocrConverted++
        injectColdFrontmatter(entry.destFile)

        const pageDir = entry.destFile.replace(/\.md$/, "")
        if (existsSync(pageDir) && statSync(pageDir).isDirectory()) {
          for (const p of readdirSync(pageDir)) {
            if (p.endsWith(".md")) {
              injectColdFrontmatter(path.join(pageDir, p))
            }
          }
        }
      }
      ocrSkipped += ocrResult.failed.length
    }
  }

  onProgress?.("Import complete.")

  return {
    success: failed === 0 || totalTargeted > failed,
    totalTargeted,
    copied,
    skipped,
    failed,
    mdConverted,
    mdSkipped,
    ocrConverted,
    ocrSkipped,
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
      ocrConverted: 0,
      ocrSkipped: 0,
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
      ocrConverted: 0,
      ocrSkipped: 0,
    }
  }

  onProgress?.(`Classified as ${klass}`)

  const totalTargeted = 1
  let copied = 0
  let skipped = 0
  let failed = 0
  let mdConverted = 0
  let mdSkipped = 0
  let ocrConverted = 0
  let ocrSkipped = 0

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
        writeFileSync(destFile, text, "utf-8")
        mdConverted = 1
        injectColdFrontmatter(destFile)
      } catch {
        mdSkipped = 1
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
        ocrSkipped = 1
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
    success: failed === 0,
    totalTargeted,
    copied,
    skipped,
    failed,
    mdConverted,
    mdSkipped,
    ocrConverted,
    ocrSkipped,
  }
}
