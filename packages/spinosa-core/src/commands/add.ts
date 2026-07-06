import {
  existsSync,
  mkdirSync,
  rmSync,
  statSync,
  readdirSync,
} from "node:fs"
import * as path from "node:path"
import { spawnSync } from "node:child_process"
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
import {
  markitdownBin,
  fallbackPythonBin,
  markitdownScriptPath,
  structuredFallbackAvailable,
} from "../tools/detection"
import { scanSource } from "../scan/scanner"
import { fileExt } from "../constants"
import { runPpuOcrBatch } from "../import/ppu-ocr"

export interface AddFilesOptions {
  workspacePath: string
  sourcePath: string
  sourceIsDir?: boolean
  extensions?: string
  preferredCli?: string
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

function runBatchMarkitdown(
  sourcePath: string,
  files: { srcFile: string; destFile: string; relPath: string }[],
): { converted: string[]; failed: string[] } {
  const binPath = markitdownBin()
  let cmd: string
  let args: string[]

  if (binPath) {
    cmd = binPath
    args = ["--batch"]
  } else if (structuredFallbackAvailable()) {
    const python = fallbackPythonBin()
    const script = markitdownScriptPath()
    if (!python || !script) return { converted: [], failed: files.map((f) => f.relPath) }
    cmd = python
    args = [script, "--batch"]
  } else {
    return { converted: [], failed: files.map((f) => f.relPath) }
  }

  const inputLines: string[] = [`SOURCE\t${sourcePath}`]
  for (const f of files) {
    inputLines.push(`FILE\t${f.srcFile}\t${f.destFile}`)
  }

  const result = spawnSync(cmd, args, {
    input: inputLines.join("\n") + "\n",
    encoding: "utf-8",
    timeout: 300_000,
  })

  const relByDest = new Map<string, string>()
  for (const f of files) {
    relByDest.set(f.destFile, f.relPath)
  }

  const stderr = result.stderr || ""
  let converted: string[] = []
  let failed: string[] = []

  for (const line of stderr.split("\n")) {
    if (line.startsWith("END\t")) {
      const parts = line.split("\t")
      if (parts[1] === "ok") {
        const donePaths = files.filter((f) => existsSync(f.destFile))
        for (const f of donePaths) {
          if (!converted.includes(f.relPath)) converted.push(f.relPath)
        }
      }
    }
  }

  if (converted.length === 0 && failed.length === 0) {
    for (const f of files) {
      if (existsSync(f.destFile)) {
        converted.push(f.relPath)
      } else {
        failed.push(f.relPath)
      }
    }
  } else {
    const seen = new Set([...converted, ...failed])
    for (const f of files) {
      if (!seen.has(f.relPath)) {
        if (existsSync(f.destFile)) {
          converted.push(f.relPath)
        } else {
          failed.push(f.relPath)
        }
      }
    }
  }

  return { converted, failed }
}

async function runBatchOcr(
  _sourcePath: string,
  files: { srcFile: string; destFile: string; relPath: string }[],
): Promise<{ converted: string[]; failed: string[] }> {
  await runPpuOcrBatch(files.map((f) => ({ src: f.srcFile, rel: f.relPath, dest: f.destFile })))
  const converted = files.filter((f) => convertedOutputExists(f.destFile)).map((f) => f.relPath)
  const failed = files.filter((f) => !convertedOutputExists(f.destFile)).map((f) => f.relPath)
  return { converted, failed }
}

export async function addFiles(options: AddFilesOptions): Promise<AddFilesResult> {
  const { workspacePath, sourcePath, sourceIsDir, extensions, overwrite, onProgress } = options
  const rawDir = path.join(workspacePath, "raw")

  if (!existsSync(rawDir)) {
    mkdirSync(rawDir, { recursive: true })
  }

  if (sourceIsDir) {
    return addFilesFromDir(sourcePath, rawDir, extensions, overwrite, onProgress)
  }
  return addSingleFile(sourcePath, rawDir, overwrite, onProgress)
}

async function addFilesFromDir(
  sourcePath: string,
  rawDir: string,
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

    const relPath = path.relative(sourcePath, file)

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
    const relPath = path.relative(sourcePath, file)
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
    const relPath = path.relative(sourcePath, file)
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
    const relPath = path.relative(sourcePath, file)
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
      const mdResult = runBatchMarkitdown(sourcePath, active)
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

      const binPath = markitdownBin()
      let cmd: string
      let args: string[]

      if (binPath) {
        cmd = binPath
        args = ["--batch"]
      } else if (structuredFallbackAvailable()) {
        const python = fallbackPythonBin()
        const script = markitdownScriptPath()
        if (!python || !script) {
          failed = 1
          break
        }
        cmd = python
        args = [script, "--batch"]
      } else {
        failed = 1
        break
      }

      const inputLines = [`SOURCE\t${path.dirname(srcFile)}`, `FILE\t${srcFile}\t${destFile}`]

      const result = spawnSync(cmd, args, {
        input: inputLines.join("\n") + "\n",
        encoding: "utf-8",
        timeout: 120_000,
      })

      const stderr = result.stderr || ""
      let mdOk = false

      for (const line of stderr.split("\n")) {
        if (line.startsWith("END\t")) {
          const parts = line.split("\t")
          if (parts[1] === "ok") mdOk = true
        }
      }

      if (mdOk && existsSync(destFile)) {
        mdConverted = 1
        injectColdFrontmatter(destFile)
      } else {
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
