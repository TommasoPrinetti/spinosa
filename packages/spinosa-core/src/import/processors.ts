import type { ProgressEmitter } from "../progress/progress"
import {
  processDirectCopy,
  processMarkitdown,
  processOcr,
  type PhaseResult,
  type ClassifiedEntry,
} from "./pipeline"

export type ImportProcessorId = "direct" | "markitdown" | "ocr"

export type ImportProcessorContext = {
  files: ClassifiedEntry[]
  logsDir: string
  prog?: ProgressEmitter
  onLog?: (msg: string) => void
  shouldAbort?: () => boolean
  /** Register OCR (or other) child processes for cancel-by-id. */
  onChild?: (child: import("node:child_process").ChildProcess) => void
  onRetry?: (attempt: number, reason: string) => void
  onRename?: (original: string, renamed: string) => void
  copyFn?: (src: string, dest: string) => Promise<void>
}

export type ImportProcessor = {
  id: ImportProcessorId
  label: string
  /** Phase name published via ProgressEmitter / job.progress. */
  phase: string
  run: (ctx: ImportProcessorContext) => Promise<PhaseResult>
}

/**
 * Uniform processor registry for import phases.
 * Wizards call through this so cancel/progress/child wiring stays consistent.
 */
export const importProcessors: Record<ImportProcessorId, ImportProcessor> = {
  direct: {
    id: "direct",
    label: "Direct copy",
    phase: "direct-progress",
    run: async (ctx) =>
      processDirectCopy(ctx.files, ctx.prog, ctx.onLog, ctx.copyFn, ctx.shouldAbort, ctx.onRetry, ctx.onRename),
  },
  markitdown: {
    id: "markitdown",
    label: "MarkItDown",
    phase: "MarkItDown",
    run: async (ctx) => processMarkitdown(ctx.files, ctx.logsDir, ctx.prog, ctx.onLog, ctx.shouldAbort),
  },
  ocr: {
    id: "ocr",
    label: "OCR",
    phase: "OCR",
    run: async (ctx) =>
      processOcr(ctx.files, ctx.logsDir, ctx.prog, ctx.onLog, ctx.shouldAbort, {
        onChild: ctx.onChild,
      }),
  },
}

export function listImportProcessors(): ImportProcessor[] {
  return [importProcessors.direct, importProcessors.markitdown, importProcessors.ocr]
}

export async function runImportProcessor(
  id: ImportProcessorId,
  ctx: ImportProcessorContext,
): Promise<PhaseResult> {
  return importProcessors[id].run(ctx)
}
