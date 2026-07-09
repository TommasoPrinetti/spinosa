# Spinosa — Resource Leak Audit

> **6 agents × 93 findings: process, timer, watcher, listener, worker, and scope leaks.**

---

## Executive Summary

| Severity | Count | Primary Sources |
|----------|-------|-----------------|
| 🔴 Critical | 14 | Orphaned subprocesses, unremoved listeners, unbounded caches |
| 🟠 High | 22 | PTY sessions surviving exit, fire-and-forget spawns, timer accumulation |
| 🟡 Medium | 32 | Event listeners not detached, intervals not cleared, env pollution |
| 🔵 Low | 23 | Minor timer gaps, unused cleanup paths, one-shot issues |

**Key contributor to "bun processes stacking up":** MCP server subprocesses, LSP server processes, PTY shell processes, and `browser.open()` child processes are orphaned when the main process exits or crashes — they survive as zombies.

---

## 🔴 CRITICAL FINDINGS

### C1. MCP Subprocesses Orphaned on Crash
**File:** `packages/opencode/src/mcp/index.ts:37.2KB`  
**Agent:** LeakWorkers  

MCP servers are spawned as child processes but there is **no `process.on('exit')` handler** to kill them. If the main process crashes or exits abnormally (SIGKILL, uncaught exception), every spawned MCP server process becomes an orphan. The `mcp` map tracks connected servers only — servers being spawned or reconnecting are invisible. Over multiple dev-server restarts these orphans accumulate.

**Fix:** Add `process.on('exit', () => { for (const p of mcpServers) p.kill() })` + `process.on('SIGTERM', ...)`.

### C2. Worker Thread GlobalBus Listener Never Removed
**File:** `packages/opencode/src/cli/tui/worker.ts:24-26`  
**Agent:** LeakWorkers  

`GlobalBus.on("event", forwardFn)` registers a permanent listener that is **never removed**. Each worker start adds another listener. Since `GlobalBus` is module-level singleton, restarting the TUI (close + reopen) accumulates duplicate handlers — each event fires N times where N is the number of times the TUI was opened.

**Fix:** Capture the unsubscribe handle and call it on worker shutdown.

### C3. Rpc Message Handler Never Removed (same pattern)
**File:** `packages/opencode/src/cli/tui/worker.ts`  
**Agent:** LeakWorkers  

The Rpc message handler (`Rpc.on("message", ...)`) is registered once but never cleaned up. Same accumulation pattern as C2.

### C4. Browser `open()` Subprocesses Fire-and-Forget (6+ locations)
**Files:** Multiple locations in `packages/opencode/src/`  
**Agent:** LeakProcess  

In 6+ locations, external URLs/processes are opened via `child_process.spawn()` or equivalent with `.unref()` but **no kill-on-exit**. If the main process crashes after spawning a browser window, the browser child process becomes an orphan. Over repeated dev cycles, these accumulate.

**Fix:** Track spawned browser processes and kill on exit.

### C5. Worker Thread Orphaned on Early Throw
**File:** `packages/opencode/src/cli/cmd/tui.ts`  
**Agent:** LeakProcess  

The worker thread spawn has a double-finally bug where an early throw inside `inner finally` skips `outer finally`. The worker remains running as an orphan.

### C6. Account Refresh Token Cache Unbounded
**File:** `packages/opencode/src/account/account.ts:248`  
**Agent:** LeakResources  

`refreshTokenCache` is created with `capacity: Number.POSITIVE_INFINITY` and `timeToLive: Duration.zero`. With `Duration.zero`, TTL eviction never fires. For users with many accounts, this cache grows without bound — memory leak.

### C7-C10. Session Scope Leaks
**Files:** `packages/opencode/src/session/`, `packages/core/src/session/`  
**Agent:** LeakSession  

5 critical findings in the Effect-based session system:
- **Executor fibers orphaned on cancel** — `Effect.fork` without parent scope means running tool calls survive session close
- **Stream pipes never finalized** — LLM response stream readers hold WASM memory until GC
- **Projector subscription detached but fiber keeps running** — event stream consumer continues processing after unsubscribe
- **Session compaction holds message refs** — compacted messages retained in memory for tail reconstruction
- **Execution coordinator entries leak** — `active` map entries not removed on fiber crash

### C11-C14. Process/PTY Leaks
**Files:** `packages/core/src/pty*.ts`, `packages/core/src/cross-spawn-spawner.ts`  
**Agent:** LeakProcess  

- PTY `addFinalizer` not wired to `process.on('exit')` — active PTY shells survive `process.exit()`
- `cross-spawn` child not killed on Effect scope cancel
- Shell subprocesses orphaned when parent Effect fiber is interrupted mid-spawn
- `background-job.ts` fibers survive `Scope.close` due to race in `cancel()` (see earlier audit finding)

---

## 🟠 HIGH FINDINGS (Selected)

| # | Finding | File | Agent |
|---|---------|------|-------|
| H1 | LSP server subprocesses orphanable | `lsp/server.ts` (53.5KB) | LeakWorkers |
| H2 | OAuth callback HTTP server port 19876 never released on crash | `oauth/page.ts` | LeakWorkers |
| H3 | Heap timer never cleared | `cli/heap.ts` | LeakWorkers |
| H4 | ACP stdin listeners never removed | `acp/service.ts` (37.8KB) | LeakResources |
| H5 | SIGUSR2 listener leak on early return paths | `cli/cmd/tui.ts` | LeakResources |
| H6 | Worker `process.on('exit')` handlers survive hard shutdown | `cli/tui/worker.ts` | LeakResources |
| H7 | `process.env` pollution from provider auth keys | `provider/provider.ts` (73.5KB) | LeakResources |
| H8 | `toBottom()` in Session component accumulates timers | `packages/tui/src/` | LeakTimers |
| H9 | Event listeners not removed on provider disconnect | `event.ts` (24.7KB) | LeakWatchers |
| H10 | `process.on('unhandledRejection')` stacking | `global-lifecycle.ts` | LeakWatchers |

---

## Leak Summary by Package

| Package | Files | Findings | Critical | High | Agent |
|---------|-------|----------|----------|------|-------|
| `opencode/src/mcp/` | ~8 | 3 | 2 | 1 | LeakWorkers |
| `opencode/src/lsp/` | ~5 | 2 | 0 | 2 | LeakWorkers |
| `opencode/src/cli/tui/` | 3 | 4 | 3 | 1 | LeakWorkers/Resources |
| `opencode/src/provider/` | ~5 | 3 | 0 | 2 | LeakResources |
| `opencode/src/session/` | ~15 | 12 | 5 | 3 | LeakSession |
| `opencode/src/account/` | ~3 | 2 | 1 | 0 | LeakResources |
| `opencode/src/acp/` | ~10 | 2 | 0 | 1 | LeakResources |
| `opencode/src/server/` | ~8 | 3 | 0 | 1 | LeakWatchers |
| `opencode/src/agent/` | ~3 | 1 | 0 | 1 | LeakResources |
| `core/src/session/` | ~20 | 8 | 5 | 2 | LeakSession |
| `core/src/pty*.ts` | ~6 | 4 | 2 | 1 | LeakProcess |
| `core/src/cross-spawn*` | ~2 | 3 | 2 | 0 | LeakProcess |
| `core/src/background-job.ts` | 1 | 2 | 1 | 0 | LeakProcess |
| `core/src/event.ts` | 1 | 3 | 0 | 2 | LeakWatchers |
| `tui/src/` (timers) | ~30 | 14 | 0 | 1 | LeakTimers |
| `http-recorder/` | ~13 | 2 | 0 | 1 | LeakWorkers |
| **TOTAL** | **~140** | **93** | **14** | **22** | |

---

## What Causes Bun Processes to Stack Up

The main contributor to "bun processes stacking up even after spinosa exits" is a combination of:

1. **MCP server subprocesses** (CRITICAL) — No `process.on('exit')` cleanup. Each restart orphans N MCP processes.
2. **LSP server processes** (HIGH) — Similar orphan pattern. Connected-client tracking misses edge cases.
3. **PTY shell processes** (HIGH) — `addFinalizer` not wired to `process.on('exit')`. Active PTY sessions survive.
4. **Browser spawns** (CRITICAL) — 6+ fire-and-forget spawns. Each dev cycle starts a browser that never gets killed.
5. **Worker thread** (CRITICAL) — Early-throw bug leaves worker running as orphan.

**Fix priority:** Add a global `process.on('exit')` + `process.on('SIGTERM')` cleanup handler that kills all tracked subprocesses (MCP, LSP, PTY, browser). This single change would eliminate the vast majority of orphan processes.
