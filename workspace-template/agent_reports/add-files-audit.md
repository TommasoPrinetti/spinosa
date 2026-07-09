# AddFiles Audit: gap analysis vs working Onboarding flow

**Date:** 2026-07-08
**Files:**
- `packages/tui/src/routes/spinosa/add-files.tsx` (target)
- `packages/tui/src/routes/spinosa/onboarding.tsx` (reference — works)
- `packages/spinosa-core/src/commands/add.ts` (core import)
- `packages/tui/src/spinosa/onboarding-preview.ts` (scan utils)
- `packages/spinosa-core/src/import/batch.ts` (ImportBatchManager)

---

## 1. Step-flow mismatch

| Onboarding (works) | AddFiles (broken) |
|---|---|
| Path → Name → Tools check → Scan → Imports → **Setup → Direct → MarkItDown → OCR → Verification** → Provider → Done | Path → Scan → Imports → Processing → Done |

AddFiles skips:
- **Name step** — workspace name derived from source folder (acceptable for "add" mode).
- **Tools check** — no `detectDocumentTools()` call before processing. If MarkItDown/OCR tools are absent, `addFilesFromDir` will attempt conversion and **fail silently** (the core function catches nothing for missing binaries).
- **Phase separation** — onboarding shows each pipeline phase (`Direct`, `MarkItDown`, `OCR`, `Verification`) with user gates between them. AddFiles lumps everything into a single `"processing"` step with no intermediate feedback.
- **Provider/CLI selection** — not relevant (already in a workspace).

## 2. Scan — duplicate work, potential divergence

**Show flow:**
1. `buildImportScanPreview(path)` → calls `scanByExtension(path)` — custom walker using `classifySourceFile()` + `shouldSkipSourceFile()`. Results drive the UI toggle list.
2. `addFiles({ workspacePath, sourcePath, extensions, ... })` → internally calls `scanSource(path, batchManager)` + `findSourceFiles(path)` — re-walks the **entire source tree**, re-classifies every file from scratch.

This is **two independent file walks with independent classification calls** — any differences between `scanByExtension`'s walk and `findSourceFiles`' walk will cause a disconnect between what the user selected and what gets imported.

**Onboarding** avoids this entirely: it uses `buildNewWorkspacePreview` for the UI scan, then the pipeline functions (`scanAndClassifySource`, `processDirectCopy`, etc.) work from the same classified data — no redundant re-scan.

## 3. No workspace readiness validation

`add-files.tsx:335-343`:
```ts
const workspacePath = spinosa.activePath
if (!workspacePath) {
  // error
}
```

Checks `spinosa.activePath` exists but does **not** validate:
- `raw/` directory exists under the workspace
- Framework root is accessible (`resolveFrameworkRoot()`)
- The workspace is in a valid state (has `raw/`, has framework installed)

Onboarding calls `createWorkspace()` first, which sets these up, then `prepareOnboarding()` ensures the raw dir structure before any file operations.

**Risk:** AddFiles calling `addFiles()` against a workspace with missing `raw/` or no framework → the core function will silently create `raw/` itself via `mkdirSync` in `addFilesFromDir`, but there's no guarantee the workspace is in a consistent state after.

## 4. Tool dependency not checked

Onboarding step "tools" runs `detectDocumentTools()` and shows a `ToolCheckResult[]` UI with repair action (re-runs `install.sh`). It also gates processing: if tools are missing, the user can repair before scanning.

AddFiles does zero tool checks. `addFilesFromDir` unconditionally tries `runBatchMarkitdown()` and `runBatchOcr()` — both will either throw (caught nowhere graceful) or produce empty/wrong output if the tools aren't installed.

## 5. Processing-phase UX lacks structure

Onboarding shows per-phase progress:
```
[1/4] Creating workspace...
[2/4] Direct copy (42 files)  ████████░░ 80%
[3/4] MarkItDown (12 files)   ████░░░░░░ 40%
[4/4] OCR (8 files)           ██████████ 100%
```
Uses `ProgressEmitter` + `setProgCurrent()` / `setProgTotal()` + `setProcessingFile()` — the spinner and progress bar are driven by structured events.

AddFiles shows a single `LogScrollbox` with `appendLogLine` text and a static `"Importing files..."` label. The `onProgress` callback on `addFiles()` fires text messages (`"Importing N text files..."`, `"Converting N files with MarkItDown..."`), but the UI doesn't surface structured progress (counts, current file, phase labels). User sees a log scrollbox filling up with no progress indicator.

## 6. Path validation vs onboarding

Both use `resolveUserPath()` + `existsSync()` for basic path validation.

**Onboarding additionally:**
- Has `pathValidities` store with per-entry `"unchecked"|"valid"|"invalid"` — validates liveness every 400ms via `setInterval`.
- `validateSinglePath()` — checks directory has contents (`readdirSync(p).length > 0`) and marks empty dirs as invalid.

AddFiles does **not** validate that the source directory contains importable files. A user could point at an empty directory and the scan would find nothing, producing an empty toggle list.

## 7. Key code paths identified

| Issue | Lines in `add-files.tsx` | Reference in `onboarding.tsx` |
|---|---|---|
| No tool check | `continueFromPath` → `startScan` (line 286) | `continueFromPath` → `continueFromName` → `runToolCheck` (line 570-572) |
| No gate between scan and imports | `startProcessing` (line 314) jumps straight to import | `gate("Continue to MarkItDown")` at line 681 |
| Single-phase processing | `setStep("processing")` at line 320 | Steps: `direct`, `markitdown`, `ocr`, `verification` |
| No progress bar | Missing `ProgressBar` component usage | Uses `ProgressBar` with `progCurrent`/`progTotal` |
| Workspace not created | Just reads `spinosa.activePath` | Calls `createWorkspace()` + `prepareOnboarding()` |

## 8. `buildImportScanPreview` vs `buildNewWorkspacePreview`

Both call `scanByExtension()` — the scan output itself is the same. Differences:

| Property | `buildNewWorkspacePreview` | `buildImportScanPreview` |
|---|---|---|
| `workspacePath` | ✅ computed | ❌ absent |
| `preflightRows` | ✅ tool status + path check | ❌ absent |
| `scanRows` | ✅ | ✅ |
| `importOptions` | ✅ | ✅ |

AddFiles uses the simpler variant because it doesn't need workspace creation, but **loses the tool-status information** that the flight check would surface.

## 9. `addFiles()` core function entry

`packages/spinosa-core/src/commands/add.ts`:
- Calls `scanSource()` → populates `ImportBatchManager` with extension counts.
- If `extensions` flag given → `parseExtensionsFromFlag(extensions)` filters the batch selection.
- Calls `findSourceFiles()` → classifies each file against the batch selection.
- Copies/converts files to `raw/` dir.
- Returns `AddFilesResult` with success/failure counts.

The core function itself appears sound. The failure is in the **TUI layer**:
- Not validating tool readiness before dispatch.
- Not creating/validating the workspace state before import.
- Re-scanning the source tree independently of the UI scan.
- No structured progress feedback.
