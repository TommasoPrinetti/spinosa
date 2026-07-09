import { existsSync, mkdirSync } from "node:fs"
import path from "node:path"
import { scanSource, detectDocumentTools, type ScanCounts, type ScanBytes, type ToolStatus } from "../scan/scanner"
import { ImportBatchManager } from "../import/batch"
import {
  copySource,
  verifyAndRecoverImport,
  processDirectCopy,
  processMarkitdown,
  processOcr,
  scanAndClassifySource,
  type PhaseResult,
} from "../import/pipeline"
import { ProgressEmitter } from "../progress/progress"
import { writeSetupFiles } from "../workspace/registry"
import { writeWorkspaceStatus } from "../workspace/meta"
import { generateStartupPrompt } from "./startup"
import { preferredCliName, buildLaunchCommand } from "../handoff/builder"
import { copyToClipboard, runCliWithPrompt } from "../handoff/runner"
import { spinosaLogInfo } from "../utils/log"

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
  cli?: string
  handoffResult?: OnboardingHandoffResult
  blockedPhase?: OnboardingPhase
  blockerReason?: string
}


export interface OnboardingSummary {
  projectTitle: string
  workspacePath: string
  scanCounts: ScanCounts & ScanBytes
  copyResult: { total: number; imported: number; copied: number; skipped: number; mdConverted: number; ocrConverted: number }
  cli: string
  handoffAction: string
  handoffResult: OnboardingHandoffResult
  toolStatus: ToolStatus
}


function today(): string {
  return new Date().toISOString().slice(0, 10)
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
  direct: PhaseResult
  markitdown: PhaseResult
  ocr: PhaseResult
}

// ── Phase A: Prepare (scan, batch selection, tool validation) ─────────────

export async function prepareOnboarding(
  options: OnboardingOptions,
): Promise<OnboardingContext | OnboardingResult> {
  const { workspacePath, frameworkRoot, sourcePath, projectTitle, flagExtensions, onPhase } = options
  spinosaLogInfo("onboard", `prepareOnboarding workspacePath=${options.workspacePath} sourcePath=${options.sourcePath}`)
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

  const imported = acc.direct.converted + acc.markitdown.converted + acc.ocr.converted + verifyResult.recovered
  if (imported === 0) {
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
    copyResult: {
      total: ctx.copyableCount,
      imported,
      copied: acc.direct.converted,
      skipped: acc.direct.skipped + acc.markitdown.skipped + acc.ocr.skipped,
      mdConverted: acc.markitdown.converted,
      ocrConverted: acc.ocr.converted,
    },
    cli: cliLabel,
    handoffAction: flagLaunch === "run" ? "Run launch command now" : "Copy launch command",
    handoffResult,
    toolStatus: ctx.toolStatus,
  })

  return {
    success: true,
    scanCounts: ctx.scanCounts,
    toolStatus: ctx.toolStatus,
    cli,
    handoffResult,
  }
}

// ── Legacy wrapper: scans once, dispatches all 3 phase runners, then finalizes ─

export async function runOnboarding(
  options: OnboardingOptions,
): Promise<OnboardingResult> {
  const prepared = await prepareOnboarding(options)
  if ("success" in prepared && !prepared.success) return prepared
  const ctx = prepared as OnboardingContext

  const { onPhase, onCopyProgress } = options
  const phase = onPhase ?? (() => {})

  const prog = typeof onCopyProgress === "function"
    ? (() => { const p = new ProgressEmitter(); p.on((e) => onCopyProgress(e.phase, e.current, e.total, e.relPath)); return p })()
    : undefined
  const classified = await scanAndClassifySource(ctx.sourcePath, ctx.rawDir, ctx.batches)
  if (!classified) {
    return { success: false, blockedPhase: "scan", blockerReason: "Failed to scan source" }
  }

  // Log classification breakdown to file
  const classifyMsg = `Classified: ${classified.directFiles.length} direct, ${classified.markitdownFiles.length} markitdown, ${classified.ocrFiles.length} ocr`
  onPhase?.("import", classifyMsg)
  spinosaLogInfo("onboard", classifyMsg)

  if (classified.markitdownFiles.length > 0) {
    spinosaLogInfo("onboard", `markitdown files (${classified.markitdownFiles.length}): ${classified.markitdownFiles.map(f => f.rel).join(", ")}`)
  }
  if (classified.ocrFiles.length > 0) {
    spinosaLogInfo("onboard", `ocr files (${classified.ocrFiles.length}): ${classified.ocrFiles.map(f => f.rel).join(", ")}`)
  }

  const onImportLog = (msg: string) => onPhase?.("import", msg)

  let mr: PhaseResult = { converted: 0, skipped: 0, failed: 0, recoverable: [] }
  let or: PhaseResult = { converted: 0, skipped: 0, failed: 0, recoverable: [] }

  phase("direct", "Copying files...")
  spinosaLogInfo("onboard", "phase=direct running")
  const dr = await processDirectCopy(classified.directFiles, prog, onImportLog)
  spinosaLogInfo("onboard", `phase=direct complete converted=${dr.converted} skipped=${dr.skipped}`)

  if (classified.markitdownFiles.length > 0) {
    phase("markitdown", "Converting with MarkItDown...")
    spinosaLogInfo("onboard", "phase=markitdown running")
    mr = await processMarkitdown(classified.markitdownFiles, classified.logsDir, prog, onImportLog)
    spinosaLogInfo("onboard", `phase=markitdown complete converted=${mr.converted} skipped=${mr.skipped}`)
  } else {
    spinosaLogInfo("onboard", "phase=markitdown skipped (0 files)")
  }

  if (classified.ocrFiles.length > 0) {
    phase("ocr", "Processing OCR...")
    spinosaLogInfo("onboard", "phase=ocr running")
    or = await processOcr(classified.ocrFiles, classified.logsDir, prog, onImportLog)
    spinosaLogInfo("onboard", `phase=ocr complete converted=${or.converted} skipped=${or.skipped}`)
  } else {
    spinosaLogInfo("onboard", "phase=ocr skipped (0 files)")
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
