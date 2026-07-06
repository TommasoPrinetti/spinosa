import type { ImportBatch } from "../extension/types"
import { MARKITDOWN_EXTENSIONS, IMAGE_EXTENSIONS, extInList } from "../constants"

export interface BatchSelectOption {
  ext: string
  label: string
  count: number
}

export function formatBatchOptions(
  batches: ImportBatch[],
  toolStatus?: { markitdown: boolean; rapidocr: boolean },
): BatchSelectOption[] {
  return batches.map((b) => ({
    ext: b.ext,
    count: b.count,
    label: batchOptionLabel(b.ext, toolStatus),
  }))
}

function batchOptionLabel(
  ext: string,
  toolStatus?: { markitdown: boolean; rapidocr: boolean },
): string {
  let tag = ""
  if (toolStatus) {
    const { markitdown, rapidocr } = toolStatus
    if (ext === "pdf") {
      if (markitdown && rapidocr) {
        tag = " (MarkItDown / OCR)"
      } else if (markitdown) {
        tag = " (MarkItDown)"
      } else if (rapidocr) {
        tag = " (OCR)"
      }
    } else if (extInList(ext, MARKITDOWN_EXTENSIONS)) {
      if (markitdown) tag = " (MarkItDown)"
    } else if (extInList(ext, IMAGE_EXTENSIONS)) {
      if (rapidocr) tag = " (OCR)"
    }
  }
  return `.${ext}${tag}`
}

export class ImportBatchManager {
  batches: ImportBatch[] = []
  selected: Set<string> = new Set()

  reset(): void {
    this.batches = []
    this.selected = new Set()
  }

  record(ext: string, bytes: number): void {
    if (!ext) return
    const existing = this.batches.find((b) => b.ext === ext)
    if (existing) {
      existing.count++
      existing.bytes += bytes
    } else {
      this.batches.push({ ext, count: 1, bytes })
    }
  }

  sort(): void {
    this.batches.sort((a, b) => a.ext.localeCompare(b.ext))
  }

  selectAll(): void {
    this.selected = new Set(this.batches.map((b) => b.ext))
  }

  isSelected(ext: string): boolean {
    return this.selected.has(ext)
  }

  selectedCount(): number {
    return this.batches
      .filter((b) => this.selected.has(b.ext))
      .reduce((sum, b) => sum + b.count, 0)
  }

  selectedBytes(): number {
    return this.batches
      .filter((b) => this.selected.has(b.ext))
      .reduce((sum, b) => sum + b.bytes, 0)
  }

  selectedExtensionsLabel(): string {
    return Array.from(this.selected)
      .map((e) => `.${e}`)
      .join(", ")
  }

  corpusImportableCount(): number {
    return this.batches.reduce((sum, b) => sum + b.count, 0)
  }

  enabledBatchesLabel(): string {
    const labels = this.batches
      .filter((b) => this.selected.has(b.ext))
      .map((b) => `.${b.ext}:${b.count}`)
    return labels.length ? labels.join(",") : "none"
  }

  excludedBatchesLabel(): string {
    const labels = this.batches
      .filter((b) => !this.selected.has(b.ext))
      .map((b) => `.${b.ext}:${b.count}`)
    return labels.length ? labels.join(",") : "none"
  }

  parseExtensionsFromFlag(flag: string): void {
    this.selected = new Set(
      flag
        .split(",")
        .map((s) => s.trim().replace(/^\./, "").toLowerCase())
        .filter(Boolean),
    )
  }

  validateExtensionsAgainstScan(_flagLabel: string): boolean {
    if (this.selected.size === 0) return false
    if (this.batches.length === 0) return false
    return Array.from(this.selected).some((ext) =>
      this.batches.some((b) => b.ext === ext),
    )
  }

  getSelectOptions(
    toolStatus?: { markitdown: boolean; rapidocr: boolean },
  ): BatchSelectOption[] {
    return formatBatchOptions(this.batches, toolStatus)
  }

  getSelectedExtensionsLabel(): string {
    return this.selectedExtensionsLabel()
  }

  getExcludedExtensionsLabel(): string {
    const labels = this.batches
      .filter((b) => !this.selected.has(b.ext))
      .map((b) => `.${b.ext}`)
    return labels.length ? labels.join(", ") : "none"
  }

  ensureSelection(extensions?: string): void {
    if (extensions) {
      this.parseExtensionsFromFlag(extensions)
    } else {
      this.selectAll()
    }
  }
}
