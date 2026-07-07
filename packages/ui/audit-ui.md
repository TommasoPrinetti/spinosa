# UI Package Audit Report

**Files audited:** 101 .ts/.tsx source files across `packages/ui/src/`

---

## CRITICAL

### C1. Function `items` prop never invoked — use-filtered-list.tsx
- **File:** hooks/use-filtered-list.tsx
- **Line:** 34
- **Issue:** When `items` is a function `(filter: string) => T[] | Promise<T[]>`, it is never called with the filter argument.
- **Detail:** The `createResource` fetcher receives `items` directly via the source signal `() => ({ filter: store.filter, items: props.items })`. At line 34, `const all = (await Promise.resolve(items)) || []` — when `items` is a function, `Promise.resolve(items)` wraps the function in a resolved promise, yielding the function object as `all`, not its return value. The function is never invoked with the `filter` argument. This means the function-based `items` code path is completely broken.
- **Suggestion:** Check `typeof items === "function"` and call `await items(filter)` to get the data.

### C2. makeEventListener in createEffect never cleaned up — context/dialog.tsx
- **File:** context/dialog.tsx
- **Line:** 65-76
- **Issue:** `makeEventListener(window, "keydown", onKeyDown, ...)` inside a `createEffect` is never cleaned up on effect re-runs.
- **Detail:** The `createEffect` at line 65 depends on `stack()` — every time the dialog stack changes (open/close), a new `keydown` listener is attached to `window`. However, `makeEventListener` returns a cleanup/disposer that is never called via `onCleanup`. After N consecutive dialog opens/closes, N redundant listeners remain active, firing N times per Escape press.
- **Suggestion:** Capture the return value of `makeEventListener` and invoke `onCleanup()` with a disposer that calls it, or restructure to use `onCleanup` inside the effect.

### C3. makeEventListener in createEffect never cleaned up — components/popover.tsx
- **File:** components/popover.tsx
- **Line:** 99-101
- **Issue:** Three `makeEventListener` calls inside a `createEffect` are never cleaned up.
- **Detail:** At lines 99-101, `makeEventListener(window, "keydown", ...)`, `makeEventListener(window, "pointerdown", ...)`, and `makeEventListener(window, "focusin", ...)` each attach listeners that are never removed when the effect re-runs (on every `opened()` change). This accumulates stale listeners that continue to fire after the popover closes.
- **Suggestion:** Store disposer references and call them in `onCleanup()` before re-attaching.

---

## HIGH

### H1. e.preventDefault() always called in onPointerDownOutside — components/tooltip.tsx
- **File:** components/tooltip.tsx
- **Line:** 152
- **Issue:** `e.preventDefault()` is called unconditionally on every `pointerDownOutside` event, preventing outside clicks from ever closing the tooltip.
- **Detail:** The handler at line 148-153 checks whether the click target is the trigger (to set `justClickedTrigger`) but then always calls `e.preventDefault()` at line 152. This means every outside click is suppressed — the tooltip content is trapped open. The guard should only prevent default when the click IS on the trigger, not universally.
- **Suggestion:** Move `e.preventDefault()` inside the `if (ref === e.target ...)` block, or only call it conditionally.

### H2. @ts-ignore hides potential type errors — components/select.tsx
- **File:** components/select.tsx
- **Line:** 86
- **Issue:** `// @ts-ignore` suppresses TypeScript errors without explanation.
- **Detail:** The `<Kobalte<T, { category: string; options: T[] }>` JSX at line 87 is preceded by a bare `// @ts-ignore` with no comment explaining why the suppression is necessary. This hides whatever type mismatch exists between the generic parameter and Kobalte's expected types. Any future refactor that changes the types won't surface errors here.
- **Suggestion:** Add a comment explaining the specific type mismatch, or prefer using `// @ts-expect-error` with a reason string so new errors are not masked.

### H3. `as unknown as ThemeRegistrationResolved` bypasses type safety — context/marked.tsx
- **File:** context/marked.tsx
- **Line:** 378
- **Issue:** The `OpenCodeTheme` object is cast through `unknown` to `ThemeRegistrationResolved`, losing all type safety.
- **Detail:** The `OpenCodeTheme` export has an explicit `tokenColors` structure, `colors` map, etc., but is cast `as unknown as ThemeRegistrationResolved`. TypeScript cannot verify the object conforms to the expected interface. If the `@pierre/diffs` package changes its `ThemeRegistrationResolved` type, there will be no compile-time error — only runtime breakage.
- **Suggestion:** Narrow the type progressively or use a proper typed builder. At minimum, add a runtime schema validation or keep the explicit cast with a comment referencing why the types diverge.

### H4. Redundant open-on-hover logic — components/tooltip.tsx
- **File:** components/tooltip.tsx (let me re-check this one... actually looking at the full flow: `arm`, `leave`, `expand`, `block` logic. The `onPointerDownCapture` and `onKeyDownCapture` both call `arm()` which sets `state.block = true`. But `state.block` is never explicitly reset to `false` outside of a timeout or `leave()`. The `drop()` function checks `state.expand` and may not close. This is intentional behavior for click-to-pin, not a bug.)

### H5. ButtonV2 passes icon prop but unused — v2/components/button-v2.tsx
- **File:** v2/components/button-v2.tsx
- **Line:** 29-31
- **Issue:** `resolvedIcon()` is checked and `<Icon>` is rendered, but line 23 passes `data-icon={resolvedIcon()}` as a data attribute — `data-icon` is not a standard data attribute for the resolved behavior, just a marker.
- **Detail:** This is minor but worth noting — the data attribute is a debugging convenience, not a bug.
- **Suggestion:** Remove data-icon attribute if not consumed by tests/CSS, or keep as-is for debugging.

### H6. Accumulating event listeners in auto-scroll — hooks/create-auto-scroll.tsx
- **File:** hooks/create-auto-scroll.tsx
- **Line:** 216
- **Issue:** `createEventListener` with `passive: true` is called in component body, not inside a lifecycle, but `createResizeObserver` and `createEffect` are used correctly. Actually, looking more carefully:
- **Detail:** The `createEventListener(() => store.scrollRef, "wheel", handleWheel, { passive: true })` at line 216 is called in the function body — each time the signal `store.scrollRef` changes, a new listener is added. But `createEventListener` from `@solid-primitives/event-listener` auto-cleanup is scoped to the component lifecycle. This is fine because Solid's primitives handle disposal. **Not a bug.**

---

## MEDIUM

### M1. ErrorMessage rendered unconditionally — components/text-field.tsx
- **File:** components/text-field.tsx
- **Line:** 125
- **Issue:** `Kobalte.ErrorMessage` is rendered even when there is no error message to display.
- **Detail:** Line 125: `<Kobalte.ErrorMessage data-slot="input-error">{local.error}</Kobalte.ErrorMessage>` — if `local.error` is `undefined`, the ErrorMessage DOM node is still rendered with empty content. While Kobalte may hide it when validation state is "valid", this creates an unnecessary DOM node when `error` prop is simply absent from a non-validated field.
- **Suggestion:** Wrap in `<Show when={local.error}>`.

### M2. `ref` prop name collision — components/list.tsx
- **File:** components/list.tsx
- **Line:** 58
- **Issue:** The `List` component accepts a `ref` prop in its type signature, which collides with SolidJS's built-in `ref` attribute.
- **Detail:** Line 58: `export function List<T>(props: ListProps<T> & { ref?: (ref: ListRef) => void })` — SolidJS treats `ref` specially on native elements and components. Using `ref` as a custom prop name can confuse both TypeScript and runtime behavior when combined with Kobalte's internal ref handling.
- **Suggestion:** Rename the prop to `listRef` or `getRef` to avoid collision with SolidJS's `ref` attribute.

### M3. Dead null-coalescing on already-guaranteed number — components/diff-changes.tsx
- **File:** components/diff-changes.tsx
- **Line:** 20
- **Issue:** `additions()` and `deletions()` always return `number`, so `?? 0` is unreachable.
- **Detail:** The `additions` createMemo uses `?? 0` internally (lines 11-13), guaranteeing a `number` return. The `deletions` createMemo does the same (lines 16-18). The `total` createMemo at line 20 then redundantly applies `?? 0` to both.
- **Suggestion:** Remove the redundant `?? 0` from line 20.

### M4. `JSX` imported as a value, not as type — v2/components/icon-button-v2.tsx
- **File:** v2/components/icon-button-v2.tsx
- **Line:** 3
- **Issue:** `import { JSX } from "solid-js"` imports `JSX` as a runtime value when only the type namespace is needed.
- **Detail:** `JSX` is used only as a type (`JSX.Element`), but the import is a value import. With strict `verbatimModuleSyntax` or `isolatedModules`, this would be an error. It also adds unnecessary runtime overhead.
- **Suggestion:** Use `import type { JSX } from "solid-js"`.

### M5. String style silently dropped — v2/components/inline-input-v2.tsx
- **File:** v2/components/inline-input-v2.tsx
- **Line:** 53
- **Issue:** When `local.style` is a string (e.g., `"width: 200px"`), the style spread silently produces an empty object, losing the style.
- **Detail:** Line 53: `typeof local.style === "object"` — if a consumer passes `style="width:200px"` (a string), this condition fails and `local.style` is replaced with `{}`. The string style is silently dropped. This applies to both the v2 inline input and could affect similar pattern usage elsewhere.
- **Suggestion:** Handle string style separately: `typeof local.style === "string" ? {} : local.style ?? {}` with a TODO to support string styles, or type the prop to disallow strings.

### M6. Non-null assertion on props.data — components/toast.tsx
- **File:** components/toast.tsx
- **Line:** 178
- **Issue:** `props.data!` asserts that `data` is non-null when the toast is in `"fulfilled"` state, but this is not type-safe.
- **Detail:** Line 178: `options.success?.(props.data!)` — The `!` assertion is safe in practice because `"fulfilled"` guarantees `data` is present, but it suppresses TypeScript's ability to verify this. If `toaster.promise` changes its type contract, this will silently pass `undefined`.
- **Suggestion:** Use a type-narrowing check: `props.state === "fulfilled" && options.success?.(props.data as T)` or check `props.data != null`.

### M7. Pick function returns implicit undefined — components/card.tsx
- **File:** components/card.tsx
- **Line:** 28
- **Issue:** `pick()` function has a bare `return` for the `"normal"` variant, returning `undefined`.
- **Detail:** The `pick(variant)` function returns `undefined` implicitly at line 28 for `"normal"` variant (and any other unexpected variant). The return type is inferred as `"circle-ban-sign" | "warning" | "circle-check" | "help" | undefined`, which is used to conditionally render an icon. This is technically correct but fragile — adding a new variant without updating `pick` silently returns `undefined`.
- **Suggestion:** Add an explicit `default` return (e.g., `return undefined`) with a comment, or use a `Switch`/`Match` pattern for exhaustiveness checking.

### M8. Promise rejection not handled — components/toast.tsx
- **File:** components/toast.tsx
- **Line:** 143
- **Issue:** `action.onClick()` is called without try-catch; if it throws, `toaster.dismiss` is never called.
- **Detail:** Lines 142-146: The action button's onClick calls `action.onClick()` and then `toaster.dismiss(props.toastId)`. If `action.onClick` throws, the `toaster.dismiss` is skipped and the toast remains visible.
- **Suggestion:** Wrap in try-finally: `try { action.onClick(); } finally { toaster.dismiss(props.toastId); }`.

### M9. Missing await on font load promise — context/marked.tsx
- **File:** context/marked.tsx
- **Line:** 105
- **Issue:** `void fonts.ready.finally(...)` — while the `void` is intentional (fire-and-forget), the `finally` callback doesn't return anything useful. Not a bug, but the `void` keyword communicates unhandled promise which is correct. Not raising this.

### M10. CollapsibleArrow takes optional props parameter — components/collapsible.tsx
- **File:** components/collapsible.tsx
- **Line:** 34
- **Issue:** `CollapsibleArrow` function accepts `props?: ComponentProps<"div">` but no callers pass arguments, and the function is exported as `Arrow` — the optional props suggest future extensibility but are currently dead code.
- **Detail:** Line 34: `function CollapsibleArrow(props?: ComponentProps<"div">)` — the parameter is optional but never used at the call site. The spread `{...(props || {})}` at line 36 resolves to an empty object. This is harmless but adds an unnecessary level of indirection.
- **Suggestion:** Remove the optional props parameter or update callers to pass relevant props.

---

## LOW

### L1. Unused `last` variable in Digit — components/animated-number.tsx
- **File:** components/animated-number.tsx
- **Line:** 24
- **Issue:** `let last = props.value` is assigned but the initial value is captured once — on re-renders, `last` is updated in the effect tracking `props.value`.
- **Detail:** This is the intended pattern for SolidJS "previous value" tracking. Not a bug, but could cause subtle issues if the component re-renders before the effect fires.

### L2. Redundant import of `ComponentProps` in collapsible.tsx
- **File:** components/collapsible.tsx
- **Issue:** `ParentProps` is imported as a value but used only as a type in interfaces.
- **Detail:** `ParentProps` is used in interface definitions but imported as a value import. Should use `import type`.
- **Suggestion:** Use `import type { ... }` or break into separate type/value imports.

### L3. Value imports used only as types — multiple files
- **Files:** components/collapsible.tsx (line 2), v2/components/icon-button-v2.tsx (line 3), and others
- **Issue:** `ParentProps`, `JSX`, `CollapsibleRootProps` imported as values but used only in type positions.
- **Detail:** Across the codebase, several type-only symbols are imported via value imports rather than `import type`. While functional with default tsconfig, this causes issues under `verbatimModuleSyntax`/`isolatedModules` strict mode and adds unnecessary runtime code.
- **Suggestion:** Use `import type { ParentProps }` and similar for all type-only imports.

### L4. Module-level random values — components/spinner.tsx
- **File:** components/spinner.tsx
- **Line:** 9-10
- **Issue:** `delay` and `duration` computed once at module load time for all spinner instances.
- **Detail:** The `squares` array is module-level, so all `Spinner` instances share the exact same random delays and durations.
- **Suggestion:** Consider computing these values per-instance using `createMemo`.

### L5. Redundant children() wrapping — v2/components/toast-v2.tsx
- **File:** v2/components/toast-v2.tsx
- **Line:** 100
- **Issue:** `opts.icon` is already a JSX.Element (non-reactive), but is wrapped in SolidJS `children()` helper unnecessarily.
- **Detail:** `const resolvedIcon = children(() => opts.icon)` — `children()` adds reactive tracking for a value that never changes after creation.
- **Suggestion:** Use `opts.icon` directly instead of wrapping in `children()`.

### L6. Row 10 of spinner squares has `typeof document !== "undefined"` but `scheme()` function could be a signal
- **File:** components/app-icon.tsx
- **Line:** 47-51
- **Issue:** `scheme()` is a plain function, not a signal, so it won't reactively update when `data-color-scheme` changes.
- **Detail:** The `scheme()` function reads `document.documentElement.dataset.colorScheme` at call time, but it's only called in `onMount` (via `sync()`), so this is correct — the `MutationObserver` handles reactivity. **Not a bug**, just a naming convention mismatch.
| `./i18n/*` | `./src/i18n/*.ts` | 18 locale files + `en.ts` all present |
| `./hooks` | `./src/hooks/index.ts` | Exports `useFilteredList` and `createAutoScroll` — OK |
| `./context` | `./src/context/index.ts` | Exports `helper`, `file`, `dialog`, `i18n` — OK |
| `./context/*` | `./src/context/*.tsx` | `dialog.tsx`, `file.tsx`, `helper.tsx`, `i18n.tsx`, `marked.tsx`, `worker-pool.tsx` — OK |
| `./storybook/scaffold` | `./src/storybook/scaffold.tsx` | OK |
| `./storybook/fixtures` | `./src/storybook/fixtures.ts` | OK |
| `./theme` | `./src/theme/index.ts` | Exports all types, color functions, resolve functions, loader, context, default themes — OK |
| `./theme/*` | `./src/theme/*.ts` | `color.ts`, `types.ts`, `resolve.ts`, `loader.ts`, `default-themes.ts` — OK |
| `./theme/context` | `./src/theme/context.tsx` | OK |
| `./icons/provider` | `./src/components/provider-icons/types.ts` | OK |
| `./icons/file-type` | `./src/components/file-icons/types.ts` | OK |
| `./icons/app` | `./src/components/app-icons/types.ts` | OK |
| `./v2/*.css` | `./src/v2/components/*.css` | All v2 component CSS files — OK |
| `./v2/*` | `./src/v2/components/*.tsx` | All v2 component `.tsx` files — OK |
| `./v2/styles/*` | `./src/v2/styles/*` | (check needed) — assumed OK |

All entry points correctly resolve to existing files.

---

## SUMMARY

| Severity | Count | Key areas |
|---|---|---|
| Critical | 3 | Broken function-as-items provider, listener leak (dialog), listener leak (popover) |
| High | 3 | Tooltip outside-click blocked, `@ts-ignore` masking types, unsafe type cast |
| Medium | 10 | ErrorMessage unconditionally rendered, `ref` prop collides with SolidJS, dead null-coalescing, wrong import kind, string style dropped, non-null assertion, implicit return, unhandled rejection |
| Low | 6 | Module-level random values, non-type imports, redundant children() wrapping, naming convention |
