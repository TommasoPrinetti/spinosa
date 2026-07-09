# TUI Reactivity Audit

**Goal:** Find places where we update UI state without leveraging SolidJS reactivity — polling, timer-based pacing, text-only logging instead of structured reactive progress.

---

## Already reactive ✅

| Pattern | Files | How |
|---|---|---|
| `ProgressEmitter` → Solid signals | `onboarding.tsx`, `add-files.tsx` | Emitter events bridge to `setProgCurrent/setProgTotal/setProcessingFile`. `ProgressBar` reads signals reactively. |
| `setToolChecks(results)` | `onboarding.tsx`, `add-files.tsx` | Signal update → reactive `<For>` re-renders tool list. |
| `setStep("scan"/"direct"/...)` | `onboarding.tsx`, `add-files.tsx` | Signal drives `<Show when={step() === "..."}>` blocks. |
| Spinner frames via `setInterval` → `setSpinIdx` | `onboarding.tsx`, `add-files.tsx` | 200ms interval drives a reactive signal for frame char. |
| `createResource` for one-shot data | `home.tsx`, `workspace-picker.tsx`, `spinosa-prompt-chips.tsx` | Fine — no intermediate progress needed. |

---

## Missed opportunities for reactivity 🔶

### 1. `LogScrollbox` replaces structured progress

**Files:** `onboarding.tsx`, `add-files.tsx`

During processing, pipeline functions call `onPhaseLog(msg)` which pushes raw text to `appendLogLine`. Meanwhile, the same pipeline events also go through `ProgressEmitter` → `ProgressBar`. Two parallel paths for the same data:

```
Pipeline → onPhaseLog → appendLogLine → LogScrollbox (text)
Pipeline → ProgressEmitter → setProgCurrent/setProgTotal/setProcessingFile → ProgressBar (reactive)
```

The `ProgressBar` already shows current/total/fileName. The `LogScrollbox` duplicates this as flat text lines. **The `onPhaseLog` callback could be removed entirely** — the `ProgressEmitter` already carries all the information needed for the UI (`phase`, `current`, `total`, `relPath`).

### 2. `delay()` calls pace the UI artificially

**Files:** `onboarding.tsx`, `add-files.tsx`

```ts
await delay(500)
const dr = await processDirectCopy(...)
setProcessingStatus("Direct copy complete")
await delay(1000)
await gate("Continue to MarkItDown")
```

These `delay()` calls exist because the pipeline functions run synchronously for small file sets — the progress bar would flash from 0% → 100% instantly. The `ProgressEmitter` fires per-file, but if there are few files, the updates come too fast for the user to perceive.

**Better:** Use a minimum-display-time approach via the `ProgressEmitter` events themselves, not fixed `delay()` calls. Track when the phase started and ensure it's visible for at least ~500ms before advancing, regardless of file count.

### 3. Processing phase text status overlaps with ProgressBar

**Files:** `onboarding.tsx`, `add-files.tsx`

```ts
const onPhaseLog = (msg: string) => {
  if (msg.startsWith("  ")) {
    setProcessingStatus(msg.trim())  // ← writes to ProgressBar status
    return
  }
  appendLogLine(msg)  // ← also writes to log
}
```

The `setProcessingStatus` call IS reactive — it drives the `ProgressBar` status line. But `appendLogLine` is the text fallback for non-per-file messages. These are the same messages the `ProgressEmitter` already structures.

**Better:** Drop `onPhaseLog` entirely. Route all progress info through `ProgressEmitter` → signals. The `LogScrollbox` only needs to exist for errors and tool-repair output, not per-phase progress.

### 4. `createResource` for multi-step workflows

**Files:** `routes/spinosa/startup-hub.tsx`, `routes/spinosa/workspace-picker.tsx`

```ts
const [startupPrompt] = createResource(
  () => spinosa.activePath,
  (path) => (path ? readStartupPrompt(path) : undefined),
)
```

`createResource` gives `loading: true | false`. There's no intermediate state between "loading" and "done". For `readStartupPrompt` (a file read) this is fine — it either succeeds or fails. No reactivity opportunity here.

**Verdict:** No change needed.

---

## Timer-based patterns that are fine ✅

| Pattern | File | Why it's fine |
|---|---|---|
| `setInterval` spinner (200ms) | `onboarding.tsx`, `add-files.tsx` | Animation requires timer ticks. |
| `WizardGateButton` countdown (1s) | `wizard-ui.tsx` | Auto-proceed timer, only fires once. |
| `setTimeout` copy indicator (3s) | `session/index.tsx` | One-shot, not a progress stream. |
| `setInterval` path validation (400ms) | `onboarding.tsx`, `add-files.tsx` | Textarea content isn't reactive — polling required. |
| `setInterval` auto-add path (300ms) | `onboarding.tsx`, `add-files.tsx` | Same — textarea read requires polling. |
| `setInterval` retry countdown (1s) | `component/prompt/index.tsx` | Timer-driven countdown. |
| `setInterval` autocomplete anchor (1s) | `component/prompt/autocomplete.tsx` | Cursor position not reactive. |

---

## Summary

| Opportunity | Effort | Impact | Action |
|---|---|---|---|
| Remove `onPhaseLog`, route all progress through `ProgressEmitter` | Low | Medium — eliminates duplicate code path | Delete `onPhaseLog` callbacks; `ProgressEmitter` already carries all info |
| Replace `delay()` pacing with minimum-visibility-time logic | Medium | High — no more fake delays, progress reacts to actual file processing | Track phase start time, hold completion signal until ≥500ms elapsed |
| Remove `LogScrollbox` for processing phases | Low | Low — user sees `ProgressBar` only, cleaner UI | Keep `LogScrollbox` for errors/repair output only |
