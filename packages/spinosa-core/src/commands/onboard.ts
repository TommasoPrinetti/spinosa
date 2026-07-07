import { existsSync, mkdirSync } from "node:fs"
import path from "node:path"
import { scanSource, detectDocumentTools, type ScanCounts, type ScanBytes, type ToolStatus } from "../scan/scanner"
import { ImportBatchManager } from "../import/batch"
import {
  copySource,
  verifyAndRecoverImport,
  runDirectPhase,
  runMarkitdownPhase,
  runOcrPhase,
  scanAndClassifySource,
  type CopyResult,
} from "../import/pipeline"
import { ProgressEmitter } from "../progress/progress"
import { writeSetupFiles } from "../workspace/registry"
import { writeWorkspaceStatus } from "../workspace/meta"
import { generateStartupPrompt } from "./startup"
import { preferredCliName, buildLaunchCommand } from "../handoff/builder"
import { copyToClipboard } from "../handoff/runner"

export type OnboardingPhase =
  | "scan"
  | "batch_selection"
  | "tool_validation"
  | "import"
  | "direct"
  | "markitdown"
  | "ocr"
  | "verification"
  | "cli_selection"
  | "prompt"
  | "complete"
  | "blocked"

export type OnboardingHandoffResult =
  | "prompt_copied"
  | "launch_command_copied"
  | "run_requested"
  | "run_failed_command_copied"

export type AddMode = "new_source" | "extend"

export interface OnboardingOptions {
  workspacePath: string
  frameworkRoot: string
  sourcePath: string
  projectTitle: string
  flagExtensions?: string
  flagCli?: string
  flagLaunch?: "copy" | "run"
  onPhase?: (phase: OnboardingPhase, message: string) => void
  onCopyProgress?: (phase: string, current: number, total: number, relPath: string) => void
}

export interface OnboardingResult {
  success: boolean
  scanCounts?: ScanCounts & ScanBytes
  toolStatus?: ToolStatus
  copyResult?: CopyImportResult
  cli?: string
  handoffResult?: OnboardingHandoffResult
  blockedPhase?: OnboardingPhase
  blockerReason?: string
}

export interface CopyImportResult {
  total: number
  copied: number
  skipped: number
  failed: number
  mdConverted: number
  ocrConverted: number
  imported: number
}

export interface OnboardingSummary {
  projectTitle: string
  workspacePath: string
  scanCounts: ScanCounts & ScanBytes
  copyResult: CopyImportResult
  cli: string
  handoffAction: string
  handoffResult: OnboardingHandoffResult
  toolStatus: ToolStatus
}

export interface AddOnboardingOptions {
  workspacePath: string
  frameworkRoot: string
  sourcePath: string
  addMode: AddMode
  flagExtensions?: string
  onPhase?: (phase: OnboardingPhase, message: string) => void
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function toCopyImportResult(cr: CopyResult, total: number): CopyImportResult {
  return {
    total,
    copied: cr.copied,
    skipped: cr.skipped + cr.mdSkipped + cr.ocrSkipped,
    failed: cr.failed,
    mdConverted: cr.mdConverted,
    ocrConverted: cr.ocrConverted,
    imported: cr.totalCopied,
  }
}

// ── Shared context for phased onboarding ─────────────────────────────────

export interface OnboardingContext {
  workspacePath: string
  frameworkRoot: string
  sourcePath: string
  projectTitle: string
  scanCounts: ScanCounts & ScanBytes
  toolStatus: ToolStatus
  batches: ImportBatchManager
  rawDir: string
  copyableCount: number
}

export interface PhaseAccumulator {
  direct: { copied: number; skipped: number; failed: number }
  markitdown: { mdConverted: number; mdSkipped: number }
  ocr: { ocrConverted: number; ocrSkipped: number }
}

// ── Phase A: Prepare (scan, batch selection, tool validation) ─────────────

export async function prepareOnboarding(
  options: OnboardingOptions,
): Promise<OnboardingContext | OnboardingResult> {
  const { workspacePath, frameworkRoot, sourcePath, projectTitle, flagExtensions, onPhase } = options
  const phase = onPhase ?? (() => {})

  const batches = new ImportBatchManager()

  phase("scan", "Scanning source directory...")
  if (!existsSync(sourcePath)) {
    return { success: false, blockedPhase: "scan", blockerReason: `Source directory does not exist: ${sourcePath}` }
  }
  const scanCounts = await scanSource(sourcePath, batches)
  if (scanCounts.total === 0) {
    return { success: false, blockedPhase: "scan", blockerReason: "No importable files found in source directory" }
  }

  phase("batch_selection", "Selecting import batches...")
  if (flagExtensions) batches.parseExtensionsFromFlag(flagExtensions)
  if (!batches.validateExtensionsAgainstScan("")) batches.selectAll()
  const copyableCount = batches.selectedCount()
  if (copyableCount === 0) {
    return { success: false, blockedPhase: "batch_selection", blockerReason: "No file types selected for import" }
  }

  phase("tool_validation", "Validating document conversion tools...")
  const toolStatus = await detectDocumentTools()

  const rawDir = path.join(workspacePath, "raw")
  mkdirSync(rawDir, { recursive: true })

  return { workspacePath, frameworkRoot, sourcePath, projectTitle, scanCounts, toolStatus, batches, rawDir, copyableCount }
}

// ── Phase B: Run one import phase ─────────────────────────────────────────

export async function runImportPhase(
  ctx: OnboardingContext,
  phase: "direct" | "markitdown" | "ocr",
  progOrCallback?: ProgressEmitter | OnboardingOptions["onCopyProgress"],
  onLog?: (msg: string) => void,
): Promise<
  | { copied: number; skipped: number; failed: number }
  | { mdConverted: number; mdSkipped: number }
  | { ocrConverted: number; ocrSkipped: number }
> {
  const classified = await scanAndClassifySource(ctx.sourcePath, ctx.rawDir, ctx.batches)
  if (!classified || classified.directFiles.length + classified.markitdownFiles.length + classified.ocrFiles.length === 0) {
    return phase === "direct" ? { copied: 0, skipped: 0, failed: 0 } : { mdConverted: 0, mdSkipped: 0 }
  }

  const prog = progOrCallback instanceof ProgressEmitter
    ? progOrCallback
    : (() => {
        const p = new ProgressEmitter()
        if (typeof progOrCallback === "function") p.on((e) => { progOrCallback(e.phase, e.current, e.total, e.relPath) })
        return p
      })()

  if (phase === "direct") {
    return runDirectPhase(classified.directFiles, prog, onLog)
  }
  if (phase === "markitdown") {
    return runMarkitdownPhase(classified.markitdownFiles, ctx.sourcePath, ctx.rawDir, prog, onLog)
  }
  return runOcrPhase(classified.ocrFiles, ctx.sourcePath, ctx.rawDir, prog, onLog)
}

// ── Phase C: Finalize (verification, CLI, prompt, summary) ────────────────

export async function completeOnboarding(
  ctx: OnboardingContext,
  acc: PhaseAccumulator,
  options: OnboardingOptions,
): Promise<OnboardingResult> {
  const { flagCli, flagLaunch, onPhase } = options
  const phase = onPhase ?? (() => {})

  phase("verification", "Verifying import delivery...")
  const verifyResult = await verifyAndRecoverImport(
    ctx.sourcePath, ctx.rawDir, ctx.batches,
    ctx.toolStatus.markitdown, true,
    (msg: string) => onPhase?.("import", msg),
  )

  const copyResult: CopyResult = {
    copied: acc.direct.copied,
    skipped: acc.direct.skipped + acc.markitdown.mdSkipped + acc.ocr.ocrSkipped,
    failed: acc.direct.failed,
    mdConverted: acc.markitdown.mdConverted,
    mdSkipped: acc.markitdown.mdSkipped,
    ocrConverted: acc.ocr.ocrConverted,
    ocrSkipped: acc.ocr.ocrSkipped,
    totalCopied: acc.direct.copied + acc.markitdown.mdConverted + acc.ocr.ocrConverted + verifyResult.recovered,
    stillMissing: verifyResult.stillMissing,
  }
  const importResult = toCopyImportResult(copyResult, ctx.copyableCount)

  if (importResult.imported === 0) {
    return { success: false, blockedPhase: "verification", blockerReason: "No files were delivered to raw/" }
  }

  phase("cli_selection", "Setting preferred CLI...")
  const cli = flagCli ?? "opencode"
  const cliLabel = preferredCliName(cli)

  phase("cli_selection", `Writing setup files (CLI: ${cliLabel})...`)
  await writeSetupFiles(ctx.workspacePath, ctx.projectTitle, ctx.sourcePath, cliLabel)
  await writeWorkspaceStatus(ctx.workspacePath, "cli_started")

  phase("prompt", "Generating startup prompt...")
  const startupPrompt = await generateStartupPrompt(ctx.projectTitle, ctx.workspacePath, ctx.sourcePath, cliLabel, ctx.frameworkRoot)
  await Bun.write(path.join(ctx.workspacePath, "startup-prompt.md"), startupPrompt)
  const launchCommand = buildLaunchCommand(ctx.workspacePath, cli, startupPrompt)
  copyToClipboard(startupPrompt)

  let handoffResult: OnboardingHandoffResult = "prompt_copied"
  if (flagLaunch === "run" && cli !== "other") {
    const { runCliWithPrompt } = await import("../handoff/runner")
    if (runCliWithPrompt(ctx.workspacePath, cli, startupPrompt)) {
      handoffResult = "run_requested"
    } else {
      handoffResult = "run_failed_command_copied"
      copyToClipboard(launchCommand)
    }
  } else {
    copyToClipboard(launchCommand)
    handoffResult = "launch_command_copied"
  }

  phase("complete", "Writing onboarding summary...")
  await writeOnboardingSummary({
    projectTitle: ctx.projectTitle,
    workspacePath: ctx.workspacePath,
    scanCounts: ctx.scanCounts,
    copyResult: importResult,
    cli: cliLabel,
    handoffAction: flagLaunch === "run" ? "Run launch command now" : "Copy launch command",
    handoffResult,
    toolStatus: ctx.toolStatus,
  })

  return {
    success: true,
    scanCounts: ctx.scanCounts,
    toolStatus: ctx.toolStatus,
    copyResult: importResult,
    cli,
    handoffResult,
  }
}

// ── Legacy wrapper: runs prepare → all 3 phases → complete ───────────────

export async function runOnboarding(
  options: OnboardingOptions,
): Promise<OnboardingResult> {
  const prepared = await prepareOnboarding(options)
  if ("success" in prepared && !prepared.success) return prepared
  const ctx = prepared as OnboardingContext

  const { onPhase, onCopyProgress } = options
  const phase = onPhase ?? (() => {})

  phase("direct", "Copying files...")
  const dr = await runImportPhase(ctx, "direct", onCopyProgress, (msg) => onPhase?.("import", msg)) as { copied: number; skipped: number; failed: number }
  phase("markitdown", "Converting with MarkItDown...")
  const mr = await runImportPhase(ctx, "markitdown", onCopyProgress, (msg) => onPhase?.("import", msg)) as { mdConverted: number; mdSkipped: number }
  const or = await runImportPhase(ctx, "ocr", onCopyProgress, (msg) => onPhase?.("import", msg)) as { ocrConverted: number; ocrSkipped: number }
  return completeOnboarding(ctx, { direct: dr, markitdown: mr, ocr: or }, options)
}

export async function runAddOnboarding(
  options: AddOnboardingOptions,
): Promise<OnboardingResult> {
  const { workspacePath, sourcePath, flagExtensions, onPhase } = options
  const phase = onPhase ?? (() => {})

  const batches = new ImportBatchManager()

  phase("scan", "Scanning source directory...")
  if (!existsSync(sourcePath)) {
    return { success: false, blockedPhase: "scan", blockerReason: `Source directory does not exist: ${sourcePath}` }
  }
  const scanCounts = await scanSource(sourcePath, batches)

  phase("batch_selection", "Selecting import batches...")
  if (flagExtensions) {
    batches.parseExtensionsFromFlag(flagExtensions)
  }
  if (!batches.validateExtensionsAgainstScan("")) {
    batches.selectAll()
  }

  const rawDir = path.join(workspacePath, "raw")
  mkdirSync(rawDir, { recursive: true })

  phase("import", "Importing and converting source files...")
  const toolStatus = await detectDocumentTools()
  const copyResult = await copySource(sourcePath, rawDir, {
    markitdownChoice: toolStatus.markitdown,
    ocrChoice: true,
    batchManager: batches,
  })
  const importResult = toCopyImportResult(copyResult, scanCounts.total)

  phase("verification", "Verifying import delivery...")
  if (importResult.imported === 0 && importResult.skipped > 0) {
    phase("complete", "No new files to import (all duplicates)")
  }

  return {
    success: true,
    scanCounts,
    copyResult: importResult,
  }
}

async function writeOnboardingSummary(summary: OnboardingSummary): Promise<void> {
  const {
    projectTitle,
    workspacePath,
    scanCounts,
    copyResult,
    cli,
    handoffAction,
    handoffResult,
    toolStatus,
  } = summary

  const ocrMode = scanCounts.ocrConvertible > 0
    ? (copyResult.ocrConverted > 0 ? "ppu_ocr_converted" : "ppu_ocr_available")
    : "not_applicable"

  const markitdownMode = scanCounts.markitdown > 0
    ? (copyResult.mdConverted > 0 ? "markitdown_converted" : toolStatus.markitdown ? "markitdown_available" : "markitdown_not_bundled")
    : "not_applicable"

  const summaryPath = path.join(workspacePath, ".spinosa", "onboarding-summary.md")
  const content = `---
type: onboarding_summary
created: ${today()}
updated: ${today()}
---

# Onboarding Summary

## Workspace
- Initial workspace label: ${projectTitle}
- Workspace: ${workspacePath}
- Active corpus: raw/

## Scan Summary
- Text-based files to rename to Markdown: ${scanCounts.markdown}
- Office docs/HTML/EPUB/text PDFs via MarkItDown: ${scanCounts.markitdown}
- Native-readable files to copy unchanged: ${scanCounts.native}
- Scanned PDFs and images available for OCR: ${scanCounts.ocrConvertible}
- Videos (optional): ${scanCounts.video}
- Audio (optional): ${scanCounts.audio}
- Unsupported or unknown files: ${scanCounts.unknown}
- Ignored files: ${scanCounts.ignored}

## Workspace Import Result
- Selected import candidates: ${copyResult.total}
- Files imported into workspace: ${copyResult.imported}
- Files copied directly into workspace: ${copyResult.copied}
- Files skipped during direct copy: ${copyResult.skipped}
- MarkItDown converted: ${copyResult.mdConverted}
- MarkItDown mode: ${markitdownMode}
- OCR (ppu-paddle-ocr) converted: ${copyResult.ocrConverted}
- OCR mode: ${ocrMode}

## Handoff
- Preferred CLI: ${cli}
- Handoff action: ${handoffAction}
- Handoff result: ${handoffResult}
`

  await Bun.write(summaryPath, content)
}
