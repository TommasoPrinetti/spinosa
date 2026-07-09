# AddFiles restructuring plan

**Goal:** Rewrite `packages/tui/src/routes/spinosa/add-files.tsx` to match the working Onboarding flow's patterns, using the pipeline functions directly instead of the opaque `addFiles()` core wrapper.

---

## Step flow (new)

```
Path → Tools → Scan (with file-type toggles) → Processing: Direct → MarkItDown → OCR → Done
```

| # | Step | Purpose | Onboarding parallel |
|---|---|---|---|
| 1 | `path` | Pick source folder(s) | Same (keep multi-path, no name step) |
| 2 | `tools` | Check MarkItDown/OCR, offer repair | Same (no `detectLlmTools`) |
| 3 | `scan` | Scan source + show file-type toggles | Onboarding combines scan+imports in one step via `scanDone()` |
| 4 | `direct` | Copy native/markdown/binary files with ProgressBar | Same as onboarding `"direct"` step |
| 5 | `markitdown` | Convert Office docs, HTML, text PDFs with ProgressBar | Same as onboarding `"markitdown"` step |
| 6 | `ocr` | OCR scanned PDFs, images with ProgressBar | Same as onboarding `"ocr"` step |
| 7 | `done` | Summary + back to workspace | Simplified: no provider/CLI selection |
| — | `error` | Error state with retry | Same pattern |

---

## Key architectural changes

### A. Use pipeline functions directly (replace `addFiles()`)

**Current:** `addFiles({workspacePath, sourcePath, extensions, onProgress})` → internal re-scan.

**New:** Import and call pipeline functions directly, matching onboarding:

```
scanAndClassifySource(sourcePath, rawDir, batchManager)
  → { directFiles, markitdownFiles, ocrFiles, logsDir }

processDirectCopy(directFiles, prog, onLog)
processMarkitdown(markitdownFiles, logsDir, prog, onLog)
processOcr(ocrFiles, logsDir, prog, onLog)
```

**Benefits:**
- Single scan, no re-classification
- Per-phase progress via `ProgressEmitter` with `prog.file(phase, current, total, relPath)`
- Per-phase error isolation
- Skip phases with 0 files (no empty gates)

### B. Add tool-check step

Import from onboarding:
- `detectDocumentTools` from `../../spinosa/onboarding-preview` (already imported)
- `runReinstall` — either import from onboarding or duplicate a simplified version
- `ToolCheckResult` type and spinner pattern

### C. Multi-phase processing UI

Add these signals from onboarding:
- `progCurrent`, `progTotal`, `processingStatus`, `processingFile`, `failedCount`, `importSummary`
- `ProgressBar` component from `./wizard-ui` (already exported there)
- `ProgressEmitter` from `@opencode-ai/spinosa-core/progress/progress`
- `gate()` function pattern: returns Promise, resolves on user click, shows gate button

### D. Source path validation

Keep multi-path input (add-files allows multiple source folders) but add:
- `pathValidities` store with `"unchecked"|"valid"|"invalid"` per entry
- Live validation every 400ms with `validateSinglePath` (checks dir has files)
- Validity indicator dot (green/red) next to each path
- "Continue" button only shown when `hasValidPaths()`

### E. Processing over multiple source paths

After all phases complete for the first source:
- Loop over remaining source paths
- Call `scanAndClassifySource` + pipeline functions for each
- Aggregate counts (total files, failed, etc.)

Or for simplicity: process first source completely with full phase UX, then process remaining in background with log messages only (matching onboarding's treatment of extra paths via `addFiles`).

---

## New signals to add

```ts
// From onboarding
const [toolChecks, setToolChecks] = createSignal<ToolCheckResult[]>([])
const [progCurrent, setProgCurrent] = createSignal(0)
const [progTotal, setProgTotal] = createSignal(1)
const [processingStatus, setProcessingStatus] = createSignal("")
const [processingFile, setProcessingFile] = createSignal("")
const [failedCount, setFailedCount] = createSignal(0)
const [importSummary, setImportSummary] = createSignal("")
const [pathValidities, setPathValidities] = createStore<Record<number, "unchecked"|"valid"|"invalid">>({})

// From onboarding
let gateResolve: (() => void) | undefined
const gate = (label = "Continue") => new Promise<void>((resolve) => {
  gateResolve = resolve
  setGateLabel(label)
  setGateAction(() => () => {
    setWaitingForGate(false)
    gateResolve = undefined
    resolve()
  })
  setWaitingForGate(true)
})
```

---

## Key functions to add/rewrite

### `runToolCheck()` (new)
```ts
async function runToolCheck(): Promise<void>
// Set checks to "checking", call detectDocumentTools(), update results
// If any missing → show "Repair" button → runReinstall() → re-check
// If all available → auto-advance to scan
```

### `startScan()` (rewrite)
```ts
async function startScan(): Promise<void>
// Use buildImportScanPreview or scanByExtension (same as current)
// Show scan progress lines
// When done, set scanDone=true, show import toggles
```

### `startProcessing()` (full rewrite)
```ts
async function startProcessing(): Promise<void>
// 1. Create ImportBatchManager, parse extensions
// 2. Call scanAndClassifySource(sourcePath, rawDir, batchManager)
//    - rawDir = path.join(spinosa.activePath, "raw")
//    - mkdirSync(rawDir, { recursive: true }) if absent
// 3. Phase: Direct (processDirectCopy) with ProgressBar
// 4. Gate → Phase: MarkItDown (processMarkitdown) with ProgressBar
// 5. Gate → Phase: OCR (processOcr) with ProgressBar
// 6. Aggregate counts
// 7. Set done
```

### `finish()` (tweak)
```ts
function finish(): void
// spinosa.refresh(), navigate({ type: "workspace" }) — same as current
```

---

## New imports needed

```ts
import { createStore } from "solid-js/store"
import { useExit } from "../../context/exit"
import {
  scanAndClassifySource,
  processDirectCopy,
  processMarkitdown,
  processOcr,
} from "@opencode-ai/spinosa-core/import/pipeline"
import { ProgressEmitter } from "@opencode-ai/spinosa-core/progress/progress"
import { ImportBatchManager } from "@opencode-ai/spinosa-core/import/batch"
import { detectDocumentTools, resolveUserPath } from "../../spinosa/onboarding-preview"
import { mkdirSync } from "node:fs"
import { ProgressBar } from "./wizard-ui"  // already exported but not imported
import { logStep, logAction, logTool, logGate, logError } from "../../spinosa/log"
```

---

## JSX changes

### Tools step (new)
Mirrors onboarding's tools panel with spinner + check marks + repair button.

### Scan step (merge current scan+imports)
Mirrors onboarding's scan step: first shows scanning log lines, then when `scanDone()` shows the toggle list panel (same as current import options UI but inside the scan step panel).

Remove the standalone `imports` wizard step — the toggle list lives inside the scan step.

### Processing steps (new)
- `Show when` for each of `direct`, `markitdown`, `ocr`
- `ProgressBar` component showing phase name, current/total, file name
- When phase completes, show gate button for next phase

### Done step (simplified)
No provider selection. Just summary + "Back to workspace" button.

---

## Deleted code

| Lines | What | Why |
|---|---|---|
| 314-383 | `startProcessing()` | Replaced with pipeline functions |
| 218-283 | `startScan()` | Simplified, uses pipeline functions |
| 33 | `type WizardStep "imports"` | Merged into scan step |
| 9 | `import { addFiles }` | No longer calling the opaque wrapper |
| 15 | `import { buildImportScanPreview }` | Switch to pipeline functions |
| 13 | `buttonBorder` import | Clean up if unused after path step simplification |

---

## Step numbering

```ts
const totalSteps = 7
const stepIndex = createMemo(() => {
  if (step() === "path") return 1
  if (step() === "tools") return 2
  if (step() === "scan") return 3
  if (step() === "direct") return 4
  if (step() === "markitdown") return 5
  if (step() === "ocr") return 6
  if (step() === "done") return 7
  return 7
})
```

---

## moveBack behavior

```ts
const moveBack = () => {
  stopActiveWork()
  if (step() === "tools") { setStep("path"); return }
  if (step() === "scan") { setStep("tools"); return }
  if (step() === "direct" || step() === "markitdown" || step() === "ocr") { setStep("scan"); return }
  if (step() === "error") { setStep(importOptions().length > 0 ? "scan" : "path"); return }
}
```

---

## Keymap changes

- `ctrl+c` → `exit()` (matching onboarding, not back-navigation)
- `escape` → `moveBack()` (matching onboarding)
- `enter` on gate buttons in processing steps → gate action

---

## Acceptance criteria

1. User picks source folder → tool check runs → scan shows file types → select types → processing shows Direct/MD/OCR phases with progress bars → done
2. MarkItDown/OCR phases are skipped when no files of that class
3. Tool repair works (runs `install.sh --reinstall`)
4. Multiple source paths: first processed with full UX, rest processed in background
5. Back navigation works at each step
6. `ctrl+c` exits TUI, `escape` goes back
7. Workspace `raw/` dir is created if absent
8. No double scan — single call to classification
9. Already-imported files are skipped (checked via `convertedOutputExists` / `existsSync(destFile)` in the pipeline functions)
