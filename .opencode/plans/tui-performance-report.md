# Spinosa TUI Performance Analysis — 12-Dimension Deep Dive

**Date**: 2026-07-10
**Methodology**: 12 parallel persona-driven sub-agents, each auditing a distinct performance dimension. 157 bottlenecks identified and classified.

---

## Top 20 Bottlenecks (by user-facing impact)

### 🔴 1. `waitForThemeMode(1000)` blocks first paint for up to 1 second
**File**: `packages/tui/src/app.tsx:248` | **Fix**: Two-phase render — fallback `"dark"` immediately, flip reactively. Reduce timeout to 200ms.

### 🔴 2. SyncProvider bootstraps 10+ blocking HTTP calls before UI interactive
**File**: `packages/tui/src/context/sync.tsx:445-546` | **Fix**: Skeleton-first render; promote `skipInitialLoading` to default.

### 🔴 3. Plugin host loading gates entire UI via `<Show when={ready()}>`
**File**: `packages/tui/src/app.tsx:434-446` | **Fix**: Gate only plugin slots, not the full body.

### 🔴 4. No stable keys on `<For each={messages()}>` — full list teardown per message
**File**: `packages/tui/src/routes/session/index.tsx:1300` | **Fix**: Use stable item references or keyed `<For>`.

### 🔴 5. `toolCalloutSides()` O(n*m) recompute on every streaming update
**File**: `packages/tui/src/routes/session/index.tsx:320-369` | **Fix**: Memoize by last-updated message ID.

### 🔴 6. `createSimpleContext` `<Show when={ready}>` gates all provider subtrees
**File**: `packages/tui/src/context/helper.tsx:15` | **Fix**: Remove gate for non-critical providers.

### 🔴 7. No virtual scrolling — all 100 messages rendered always
**File**: `packages/tui/src/routes/session/index.tsx:1281-1396` | **Fix**: Enable `viewportCulling`; implement windowed rendering.

### 🔴 8. Terminal resize storms — 36 subscribers, no debounce
**File**: 36 call sites across 16 files | **Fix**: Add `debounceDelay` to renderer config; share single root dimensions signal.

### 🔴 9. SDK `req.timeout = false` — all fetches can hang indefinitely
**File**: `sdk/src/v2/client.ts:54` | **Fix**: Default 30s `AbortSignal.timeout()` in `_fetch()`.

### 🔴 10. 33 theme JSONs eagerly parsed at module load (~155 KB + 50-80ms)
**File**: `packages/tui/src/theme/index.ts:2-34` | **Fix**: Lazy-load themes; load only active one.

### 🟠 11. `message.part.delta` per-token without `batch()` or coalescing
**File**: `packages/tui/src/context/sync.tsx:392-408` | **Fix**: Wrap in `batch()`; add delta accumulator with rAF flush.

### 🟠 12. Sticky scroll recalculates on every streaming content change
**File**: `packages/tui/src/routes/session/index.tsx:1294-1295` | **Fix**: Short-circuit when `_hasManualScroll` is true.

### 🟠 13. Monolithic sync store — 27 subscribers, all notified on any mutation
**File**: `packages/tui/src/context/sync.tsx:64-138` | **Fix**: Split into domain-specific stores.

### 🟠 14. 67 synchronous filesystem calls in hot render paths
**File**: add-files.tsx, onboarding.tsx (338-341, 393-396) | **Fix**: Replace with async alternatives.

### 🟠 15. Logging modules call `mkdirSync`+`statSync` on every log write
**File**: `spinosa/log.ts:34-42`, `spinosa-core/utils/log.ts:10-18` | **Fix**: Use async writes; batch log events.

### 🟠 16. Delta string concat creates new string per streaming event
**File**: `sync.tsx:405` | **Fix**: Buffer deltas in memory; flush periodically.

### 🟠 17. Markdown/code full re-parse per streaming token (O(n²))
**File**: `session/index.tsx:2021,1953` | **Fix**: Incremental markdown parsing.

### 🟠 18. No FPS, no render timing, no latency metrics — completely blind
**File**: Systemic | **Fix**: Add `performance.now()` markers on bootstrap, session sync, streaming.

### 🟠 19. Inline arrow functions in 100+ event handlers defeat Solid granular tracking
**File**: `session/index.tsx` (27), `prompt/index.tsx` (12+) | **Fix**: Extract stable handler references.

### 🟠 20. `spinosa-core` barrel eagerly imports `pdfjs-dist` + `@napi-rs/canvas`
**File**: `spinosa-core/index.ts` | **Fix**: Remove heavy modules from barrel; use deep imports.

---

## Dimension Summary

| Dimension | Critical | High | Medium | Low | Total |
|-----------|----------|------|--------|-----|-------|
| Startup Sequence | 0 | 4 | 0 | 2 | 6 |
| SolidJS Render | 2 | 4 | 4 | 2 | 12 |
| Sync Filesystem I/O | 0 | 20 | 8 | 39 | 67 |
| OpenTUI Rendering | 0 | 2 | 2 | 2 | 6 |
| State Management | 2 | 2 | 2 | 2 | 8 |
| Network/Fetch | 3 | 5 | 3 | 5 | 16 |
| Module Loading | 0 | 2 | 2 | 1 | 5 |
| Memory/GC | 0 | 3 | 4 | 3 | 10 |
| Streaming | 0 | 4 | 2 | 1 | 7 |
| Caching/Memo | 0 | 2 | 6 | 2 | 10 |
| Metrics | 4 | 2 | 2 | 2 | 10 |
| Event Processing | *(merged into Streaming)* | | | | |
| **TOTAL** | **11** | **50** | **35** | **61** | **157** |

---

## Quick Wins (<1 day each)

| Pri | Fix | Effort |
|-----|-----|--------|
| P0 | Add `debounceDelay` to `createCliRenderer` config | 5 min |
| P0 | Guard `import("./terminal-win32")` with `process.platform` | 5 min |
| P0 | Reduce `waitForThemeMode` timeout from 1000ms to 200ms | 2 min |
| P0 | Remove `<Show when={ready}>` from non-critical providers | 30 min |
| P0 | Add `batch()` around `message.part.delta` handler | 10 min |
| P1 | Enable `viewportCulling` on session scrollbox | 15 min |
| P1 | Replace sync I/O in wizard render paths | 1-2 h |
| P1 | Promote `skipInitialLoading` to default | 30 min |
| P1 | Lazy-load theme JSONs | 1 h |
| P1 | Increase SDK batch window 16→50ms | 15 min |
| P2 | Remove `createMemo(() => true)` dead memo | 2 min |
| P2 | Add `requestLive()`/`dropLive()` around streaming | 1 h |
| P2 | Defer route components with `lazy()` | 2-3 h |
| P2 | Split sync store into domains | 4-6 h |
| P3 | Add `performance.now()` markers on key paths | 2 h |
| P3 | Build FPS counter from rAF | 1 h |
| P3 | Add fetch timeout to SDK client | 30 min |

---

*Generated by 12 parallel persona-driven sub-agents. All findings are evidence-backed with file:line references.*
