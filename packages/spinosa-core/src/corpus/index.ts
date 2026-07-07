import type { CorpusIndexSummary, ExtractionProgress, MapLevelRow, MapTreeEntry } from "../types"

function section(text: string, heading: string) {
  const pattern = new RegExp(`## ${heading}[\\s\\S]*?(?=\\n## |$)`)
  return text.match(pattern)?.[0] ?? ""
}

function bulletValue(block: string, label: string) {
  const match = block.match(new RegExp(`^-\\s*${label}:\\s*(.+)$`, "m"))
  return match?.[1]?.trim()
}

function parseNumber(value: string | undefined) {
  if (!value) return
  const match = value.match(/(\d+)/)
  return match ? Number(match[1]) : undefined
}

export function parseExtractionProgress(text: string): ExtractionProgress {
  const block = section(text, "Extraction Progress")
  return {
    total: parseNumber(bulletValue(block, "Total files")),
    read: parseNumber(bulletValue(block, "Files read")),
    remaining: bulletValue(block, "Remaining"),
    status: bulletValue(block, "Status"),
    lastBatch: bulletValue(block, "Last batch"),
  }
}

export function parseCoverageStatus(text: string): { setupStatus?: string; rawCopies?: string; maps?: string; dictionary?: string; knownGaps?: string } {
  const block = section(text, "Coverage Status")
  return {
    setupStatus: bulletValue(block, "Setup status"),
    rawCopies: bulletValue(block, "Raw copies"),
    maps: bulletValue(block, "Navigation maps"),
    dictionary: bulletValue(block, "Dictionary"),
    knownGaps: bulletValue(block, "Known gaps"),
  }
}

export function parseMapLevels(text: string): MapLevelRow[] {
  const block = section(text, "Navigation Maps")
  const rows: MapLevelRow[] = []
  for (const line of block.split("\n")) {
    const match = line.match(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/)
    if (!match) continue
    const level = match[1]!.trim()
    if (level === "Level" || level.startsWith("---")) continue
    rows.push({
      level,
      description: match[2]!.trim(),
      status: match[3]!.trim(),
    })
  }
  return rows
}

export function parseHealthMatrix(text: string): string[] {
  const block = section(text, "Workspace Health Matrix")
  const lines: string[] = []
  let inDashboard = false
  for (const line of block.split("\n")) {
    if (line.includes("┌─") || line.includes("│")) {
      inDashboard = true
      lines.push(line)
      continue
    }
    if (inDashboard && line.includes("└─")) {
      lines.push(line)
      break
    }
    if (inDashboard) lines.push(line)
  }
  return lines
}

export function parseDictionaryStatus(text: string): string | undefined {
  const block = section(text, "Dictionary Status")
  const trimmed = block.replace(/^## Dictionary Status\s*/m, "").trim()
  if (!trimmed || trimmed === "Pending fresh startup run.") return trimmed || undefined
  return trimmed.split("\n")[0]?.trim()
}

export function parseWorkspaceIndex(text: string): CorpusIndexSummary {
  return {
    hasWorkspaceIndex: true,
    extractionProgress: parseExtractionProgress(text),
    coverageStatus: parseCoverageStatus(text),
    mapLevels: parseMapLevels(text),
    dictionaryStatus: parseDictionaryStatus(text),
    healthMatrixLines: parseHealthMatrix(text),
    hubPath: "maps/corpus_overview.md",
  }
}

export function emptyWorkspaceIndex(): CorpusIndexSummary {
  return {
    hasWorkspaceIndex: false,
    extractionProgress: {},
    coverageStatus: {},
    mapLevels: [],
    healthMatrixLines: [],
    hubPath: "maps/corpus_overview.md",
  }
}

export function buildMapTree(paths: string[]): MapTreeEntry[] {
  const entries: MapTreeEntry[] = []
  const sorted = [...paths].sort()
  for (const relative of sorted) {
    const parts = relative.split("/")
    entries.push({
      path: relative,
      name: parts.at(-1) ?? relative,
      depth: Math.max(0, parts.length - 1),
    })
  }
  return entries
}

export function countDictionaryTerms(text: string): number {
  let count = 0
  for (const line of text.split("\n")) {
    if (/^#{2,3}\s+/.test(line)) count++
    else if (/^-\s+\*\*[^*]+\*\*/.test(line)) count++
  }
  return count
}
