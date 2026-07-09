# Spinosa — System Audit

> 15 agents × 14 perspectives. ~300 findings distilled to impact-sorted flat list.

## install.sh (1482 lines)

install.sh:472-546:safe_untar() — 74-line tar extraction with path-traversal, symlink-escape, and hard-link checks **NEVER called**. main() uses raw `tar -xzf` | impact:high | category:dead
install.sh:1050-1097:download_and_verify() — 47-line download with retry loop, API fallback, SHA-256 verification **NEVER called**. main() uses raw `download()` without verification | impact:high | category:dead
install.sh:300-314:detect_platform_suffix() — exact duplicate of detect_platform() (L278-298). Both parse `uname -s/m` identically. Never called | impact:high | category:dead
install.sh:627-634:channel_install_url() — stable AND beta/dev cases return **identical URL** (`main/install.sh`). Beta channel resolution is broken | impact:high | category:dead
install.sh:278-298 vs 300-314:detect_platform() vs detect_platform_suffix() — same 2×3 OS/ARCH matrix duplicated. detect_platform_suffix is dead | impact:medium | category:dup
install.sh:759-829:compare_versions() — 70-line hand-written semver comparator with prerelease parsing. `sort -V` exists on both platforms. Also a 3rd semver impl alongside TS version | impact:medium | category:over
install.sh:183-197:spinner_start() — 12-frame animated spinner in a background subshell with `while true; sleep 0.1`. Orphans zombie if parent crashes before spinner_stop. 10 wakeups/sec for a cosmetic effect | impact:medium | category:over
install.sh:909-992:prompt_upgrade() — 83 lines handling 10+ upgrade/downgrade/reinstall/yes flag combinations. Each branch repeats same read-tty + case pattern | impact:medium | category:over
install.sh:86:spinner_stop 2>/dev/null || true — ERR trap hides cleanup failures during crash handling | impact:high | category:break
install.sh:62,72,80:spinosa_log_init() mkdir/printf with `|| return 0` — log init failures silently discarded | impact:medium | category:break
install.sh:81:spinosa_log() `>> "$log_file" 2>/dev/null || true` — every log write silently drops failures | impact:medium | category:break
install.sh:87:ERR trap writes spinosa_log to file nobody reads. Post-install says "See ...spinosa.log" but no validation | impact:medium | category:break
install.sh:458-468:_realpath() — 11-line `readlink -f` reimplementation. Never called | impact:medium | category:dead
install.sh:733-741:reclaim_all_incomplete_versions() — iterates versions/ dir. Never called by main() | impact:medium | category:dead
install.sh:724-731:reclaim_incomplete_version() — only called from dead parent above. ERR trap duplicates the rm -rf inline | impact:medium | category:dead
install.sh:750-753:install_install_state_lib() — no-op stub with comment "all functionality in TypeScript". Never called | impact:low | category:dead
install.sh:140:fail() — defined as UI helper but never called. Only die() is ever used | impact:low | category:dead
install.sh:229:--no-gum alias for --no-bundled-tools. Undocumented, legacy compat | impact:low | category:dead
install.sh:431-443:available_disk_bytes() + disk_mb_rounded_down() — 12 lines wrapping df |awk, only ever called in sequence | impact:low | category:over
install.sh:214-272:58-line flag parsing (12 branches, 24-line --help). Could be 20-line getopts | impact:low | category:over
install.sh:648-667:config_set_key()/config_delete_key() — duplicate `uname -s` = Darwin → sed -i '' else sed -i pattern | impact:low | category:dup
install.sh:1418:cleanup() trap + ERR trap both try to clean incomplete versions | impact:low | category:dup
install.sh:584-585:clean_macos_metadata() find/delete with `2>/dev/null || true` | impact:low | category:break

## workspace-template/.bin/spinosa (148 lines)

spinosa:139-142:if RESOLVED_ROOT empty + BUN found → path becomes `/packages/opencode` — nonsensical root-relative path, cryptic ENOENT instead of "root not found" | impact:high | category:break
spinosa:53-58:upgrade handler re-downloads install.sh via curl-to-bash from raw GitHub URL when local copy exists. Fails offline | impact:medium | category:dead
spinosa:139-144:error says "Run installer or re-install deps" when root resolution failed, not install issue | impact:medium | category:break
spinosa:10-34:3-tier root resolution (relative, 2-up, versions/ loop with grep+sort) for simple path lookup | impact:low | category:over
spinosa:36-39:dead `if [[ -z "$BUN" ]]` guard — BUN is always empty before this check | impact:low | category:dead
spinosa:63-70:uninstaller duplicates "SPINOSA" ASCII art from install.sh | impact:low | category:dup

## packages/tui/src/app.tsx (1140 lines)

app.tsx:247-361:27 providers nested 35-levels deep under single render() — provider soup blocking tree-shaking, lazy loading, testability | impact:high | category:over
app.tsx:376-1139:24 useXxx() hook calls consuming every context, many only used in sub-components | impact:high | category:over
app.tsx:435-446:keymap.intercept() as render-body side effect with onCleanup cleanup. Re-registers on every re-render (SolidJS violation) | impact:high | category:solidjs
app.tsx:1-89:71 import statements from ~69 modules. ~25% used more than once | impact:high | category:over
app.tsx:257:ErrorBoundary wraps entire provider chain. If lower Provider throws, fallback can't use any provider | impact:medium | category:break
app.tsx:249-360:ExitProvider + EpilogueProvider only providers outside ErrorBoundary. All others inside with no error isolation | impact:medium | category:break
app.tsx:571-963:appCommands createMemo rebuilds 70+ elements on any dependency change. Most entries reference zero reactive sources | impact:medium | category:solidjs
app.tsx:91-103:appGlobalBindingCommands — 12 static strings used exactly once. Could inline | impact:medium | category:over
app.tsx:105-138:appBindingCommands — 36 static strings used exactly once | impact:medium | category:over
app.tsx:29,33,41-48,56-57,70,81:14 dialog component imports eagerly loaded, each used in one dialog.replace() | impact:medium | category:over
app.tsx:321-324:PromptStashProvider → FrecencyProvider → PromptHistoryProvider — 3 always-co-located providers | impact:low | category:over
app.tsx:459-462:createSignal(kv.get(...)) — signals reading KV during component init; race if kv hasn't loaded | impact:low | category:break

## packages/tui/src/routes/home.tsx (305 lines)

home.tsx:30:dead `let once = false` module-level flag prevents --prompt auto-fill on remount (hot reload). Should be createSignal | impact:high | category:dead
home.tsx:28:`buttonBackground` imported, never referenced in JSX or body | impact:high | category:dead
home.tsx:62:destructured `refetch: refetchBundled` never used | impact:high | category:dead
home.tsx:289:Prompt `ref={bind}` + Slot `ref={bind}` — both receive same callback, bind called twice for same instance | impact:high | category:break
home.tsx:30:module-level `once` vs local `let sent = false` (L181) — inconsistent, module scope won't reset | impact:high | category:solidjs
home.tsx:33,41:`defaultPlaceholder.shell` and `spinosaPlaceholder.shell` are identical `["ls -la", "git status", "pwd"]` | impact:medium | category:dup
home.tsx:199-236:three createEffect blocks all watching ref()+startupPrompt() for overlapping concerns | impact:medium | category:solidjs
home.tsx:62,75:three createResource calls with no onCleanup to abort in-flight fetches on unmount | impact:medium | category:solidjs
home.tsx:1-28:28 imports for one route. 8 context hooks embedded directly | impact:medium | category:over

## Cross-cutting: Version/Upgrade Logic

install.sh:759-829 vs version.ts vs discovery.ts:34-54 — **3 distinct semver comparison implementations** with divergent edge-case behavior. Bash uses non-standard exit code convention (0/1/2) with `|| cmp=$?` caller pattern | impact:high | category:dup
install.sh:627-634:channel_install_url() — both stable and beta point to `main/install.sh`. Beta channel resolution is **fatally broken** | impact:high | category:break
channels.ts:178-179 vs version.ts:two different `isPrerelease` regexes — channels.ts restricts to `[0-9A-Za-z.]`, version.ts accepts anything after dash | impact:high | category:dup
upgrade.ts:version resolved TWICE — resolveReleaseVersionForChannel fetches install.sh, then installUrlForChannel constructs URL and spawns bash which re-fetches same bytes | impact:high | category:dup
channels.ts vs service.ts:84-96:THIRD channel detection via version-string introspection (prerelease = beta, semver = stable). Three mechanisms: config/env, compile-time constant, version shape | impact:high | category:dup
upgrade.ts:120-249:5-phase upgrade workflow (channel → resolve → release_notes → confirm → download → install) wrapping a single bash spawn. Phases are metadata/IO, not real work | impact:high | category:over
upgrade.ts:178,188:fetch() and response.text() with no try/catch — tmpdir leaks on network failure | impact:high | category:break
upgrade.ts:137:resolveReleaseVersionForChannel unhandled rejection; contrast with wrapped version at L292 | impact:high | category:break
upgrade.ts:253-254:empty `if` block when SPINOSA_NO_UPGRADE_CHECK="1" — falls through instead of early return. Env var is a no-op | impact:medium | category:break
upgrade.ts:85-87:fetchReleaseNotes catch returns undefined — caller can't distinguish "no notes" from "API down" | impact:low | category:break
upgrade.ts:60-66:readConfigValue sync variant duplicates async version in channels.ts:42-48 | impact:medium | category:dup

## packages/tui/src/spinosa-core/commands/update.ts (337 lines)

update.ts:217,255:safeCopy() return value ignored — copy failure silently considered success | impact:high | category:break
update.ts:279-282:rmSync in try/catch with `/* best effort */` — removal count under-reported | impact:medium | category:break
update.ts:127-129:readFrameworkChecksums catch returns {} — corrupt checksum silently ignored; all replace_if_unmodified files get first-update-proceed path | impact:medium | category:break
update.ts:143-337:5 phases (numbered 1,2,3,5 — no phase 4) for a file sync operation. ~100 lines of checksum tracking for files that users never modify | impact:medium | category:over
update.ts:84-87:templateRoot() duplicates resolveTemplateRootFromFrameworkRoot from discovery.ts | impact:high | category:dup
update.ts:162-172:version guard rejects downgrades — duplicates compare_versions logic from install.sh | impact:medium | category:dup

## packages/tui/src/spinosa-core/framework/discovery.ts (163 lines)

discovery.ts:34-54:compareFrameworkVersions is 3rd semver implementation. Does NOT handle "dev"/"vdev" or undefined inputs unlike canonical version in utils/version.ts | impact:high | category:dup
discovery.ts:14:hasFrameworkMarker exported but never imported outside this file (0 external callers) | impact:medium | category:dead
discovery.ts:8-12:MARKER/LEGACY_MARKER/ANCIENT_MARKER duplicate path in FRAMEWORK_MARKER constant (constants.ts:32). 4 representations of same marker | impact:medium | category:dup
discovery.ts:121:readFrameworkFile returns undefined on any error with no diagnostic logged. service.ts:60 caller can't distinguish causes | impact:medium | category:break
discovery.ts:56:discoverInstalledFramework returns undefined silently on catch — version dir unreadable, suppressed | impact:medium | category:break
discovery.ts:95-111:resolveFrameworkRoot tries cwd() + ~/Documents/spinosa-main + discoverInstalledFramework — 3 strategies. SPINOSA_TEMPLATE_ROOT vs SPINOSA_FRAMEWORK_ROOT used interchangeably | impact:medium | category:over
discovery.ts:121-132:readFrameworkFile uses Bun.file() async while siblings use sync existsSync/readFileSync — mixed I/O patterns | impact:low | category:over

## packages/tui/src/plugin/adapters.tsx (363 lines)

adapters.tsx:23-39:Input type has 15 named fields passed individually to createTuiApiAdapters | impact:high | category:over
adapters.tsx:181-363:createTuiApiAdapters returns ~30 methods, most are 1:1 delegation with zero transformation | impact:high | category:over
adapters.tsx:186:command: createCommandShim — 3-param legacy bridge for deprecated v1 API | impact:medium | category:dead
adapters.tsx:90-99:pickOption + mapOptionCb (L101-104) — round-trip mapping mapOption → pickOption just for callback conversion | impact:low | category:over
local.tsx:191,446:.catch(() => {}) — silent swallow of readJson parse/IO errors. state stays at defaults, ready=true signals upstream with empty data | impact:high | category:break
local.tsx:51-542:LocalProvider wraps entire subtree in Show-wrapped ready gate | impact:medium | category:over

## packages/tui/src/spinosa-core/import/pipeline.ts (637 lines)

pipeline.ts:162-285:processMarkitdown repeats same try/catch + ndjson logging + progress pattern 3 times (preSkipped, pdf-js, markitdown-ts, inline) — 124 lines where 40 suffice | impact:high | category:dup
pipeline.ts:247-284:inline format conversion duplicates markitdown-ts block with only engine name changed | impact:high | category:dup
pipeline.ts:361-377:expectedImportDestRel() duplicates route resolution from classifier — every new route in two places | impact:high | category:dup
pipeline.ts:472-581:verifyAndRecoverImport re-implements ENTIRE pipeline (classify + route + copy/convert) instead of calling copySource piecewise — 110 lines duplicating processDirectCopy, processMarkitdown, processOcr | impact:high | category:dup
pipeline.ts:585-636:copySource orchestrates scanAndClassifySource + phases + verify — same flow onboard.ts also orchestrates | impact:high | category:over
pipeline.ts:637:File ends at 637 lines for: read → classify → convert → verify. Core is ~150 lines | impact:high | category:over
pipeline.ts:51-56:PhaseResult duplicates CopyResult structure | impact:medium | category:dup
pipeline.ts:25-35:CopyResult has 10 counter fields for what callers only read as totalCopied | impact:medium | category:over
pipeline.ts:39-47:CopyOptions has 7 fields with 5 optional callbacks | impact:medium | category:over

## packages/tui/src/spinosa-core/commands/onboard.ts (342 lines)

onboard.ts:216-277:runOnboarding labelled "Legacy wrapper" but IS main export — duplicates entire import flow from pipeline's copySource with manual phase dispatch | impact:high | category:dup
onboard.ts:218-277:runOnboarding calls scanAndClassifySource + processDirectCopy/Markitdown/Ocr inline. Pipeline changes must update BOTH files | impact:high | category:break
onboard.ts:342:Core wizard logic (scan → validate → import → handoff) is ~80 lines of real work in 342-line file | impact:high | category:over
onboard.ts:36-41:OnboardingHandoffResult duplicates HandoffResult from runner.ts | impact:medium | category:dup
onboard.ts:66-75:OnboardingSummary copies fields from OnboardingResult + adds presentation fields | impact:medium | category:dup
onboard.ts:258-260:dead logging — always says "phase=markitdown skipped (0 files)" | impact:low | category:dead

## packages/tui/src/spinosa-core/commands/add.ts (539 lines)

add.ts:105-363:addFilesFromDir (258 lines) duplicates scanAndClassifySource + processDirectCopy + processMarkitdown + processOcr ALL INLINE | impact:high | category:dup
add.ts:365-538:addSingleFile (174 lines) duplicates same 5-classification switch as addFilesFromDir | impact:high | category:dup
add.ts:539: pipeline.ts + onboard.ts + add.ts = ~1500 lines for THREE implementations of same import flow | impact:high | category:break
add.ts:27-47:AddFilesOptions/Result duplicate CopyOptions/Result from pipeline.ts | impact:medium | category:dup
add.ts:49-88:runBatchMarkitdown + runBatchOcr duplicate processMarkitdown + processOcr from pipeline.ts | impact:high | category:dup

## packages/tui/src/spinosa-core/handoff/runner.ts (228 lines)

runner.ts:110-202:runCliWithPrompt — 107-line switch with 9 cases, each 5-12 lines doing SAME pattern: existsOnPath → createTempDir → prepareTempPrompt → promptLaunchScript → launchInTerminal. Only CLI command template differs | impact:high | category:dup
runner.ts:110-202:Could be data map of { bin, cmd } — 30 lines instead of 107 | impact:high | category:over
runner.ts:10-31:CLI label list duplicates CLI-to-command mapping in runCliWithPrompt. Add a CLI? Update two places | impact:high | category:break
runner.ts:204-210:HandoffResult enum duplicates OnboardingHandoffResult from onboard.ts | impact:medium | category:dup

## packages/tui/src/spinosa-core/utils/

fs.ts:57-60:copyFileViaStream catch returns false — all copy errors swallowed. Callers safeCopy/safeCopyAsync retry then return false, but update.ts ignores the boolean | impact:high | category:break
fs.ts:63-89:safeCopy returns false on exhaustion with no logging, no error message | impact:medium | category:break
fs.ts:124-131:safeCopyTree silently skips symlinks on copy failure; no log, no fallback to file copy | impact:medium | category:break
fs.ts:52:unlinkSync(tmp) catch { /* ignore */ } — stale .spinosa-part temp file may remain | impact:low | category:break
fs.ts:198-199:fileSizeBytes — no try/catch around statSync; throws on missing/deleted file | impact:low | category:break
scanner.ts:73:statSync(fp).size — no try/catch; file deleted between findSourceFiles and stat crashes entire scan | impact:medium | category:break
scanner.ts:65:await classifySourceFile(fp) — no try/catch per file; single classification throw aborts scanSource | impact:medium | category:break
progress.ts:19:if any ProgressListener throws, subsequent listeners not called, error propagates to caller | impact:medium | category:break
log.ts:27:spinosaLog catch { /* best effort */ } — ALL log writes silently fail. spinosaLogError can't report own failure | impact:high | category:break
log.ts:14:ensureLogDir catch { /* best effort */ } — on first-call mkdir failure, initialized=true is set; subsequent writes skip retry guaranteeing silent log loss | impact:medium | category:break

## packages/tui/src/context/local.tsx

local.tsx:191:.catch(() => {}) — silent swallow of readJson errors for model.json. ready=true signals upstream with empty data | impact:high | category:break
local.tsx:446:.catch(() => {}) — same for session.json | impact:high | category:break
local.tsx:51-542:540-line provider wrapping entire subtree in Show-wrapped ready gate | impact:medium | category:over

## packages/tui/src/ (SolidJS Anti-patterns)

prompt/index.tsx:module-level `let stashed` — mutable state shared across component instances, violates SolidJS component-scoped reactivity | impact:high | category:solidjs
dialog-select.tsx:createMemo inside `<For>` callback — For does not create component boundary, memos owned by parent fragile to reordering | impact:medium | category:solidjs
3 components using createResource(() => undefined, …) with no refetch mechanism — data fetched once, never refreshed | impact:medium | category:solidjs
startup-loading.tsx:mutable `let` timer variables read inside createEffect — manual timing, races | impact:medium | category:solidjs
5 `.tsx` files with zero JSX: use-connected.tsx, prompt/{move,workspace,stash,frecency,history}.tsx — should be `.ts` | impact:low | category:solidjs

## packages/tui/src/config/ + theme/

config/keybind.ts:23.4KB — 23KB of keybinding declarations for a TUI | impact:high | category:over
theme/index.ts:27.7KB — largest file in TUI. Questionable how much is actually referenced | impact:high | category:over
keymap.tsx + config/keybind.ts — two keybinding modules, unclear boundary | impact:medium | category:dup
clipboard.ts:4.6KB — navigator.clipboard API exists natively | impact:medium | category:over

## script/release.sh (92 lines)

release.sh:44-57:Asset prep block duplicated (tag asset vs channel asset) — cp + 2x sed + shasum repeated verbatim | impact:medium | category:dup
release.sh:92:92 lines for essentially `gh release create` + `git tag -f` + `gh release upload` — ~3 core commands | impact:high | category:over
release.sh:95:Verification curl-pipes-to-grep — depends on release being live | impact:medium | category:over

## Summary counts (all findings)

| Category | Count |
|----------|-------|
| **dead** (dead code, dead args, dead exports) | ~30 |
| **over** (over-engineering, abstraction bloat) | ~75 |
| **break** (silent breaks, unhandled errors, swallowed failures) | ~45 |
| **dup** (duplicated logic, 3× same function) | ~50 |
| **stdlib** (reimplemented platform APIs) | ~10 |
| **solidjs** (SolidJS anti-patterns) | ~20 |

**Total: ~230 findings (high: ~50, medium: ~100, low: ~80)**
