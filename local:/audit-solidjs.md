# SolidJS Anti-pattern Audit

## packages/tui/src/component/prompt/index.tsx
- 144: Module-level `let stashed` holds mutable prompt state across component instances (can leak, persist data between mounts) | impact:high | category:solidjs
- 144: `let stashed` is a mutable module-level variable that should be createSignal within component scope or a proper store | impact:high | category:solidjs

## packages/tui/src/component/use-connected.tsx
- 1: `.tsx` file with ZERO JSX — pure logic function returning createMemo only; should be `use-connected.ts` | impact:low | category:solidjs

## packages/tui/src/component/prompt/move.tsx
- 1: `.tsx` file with ZERO JSX — `usePromptMove()` returns an object of signals/memos only; should be `move.ts` | impact:low | category:solidjs

## packages/tui/src/component/prompt/workspace.tsx
- 1: `.tsx` file with ZERO JSX — `usePromptWorkspace()` returns an object of signals/memos only; should be `workspace.ts` | impact:low | category:solidjs

## packages/tui/src/component/prompt/stash.tsx
- 1: `.tsx` file contains only `export * from "../../prompt/stash"` — no JSX; should be `stash.ts` | impact:low | category:dead

## packages/tui/src/component/prompt/frecency.tsx
- 1: `.tsx` file contains only `export * from "../../prompt/frecency"` — no JSX; should be `frecency.ts` | impact:low | category:dead

## packages/tui/src/component/prompt/history.tsx
- 1: `.tsx` file contains only `export * from "../../prompt/history"` — no JSX; should be `history.ts` | impact:low | category:dead

## packages/tui/src/component/dialog-spinosa-workspace-picker.tsx
- 87: `createResource(() => undefined, …)` source always returns `undefined` — runs exactly ONCE on mount, never refetches. Workspace list can become stale if user registers new workspaces elsewhere. No `refetch` exposed | impact:medium | category:break

## packages/tui/src/component/dialog-console-org.tsx
- 32: `createResource(() => undefined, …)` source always returns `undefined` — runs once on mount. If org list changes, user has no way to refresh. No `refetch` exposed | impact:medium | category:break

## packages/tui/src/component/dialog-skill.tsx
- 21: `createResource(() => undefined, …)` source always returns `undefined` — runs once on mount. No `refetch` exposed | impact:low | category:break

## packages/tui/src/routes/workspace/spinosa-prompt-chips.tsx
- 35: `createResource` for `bundledVersion` has no `refetch` mechanism and source only returns `"bundled"` (constant string) — fetches once, never refetches. In theory `bundledVersion` shouldn't change mid-session, but if the user updates the framework without remounting, stale value | impact:low | category:break

## packages/tui/src/component/startup-loading.tsx
- 9-11: `let wait`, `let hold`, `let stamp` — mutable variables used inside createEffect for timer management. `createEffect` reads non-signal vars for branching but cannot react to their changes. The timer logic could race if async boundaries shift. Simpler: return cleanup function from createEffect | impact:medium | category:solidjs

## packages/tui/src/component/dialog-select.tsx
- 97-99: `let selection`, `let resetSelection`, `let visibilityGeneration` — mutable refs alongside signals. `selection` shadows the `selected()` memo (used for persistence across prop changes). Not a crash bug but brittle — manual cache invalidation via mutation. If `selection` is stale when `props.options` changes, the UI jumps | impact:medium | category:solidjs
- 149: `createEffect(() => { … focusedAction() … actionItems() … })` — auto-tracked effect, dependency list assumes Solid's automatic tracking covers all reads. Reads are fine here but the pattern makes it harder to reason about when this fires. Prefer explicit `on()` for clarity | impact:low | category:solidjs
- 178: `createEffect(() => { filtered(); setStore("input", "keyboard"); … })` — uses `filtered()` as a bare trigger (read, result ignored). Works but is an opaque way to depend on a memo. `on(filtered, …)` would make the intent explicit | impact:low | category:solidjs
- 636: `createMemo` called inside `<For each={options}>{(option) => { const active = createMemo(…) }}` — For callback is NOT a component boundary. Each item's memo is owned by the parent component's reactive root. While SolidJS supports this, it's fragile: if `For` item order changes, memos are re-created | impact:medium | category:solidjs
- 731-790: `Option` function defined outside export — accept arguments as a regular props object rather than a reactive component. Not broken but inconsistent with Solid conventions since it's called as `<Option …>` (JSX component) | impact:low | category:solidjs

## packages/tui/src/component/dialog-model.tsx
- 29-51: `toOptions` function creates JSX (`onSelect: () => { … }`) inside `createMemo` — the `onSelect` closures capture reactive values from the outer scope. Works but creates new closure/function on every memo recomputation, which is wasteful | impact:low | category:solidjs

## packages/tui/src/component/bg-pulse.tsx
- 74-75: `let targetFps`, `let maxFps` — mutable variables inside component for storing renderer state. Used only for onMount/onCleanup save/restore. Acceptable pattern (imperative side-effect save), but a `createMemo` or ref would be more idiomatic | impact:low | category:solidjs

## packages/tui/src/component/dialog-status.tsx
- 104: `{sync.data.lsp.length > 0 && (<box>…</box>)}` — bare conditional without `<Show>` boundary. While SolidJS handles `&&` in templates correctly, `<Show>` provides deferred rendering (the `<box>` children aren't created until the condition is true) | impact:low | category:solidjs

## packages/tui/src/component/error-component.tsx
- 95-97: `contentWidth`, `showSubtext`, `showFooter` — functions (not createMemo) recomputed every time they're called in JSX. `contentWidth` and `showSubtext` are accessed in multiple places. Prefer `createMemo` for cached computation | impact:low | category:solidjs

## packages/tui/src/component/dialog-provider.tsx
- 116-224: `createMemo` containing heavy async callbacks (`onSelect` functions that call `dialog.replace`, `sdk.client.*`, `toast.show`) — creating closures inside memos is wasteful since the memo recomputes only when deps change, but the closures are re-created on every memo run. The async callbacks reallocate on each reactive trigger | impact:low | category:solidjs

## packages/tui/src/component/dialog-workspace-create.tsx
- 248: `if (!adapters()) return null` — this is a stale-data check. In SolidJS, returning `null` before the JSX return is legitimate but can cause issues if the return type isn't properly typed. More idiomatic: wrap the return in `<Show>` | impact:low | category:solidjs
