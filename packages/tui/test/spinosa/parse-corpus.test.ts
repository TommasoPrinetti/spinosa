import { describe, expect, test } from "bun:test"
import { parseExtractionProgress, parseMapLevels, parseWorkspaceIndex } from "../../src/spinosa/parse-corpus"

const sampleIndex = `---
type: workspace_index
---

## Navigation Maps

| Level | Description | Status |
|---|---|---|
| Structural overview | Corpus organization | pending |
| Group maps | Per-group fragments | ✓ |

## Extraction Progress

- Total files: 120
- Files read: 45
- Remaining: 75
- Status: in_progress
- Last batch: batch_003

## Coverage Status

- Setup status: cli_started
- Navigation maps: pending
`

describe("parseWorkspaceIndex", () => {
  test("extracts progress and map levels", () => {
    const parsed = parseWorkspaceIndex(sampleIndex)
    expect(parsed.extractionProgress.total).toBe(120)
    expect(parsed.extractionProgress.read).toBe(45)
    expect(parsed.mapLevels.length).toBe(2)
    expect(parsed.coverageStatus.setupStatus).toBe("cli_started")
  })
})

describe("parseExtractionProgress", () => {
  test("reads numeric fields", () => {
    const progress = parseExtractionProgress(sampleIndex)
    expect(progress.lastBatch).toBe("batch_003")
  })
})

describe("parseMapLevels", () => {
  test("skips header row", () => {
    const rows = parseMapLevels(sampleIndex)
    expect(rows[0]?.level).toBe("Structural overview")
  })
})