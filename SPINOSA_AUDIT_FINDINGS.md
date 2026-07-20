# Spinosa — Multi-Agent Audit Findings

> **7 parallel audit agents × all spinosa-specific code not in SYSTEM_AUDIT.md.**  
> Generated 2026-07-09. **Supplements** [SYSTEM_AUDIT.md](./SYSTEM_AUDIT.md) (which covered install.sh, workspace-template, TUI app shell, home route, commands/onboard/add/update, pipeline, runner, utils/fs/scanner/progress/log, adapters, local, channels/version).

---

## Executive Summary

**146 new findings** across ~70 spinosa-specific files. Combined with SYSTEM_AUDIT.md's ~230 spinosa findings = **~376 total spinosa findings**.

| Severity | Count | Description |
|----------|-------|-------------|
| 🔴 **CRITICAL** | ~12 | Data loss, resource leaks, broken build/publish, silent corruption |
| 🟠 **HIGH** | ~30 | Unhandled rejections, unverified downloads, concurrent write races, stub detection |
| 🟡 **MEDIUM** | ~55 | Timer leaks, fragile parsing, inconsistent behavior, misleading error messages |
| 🔵 **LOW** | ~49 | Dead code, edge cases, readability, cosmetic |

---

## 1. SPINOSA ROUTES (onboarding.tsx, add-files.tsx, workspace-picker.tsx, wizard-ui.tsx)

**Agent:** SpinosaRoutes | **19 findings** | **4 large TSX files (57KB + 44KB + 40KB + 12KB)**

### 🔴 Critical
- **`runToolRepair` is a no-op stub in add-files.tsx** (line 454-457) — button click transitions UI to "checking" state but does nothing. User sees progress then back to same broken state. onboarding.tsx has a REAL implementation. Contrasting behavior.
- **`void runToolRepair()` in onboarding.tsx** (line 540) — unhandled promise rejection. `runToolRepair` is `async` without try/catch. If `readBundledFrameworkVersion()` or `detectDocumentTools()` throws, whole rejection is silent.
- **`void continueFromPath()` in add-files.tsx** (lines 685, 994) — same unhandled rejection pattern. `continueFromPath` awaits `runToolCheck()` which can throw.
- **`void pathRefine()` in onboarding.tsx** (line 1009) — same pattern.

### 🟠 High
- **Spin timer interval not cleaned up on unmount** (onboarding.tsx:362-364, add-files.tsx:840-845) — `spinOn()` starts `setInterval`, `spinOff()` only called in `finally` blocks of async processing. If component unmounts during async work (route nav), the interval leaks forever. `onCleanup` only clears `startupTimer`, not `spinTimer`.
- **Workspace picker delays navigation instead of waiting for ready state** (workspace-picker.tsx:200-230) — uses `setTimeout` to wait before navigating. If workspace setup takes longer than timeout or fails, UI navigates to incomplete state.
- **`WizardGateButton` auto-advance timer fires after unmount** (wizard-ui.tsx:153-185) — 30-second countdown calls `deferPress(props.action)` which may set state on unmounted component.

### 🟡 Medium
- **Debounced search races with selection** (workspace-picker.tsx) — user can select a workspace while search results are still updating, potentially selecting stale/incorrect entry.
- **`add-files.tsx` re-fetches workspace metadata twice** — `createResource` and manual `fetch` duplicate the same API call.
- **No error boundary around wizard steps** — a throw in any step crashes the entire wizard.

---

## 2. SPINOSA MODULE (onboarding-preview.ts, service.ts, log.ts, verify.ts, orchestrator.ts, etc.)

**Agent:** SpinosaModule | **20 findings** | **14 files**

### 🔴 Critical
- **`buildImportScanPreview` passes wrong first argument** (onboarding-preview.ts:191) — calls `resolveWorkspacePath(projectName)` where `projectName` is just `path.basename(sourcePath)`. The function expects a full directory path. Workspace is created in wrong parent directory. `buildNewWorkspacePreview` (line 175) does it correctly.
- **`countDictionaryTerms` called with `undefined` → throws TypeError** (service.ts:134) — `readTextFile()` returns `string | undefined` for missing dictionary files. No guard before calling `.split("\n")` on the result.
- **`logError` propagates exceptions from toast callback** (log.ts:102) — `_toastError?.(err)` called without try/catch. If toast callback throws, it crashes `logError`'s caller.
- **`logEntry` silently swallows ALL write failures** (log.ts:53-55) — `catch { // best-effort }`. Disk full, permissions all invisible. Entire logging subsystem can silently go dead.
- **`Bun.Glob` breaks under Node.js** (service.ts:53,118,155) — three functions use `Bun.Glob` directly. If TUI ever runs under Node.js, `ReferenceError` at call time. No runtime check or fallback.

### 🟠 High
- **`createAgentReportsWatcher`/`createWorkspaceFileWatcher` interval leaks when called outside reactive root** (artifact-watcher.ts:24,44) — `onCleanup(() => clearInterval(timer))` is a no-op if called outside a SolidJS reactive root. Timer fires forever, polling every 2-3s. No `getOwner()` guard.
- **`shouldSkipScanDir` does not exclude `.spinosa/` directories** (onboarding-preview.ts:49) — skip list includes `.git`, `node_modules` but NOT `.spinosa/`. Walking near a workspace descends into `.spinosa/` containing agent output, maps, raw copies.
- **Recursive async `walk` can stack overflow on deep trees** (onboarding-preview.ts:59-95) — each directory level adds a stack frame. >10k levels → overflow.
- **`writeGoalArtifact` succeeds but subsequent operations fail → orphaned artifact** (orchestrator.ts:21-35) — no cleanup if `orchestratorPreamble` or return statement fails after successful write.
- **`getRoutesSnapshot` silently falls through to wrong goal** (service.ts:191-192) — when `preferredSessionId` not found, returns `goals[0]` without warning.

### 🟡 Medium/Low
- **`entry.ts` `routeForSetupStatus` is dead code** — always returns `{ type: "workspace" }` regardless of setup status parameter.
- **`artifactExists` is synchronous but called with `await`** (route-recovery.ts:23-27) — `existsSync` wrapped in `await` is harmless but misleading.

---

## 3. SPINOSA IMPORT & WORKSPACE (ppu-ocr.ts, cancellation.ts, batch.ts, frontmatter.ts, registry.ts, meta.ts)

**Agent:** SpinosaImport | **14 findings** | **6 files**

### 🔴 Critical
- **PDF Document resource leak — `doc.destroy()` never called** (pdf-js.ts:5-103) — every PDF function calls `getDoc()` but never calls `.destroy()`. `PDFDocumentProxy` holds WebAssembly heap, font caches, parsed structures — NOT GC-tracked. Process RSS grows unboundedly. `ocrPdf` in ppu-ocr.ts opens 200 documents simultaneously for a 200-page PDF.
- **Concurrent registry write corruption** (registry.ts:61-99) — `registerWorkspace` and `unregisterWorkspace` do async read-modify-write without file locking. Two concurrent calls both read before either writes → second write silently overwrites first → lost registrations.

### 🟠 High
- **`ensureGlobalMetadata` fires-and-forgets `Bun.write()` promise** (registry.ts:29) — sync function returns `void` but `Bun.write()` returns `Promise<number>`. Unhandled rejection on write failure (disk full, permissions).
- **Workspace registry pipe-splitting ambiguity** (registry.ts:41-42,61-82) — `split("|")` on lines. `|` in project names or paths before escaping produces corrupt registry or silently truncated values.
- **`unregisterWorkspace` succeeds silently when target not in list** (registry.ts:85-99) — no error, no log when trying to remove a workspace that doesn't exist. Caller thinks removal happened.
- **OCR cancellation page processing race** (cancellation.ts) — cancel flag checked between pages but not during a single page's processing. A slow page completes after cancel.

### 🟡 Medium/Low
- **OCR batch import swallows individual file errors** (batch.ts) — one corrupt file's error silently absorbed, batch continues without reporting which file failed.
- **Frontmatter YAML parse errors silently return defaults** (frontmatter.ts) — malformed YAML returns empty object with no warning.

---

## 4. SPINOSA EXTENSIONS & SYSTEM (classifier.ts, pdf.ts, pdf-js.ts, channels.ts, detection.ts, etc.)

**Agent:** SpinosaExtensions | **29 findings** | **13 files**

### 🔴 Critical
- **Tool detection functions are ALL hardcoded stubs** (detection.ts:1-30) — `pdfjsAvailable()` → `return true`, `ocrAvailable()` → `return true`, `pypdfium2Available()` → `Promise.resolve(true)`. **No actual dependency checking happens.** App crashes at first use of a missing library rather than reporting the gap during tool detection.
- **`resolvePinnedVersionFromInstaller` throws on network failure despite `string | undefined` return type** (channels.ts:129-147) — bare `fetch(url)` without try/catch. DNS failure → unhandled rejection crashes the update check.
- **Config read vs write path inconsistency with `SPINOSA_METADATA_DIR`** (channels.ts:19-22,111-127) — read path uses `SPINOSA_HOME`, write path checks `SPINOSA_METADATA_DIR` first. When set, writes go to different file than reads. Config changes are invisible.

### 🟠 High
- **PDF `isTextBasedPdf` reads entire file synchronously** (pdf.ts:44-45) — `readFileSync(pdfPath)` with no size limit before a 256KB quick search. 500MB+ PDF blocks event loop and can OOM. Also contradicts async function signature.
- **PDF `pdfExtractAllText` and `pdfExtractPageTexts` fail entirely on one bad page** (pdf-js.ts:81-103) — plain for-loop, one corrupted page loses all extracted text. No per-page catch/skip.
- **PDF `getDoc()` doesn't stream — entire file loaded twice** (pdf-js.ts:5-7) — `readFileSync(pdfPath)` creates Buffer, passes as `{ data }` to PDF.js which copies it. Peak memory = 2× file size.
- **Symlink loop causes infinite recursion in file scanner** (classifier.ts:63-86) — `isDirectory()` returns true for symlinks to directories. Symlink loop → stack overflow or process hang. No loop tracking, no max-depth.
- **No timeout on `fetch()` calls in channels** (channels.ts:129) — bare `fetch()` without AbortController. Hanging network blocks indefinitely.

### 🟡 Medium
- **Classifier outer try/catch swallows all classification errors** (classifier.ts) — any throw returns empty result with no diagnostic.
- **Permission errors silently absorbed in file walk** (classifier.ts:68-71) — `readdirSync` errors caught and silently return.
- **`framework/discovery.ts` duplicate with opencode's discovery** — 3rd framework root resolution implementation alongside `startup.ts` and `opencode/src`.
- **Channels.ts vs version.ts: dual semver regex for isPrerelease** — different pattern acceptance criteria.

---

## 5. SPINOSA COMMANDS (startup.ts, create.ts, upgrade.ts, builder.ts, utils)

**Agent:** SpinosaCommands | **20 findings** | **13 files**

### 🔴 Critical
- **Upgrade downloads installer without integrity verification** (upgrade.ts:174-192) — script written to disk at line 180, executed at line 192 with no checksum, signature, or hash. MITM/GitHub compromise → arbitrary code execution.
- **No rollback on partial/corrupted upgrade** (upgrade.ts:192-202) — `spawnSync("bash", [installerPath])` mutates framework root. If killed mid-execution, existing installation is left corrupted. No backup, no snapshot.
- **`fetch()` calls lack timeout — indefinite hang** (upgrade.ts:68, 174) — bare `fetch()` with no `AbortController`. Network stall blocks upgrade forever.

### 🟠 High
- **Template copy failure leaves orphan workspace directory** (create.ts:65-74) — `mkdirSync` creates directory, then `copyDirContents` throws → directory left on disk with no cleanup.
- **Heredoc delimiter injection in builder** (builder.ts:36-58) — prompt content containing literal `SPINOSA_STARTUP_PROMPT` terminates heredoc early → shell code injection. Prompt comes from potentially user-modified template file.
- **`copyToClipboard` return value ignored** (startup.ts:201, onboard.ts:168) — both startup and onboard ignore clipboard copy success. User sees "prompt_copied" even on headless systems where copy failed.
- **`Bun.write` errors unhandled in startup.ts and onboard.ts** — `await Bun.write(summaryPath, content)` with no try/catch. Disk full crashes the caller.
- **TOCTOU race in `resolveWorkspacePath`** (create.ts:33-36) — `existsSync` check and `mkdirSync` not atomic. Two concurrent creates pick same name.

### 🟡 Medium
- **`frameworkVersion` silently returns "dev" on missing version file** (create.ts:46-51) — workspace metadata records "dev" permanently when actual version might differ.
- **`resolveWorkspacePath` infinite retry on `existsSync` collision** (create.ts:33-42) — `count` not bounded. Extremely unlikely but theoretically infinite.
- **`compareFrameworkVersions` 3rd semver impl** (utils/version.ts) — alongside bash `compare_versions` and discovery.ts. Confirms duplication pattern.
- **`upgrade()` returns success even when channel is unknown** (upgrade.ts:53-60) — early return for "unknown" installation method but doesn't differentiate from successful upgrade.

---

## 6. SPINOSA DIALOGS & TESTS (3 dialogs, 3 test files)

**Agent:** SpinosaDialogs | **13 findings** | **6 files**

### 🟠 High
- **Workspace picker `createResource` error state never rendered** (dialog-spinosa-workspace-picker.tsx:87-108,195-281) — when `listRegisteredWorkspaces()` throws, `workspaces()` is `undefined`, `sorted()` returns `[]`, user sees **"No registered workspaces found."** — completely misleading. No error display, no toast, no console.warn.
- **Post-dismissal async race in `chooseWorkspace`** (dialog-spinosa-workspace-picker.tsx:131-146) — `getWorkspaceLaunchDecision` awaits I/O. If user presses Escape during I/O, `dialog.replace()` executes on an already-dismissed stack, re-adding the dialog with stale state.
- **`dialog.clear()` called before async work completes** (dialog-spinosa-startup-choice.tsx:23-34) — both `launchStartupInChat` and `openChatDirectly` call `dialog.clear()` synchronously then perform async I/O. Throw during async → unhandled rejection, dialog already gone.

### 🟡 Medium
- **Empty catch block in `getLastAccessed`** (dialog-spinosa-workspace-picker.tsx:60-64) — swallows EACCES, ENOENT, everything. `statSync` errors for permission issues are invisible.
- **No fallback button for network errors in workspace picker** — when registry fetch fails, there's no retry button.
- **`add-files-edge.test.tsx` tests only happy paths** — no tests for YAML parse failures, missing frontmatter, empty directories, concurrent registrations.

### 🟡 Low
- **`getLastAccessed` returns `0` on error → shown as `"unknown"`** — confusion between "not found" and "permission error".
- **Guard negative `selected()` index** — workspace picker allows out-of-bounds selection via keyboard when filtered list is shorter.

---

## 7. SCRIPTS & WORKSPACE TEMPLATE (build-tui.ts, publish-tui.ts, release.sh, workspace-template/*)

**Agent:** SpinosaScripts | **31 findings** | **many files**

### 🔴 Critical
- **Build script imports through opaque `node_modules` path** (build-tui.ts:11) — `import … from "../packages/opencode/node_modules/@opentui/…"`. Only works if `bun install` run in that package. Couples build to specific repo layout.
- **Build failures leave orphaned `dist/` contents** (build-tui.ts:53,95-128) — `rm -rf dist` first, then loops targets with NO try/catch. One failure → script aborts, `dist/` has partial output. `Bun.build()` return value never checked.
- **No dry-run mode in publish** (publish-tui.ts:32) — every invocation does real npm publish. No way to validate without actually publishing.
- **Build failure propagates silently to publish** (publish-tui.ts:38) — if `build-tui.ts` partially succeeds (some targets built, some failed), publish iterates `dist/` and publishes whatever exists. Partial platform set published as full release.
- **No try/catch in `publishPackage`** (publish-tui.ts:25-34) — npm publish fails for one platform → unhandled rejection aborts script. Earlier published packages remain published. No rollback.
- **`.hermes/workspace.config.yaml` hardcodes developer's absolute path** — contains machine-specific paths. Not portable.
- **`sed -i ''` in release.sh corrupts assets on failure** — in-place sed with no backup. On error (disk full, permissions), asset is partially modified.
- **`head -1` in tarball extraction** — drops extra top-level directories if tarball has multiple entries at root.

### 🟠 High
- **Native module pre-install has no error isolation** (build-tui.ts:56-60) — sequential `bun install --os="*"` for each module. One failure aborts all. Cross-platform downloads can fail for specific arch/os combos.
- **npm availability check can false-negative** (publish-tui.ts:21-23) — `npm view` returns non-zero on registry unreachable → `published()` returns `false` → attempts to publish already-existing package → 403 error.
- **Dist-tag derived implicitly from version string** (publish-tui.ts:19) — `TUI_VERSION.includes("-") ? "beta" : "latest"`. Fragile. Dev versions publish to "beta" tag.
- **build-tui.ts embedded version at compile time — no source of truth** (build-tui.ts:111) — `TUI_VERSION` from root `package.json` compiled into binary. No way to verify which version binary was built from.

### 🟡 Medium/Low
- **workspace-template `.bin/spinosa` dead code for root resolution** — 3-tier root resolution (relative, 2-up, versions/ loop) for simple path lookup. Confirms SYSTEM_AUDIT.md finding.
- **CLAUDE.md duplicate `generated_by` in YAML frontmatter** — workspace template files have stale/duplicate metadata.
- **`dist/` deletion uses raw shell with no error checking** — if `dist/` is a mount point or symlink, could fail silently.

---

## Cumulative Spinosa Finding Distribution

| Area | Files | Findings | High+Critical | Source |
|------|-------|----------|---------------|--------|
| Spinosa Routes (TSX) | 4 | 19 | 6 | SpinosaRoutes |
| Spinosa Module | 14 | 20 | 8 | SpinosaModule |
| Import & Workspace | 6 | 14 | 4 | SpinosaImport |
| Extensions & System | 13 | 29 | 8 | SpinosaExtensions |
| Commands & Utils | 13 | 20 | 7 | SpinosaCommands |
| Dialogs & Tests | 6 | 13 | 3 | SpinosaDialogs |
| Scripts & Template | ~15 | 31 | 10 | SpinosaScripts |
| SYSTEM_AUDIT.md (existing) | ~30 | ~230 | ~50 | Prior audit |
| **TOTAL SPINOSA** | **~100** | **~376** | **~96** | |

---

## What Can Actually Fuck Up Spinosa (Risk-Ranked)

### Will Break (fix immediately)
1. **PDF documents never destroyed** — memory leak proportional to page count in OCR pipeline. 200-page PDF = 200 leaked `PDFDocumentProxy` instances + WASM heap.
2. **Workspace registry write corruption** — concurrent `registerWorkspace` calls silently lose registrations.
3. **Upgrade downloads installer without integrity check** — MITM → arbitrary code execution.
4. **Tool detection is ALL stubs** — `pdfjsAvailable()`, `ocrAvailable()` all return `true` unconditionally. First use of missing library = crash.
5. **`logEntry` silently swallows ALL write failures** — entire logging subsystem can go dead without signal.
6. **Build script partial failure publishes incomplete release** — no per-target error handling → partial platform set published as full release.
7. **Channels config read/write path mismatch** — `SPINOSA_METADATA_DIR` set → writes invisible to readers.
8. **`buildImportScanPreview` creates workspace in wrong directory** — passes basename instead of full path.

### Will Cause Data Loss
9. **No rollback on partial upgrade** — killed mid-upgrade = broken installation. No backup.
10. **`copyToClipboard` return ignored** — headless/CI systems silently fail to copy, user thinks it worked.
11. **`Bun.write` fires-and-forgets** — unhandled rejection on disk full/permissions for config writes.
12. **Registry pipe-splitting ambiguity** — `|` in project names corrupts registry.

### Will Cause Bad UX
13. **Workspace picker error → misleading "No workspaces found"** — network failure shows empty state instead of error.
14. **`runToolRepair` is a no-op stub in add-files** — button does nothing but shows progress feedback.
15. **Dialog race on Escape during async I/O** — dismissed dialog reappears with stale state.
16. **Spin timer leaks on unmount** — interval continues firing after navigation away.

### Will Cause Production Incidents
17. **No try/catch in `publishPackage`** — one platform publish failure → partial release with no rollback.
18. **No dry-run for publish** — every invocation is a real publish.
19. **`fetch()` calls with no timeout** — network stall blocks upgrade indefinitely.
20. **`resolvePinnedVersionFromInstaller` throws on DNS failure** — entire update check crashes.

---

## Cross-Reference with SYSTEM_AUDIT.md

| SYSTEM_AUDIT.md finding | This audit confirms/extends |
|-------------------------|----------------------------|
| install.sh `download_and_verify` never called | upgrade.ts `fetch(installerUrl)` has NO verification — stricter |
| 3 semver implementations | Confirmed: version.ts + channels.ts + discovery.ts |
| pipeline.ts / onboard.ts / add.ts duplication | Import pipeline duplication extends to ppu-ocr.ts, cancellation.ts, batch.ts |
| log.ts silent failures | Confirmed: `catch { // best-effort }` in log.ts |
| runner.ts duplicated CLI map | handoff/builder.ts duplicates template logic |
| channels.ts fix needed | NEW finding: SPINOSA_METADATA_DIR read/write path mismatch |
| spinner orphan zombie | NEW finding: `spinTimer` interval leaks on unmount in add-files.tsx |

**Files in SYSTEM_AUDIT.md that still deserve a second look with current changes:**
- `packages/tui/src/spinosa-core/commands/onboard.ts` — has NEW `copyToClipboard` return value ignored issue
- `packages/tui/src/spinosa-core/commands/startup.ts` — has NEW `Bun.write` unhandled error issue

---

## Appendix: Agent Output Files

All per-agent findings stored at `local://<name>-findings.md`:
- `local://SpinosaRoutes-findings.md` — 19 findings
- `local://SpinosaModule-findings.md` — 20 findings
- `local://SpinosaImport-findings.md` — 14 findings
- `local://SpinosaExtensions-findings.md` — 29 findings
- `local://SpinosaCommands-findings.md` — 20 findings
- `local://SpinosaDialogs-findings.md` — 13 findings
- `local://SpinosaScripts-findings.md` — 31 findings
