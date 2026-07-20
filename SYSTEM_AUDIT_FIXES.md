# Spinosa — Fix Plan

> Prioritized by impact:effort ratio. ~230 findings → 30 actions.

---

## TIER 1 — Bugs that lose data / break features (do first)

### 1. Fix broken beta channel resolution
**install.sh:627-634** — `channel_install_url()` returns `main/install.sh` for both `stable` and `beta` cases:
```
beta|dev) printf '...main/install.sh\n'   # WRONG — should be ...beta/install.sh
```
**Fix:** `beta|dev` case should point to `beta` branch URL.
**Effort:** 2 lines. **Impact:** beta channel users get wrong version.

### 2. Un-silence all swallowed catch blocks
**Files:** `log.ts:27`, `local.tsx:191/446`, `fs.ts:52/57-60`, `upgrade.ts:178/188`, `adapters.tsx:33`
**Pattern:** `catch { /* ignore */ }`, `.catch(() => {})`, `|| true` on every log call.
**Fix:** Replace every silent catch with at minimum `console.error(...)` or `spinosaLogError(...)`. Remove `|| true` from non-log lines.
**Effort:** ~20 edits, but each is one line. **Impact:** silent data loss → visible.

### 3. Kill dead `safe_untar()` and `download_and_verify()` — or wire them in
**install.sh:472-546, 1050-1097** — 120 lines of security checks + retry logic never run. `main()` does raw `tar -xzf` + `download()` without verification.
**Fix:** Either delete the dead functions or replace the raw calls in `main()`. Deleting is safer (the untar bypasses its own safety checks for archive extraction).
**Effort:** Remove 120 lines of dead code. **Impact:** smaller attack surface, no false sense of security.

### 4. Add error boundary isolation in app.tsx
**app.tsx:257** — `ErrorBoundary` wraps all 27 providers. If one provider mount fails, the fallback can't use any of them.
**Fix:** Move `ErrorBoundary` to wrap only the renderable `<App>` content, not the provider chain. Keep `ExitProvider`/`EpilogueProvider` outside.
**Effort:** Move 2 JSX elements. **Impact:** error recovery currently impossible.

### 5. Fix `safeCopy()` return value being ignored in update.ts
**update.ts:217,255** — `safeCopy()` returns `false` on failure but callers ignore it.
**Fix:** Check return, increment `failed` counter, log error. Or let it throw.
**Effort:** 4 lines. **Impact:** file write failures silently counted as success.

---

## TIER 2 — Delete duplication (high line count, low risk)

### 6. Delete `detect_platform_suffix()` — dead duplicate
**install.sh:300-314** — exact copy of `detect_platform()` (L278-298). Never called.
**Fix:** Remove the function.
**Effort:** 1 delete. **Impact:** -15 lines, no risk.

### 7. Delete `_realpath()` — dead, reimplements `readlink -f`
**install.sh:458-468** — never called.
**Fix:** Remove.
**Effort:** 1 delete. **Impact:** -11 lines.

### 8. Delete `reclaim_all_incomplete_versions()` / `reclaim_incomplete_version()` — dead
**install.sh:724-741** — never called. ERR trap does inline `rm -rf`.
**Fix:** Remove both.
**Effort:** 1 delete. **Impact:** -22 lines.

### 9. Delete `install_install_state_lib()` — dead no-op
**install.sh:750-753**
**Fix:** Remove.
**Effort:** 1 delete. **Impact:** -4 lines.

### 10. Delete `fail()` — defined but never used in install.sh
**install.sh:140** — only `die()` is ever called.
**Fix:** Remove or fold into `die()`.
**Effort:** 1 line. **Impact:** no risk.

### 11. Delete `hasFrameworkMarker()` export — 0 callers outside discovery.ts
**discovery.ts:14** — exported but never imported.
**Fix:** Make private or remove export.
**Effort:** 1 keyword. **Impact:** clearer API surface.

### 12. Delete `FRAMEWORK_MARKER` constant — never referenced
**constants.ts:32** — defined but never imported.
**Fix:** Remove.
**Effort:** 1 line. **Impact:** no risk.

### 13. Delete `install_install_state_lib()` — dead no-op
Already listed — just remove it.

---

## TIER 3 — Collapse duplicate implementations

### 14. Unify semver comparison to ONE implementation
**install.sh:759-829 + discovery.ts:34-54 + version.ts** — 3 implementations.
**Fix:** Keep the canonical TS one in `utils/version.ts`. Replace the bash one with `sort -V` (2 lines). Remove the private one in `discovery.ts` — call the public one.
**Effort:** ~70 lines deleted from install.sh, ~20 from discovery.ts. **Impact:** no more edge-case divergence.

### 15. Unify version cache strategy — or pick one
**install.sh:init_global_metadata()** migrates `version_check_cache` files that it never reads. **upgrade.ts** writes/reads them.
**Fix:** Remove the migration from install.sh. If TS manages the cache, let TS own it entirely.
**Effort:** 3 lines removed from install.sh.

### 16. Collapse pipeline.ts + onboard.ts + add.ts into ONE import pipeline
**Total:** ~1500 lines, 3 implementations of same flow (scan → classify → copy/convert).
**Fix:** `add.ts` should call `pipeline.ts` functions. `onboard.ts` should call `pipeline.ts`. Delete the duplicated inline logic in each.
**Effort:** Moderate — needs refactoring but has clear extract-targets. Delete ~800 lines of duplication.

### 17. Collapse `runCliWithPrompt` 9-case switch into data map
**runner.ts:110-202** — 107 lines, each case does same 5-step pattern.
**Fix:**
```
const CLIS = {
  codex: { bin: "codex", cmd: (r,p) => `codex -C '${r}' ...` },
  claude: { bin: "claude", cmd: (r,p) => `...` },
  ...
}
```
**Effort:** ~70 lines → ~30 lines.

### 18. Unify `readConfigValue` — sync in upgrade.ts vs async in channels.ts
**upgrade.ts:60-66** vs **channels.ts:42-48**
**Fix:** Pick one (async) and call it from both places.
**Effort:** 1 import change.

### 19. Unify `templateRoot()` → `resolveTemplateRootFromFrameworkRoot()`
**update.ts:84-87** + **startup.ts:121-124** + **discovery.ts:28-33** — 3 implementations.
**Fix:** Keep the one in discovery.ts, remove the other two, import it.
**Effort:** Delete ~12 lines, add 2 imports.

### 20. Unify `isPrereleaseVersion` regexes
**channels.ts:178** vs **version.ts** — different patterns.
**Fix:** Pick one (the broader one from version.ts) and export it, import in channels.ts.
**Effort:** 1 line.

---

## TIER 4 — Remove over-engineering

### 21. Replace `compare_versions()` in bash with `sort -V`
**install.sh:759-829** — 70 lines → 2 lines.
```
sort -V <<< "$1"$'\n'"$2" | head -1
```
**Effort:** -68 lines.

### 22. Replace spinner subshell with simpler approach
**install.sh:183-197** — background subshell with `while true; sleep 0.1` orphans zombie on crash.
**Fix:** Use `printf` with inline escape sequences, no subprocess. Or accept a simpler dot-based spinner.
**Effort:** -15 lines, eliminates zombie risk.

### 23. Collapse provider tree in app.tsx
**app.tsx:321-324** — `PromptStashProvider → FrecencyProvider → PromptHistoryProvider` always co-located.
**Fix:** Merge into one `PromptProviders` wrapper.
**Effort:** Move 3 imports into 1. **Impact:** cleaner nesting.

### 24. Remove `command-shim` legacy bridge
**adapters.tsx:186** — deprecated v1 plugin API.
**Fix:** If no plugins use v1 API, remove it.
**Effort:** 1 file deletion.

### 25. Cut unused imports from app.tsx
71 imports from ~69 modules for one file. Inline the ones used once far from import site (`open` package, `TuiAudio`, `win32DisableProcessedInput`).
**Effort:** Move 4 imports local.

---

## TIER 5 — Surface-level cleanup

### 26. Delete `once` flag in home.tsx
**home.tsx:30** — module-level `let once = false` should be `createSignal(false)` inside component.
**Effort:** 2 lines.

### 27. Extract shared `placeholder.shell` constant
**home.tsx:33,41** — identical `["ls -la", "git status", "pwd"]` duplicated.
**Effort:** 1 line.

### 28. Remove `refetch: refetchBundled` destructure
**home.tsx:62** — unused destructured binding.
**Effort:** 1 delete.

### 29. Remove `buttonBackground` import
**home.tsx:28** — imported, never used.
**Effort:** 1 line.

### 30. Rename `.tsx` files with zero JSX to `.ts`
**Files:** `use-connected.tsx`, `prompt/move.tsx`, `prompt/stash.tsx`, `prompt/frecency.tsx`, `prompt/history.tsx`
**Fix:** `mv {file}.tsx {file}.ts` + update imports.
**Effort:** 5 renames + import updates. **Impact:** clearer separation.

---

## Summary

| Tier | Actions | Lines removed | Risk |
|------|---------|---------------|------|
| 1 — Bugs | 5 | +30 (add error handling) | Must fix |
| 2 — Dead code | 8 | ~200 | None |
| 3 — Duplication | 7 | ~1,200 | Low |
| 4 — Over-engineering | 5 | ~150 | Low |
| 5 — Cleanup | 5 | ~20 | None |

**Total:** ~30 actions, ~1,600 lines removed, 5+ silent data-loss bugs fixed.
