# SolidJS Gotchas for TUI Components

## Derived values in component body are FROZEN

Unlike React (component re-runs on every render), SolidJS runs the component
function body **once**. Only expressions written directly inside JSX (or inside
`createMemo`/`createEffect`/`createResource`) track reactive dependencies.

### Wrong — frozen at mount

```tsx
function ProgressBar(props) {
  const total = props.total > 0 ? props.total : 1  // computed ONCE
  const pct = Math.min(props.current / total, 1)    // frozen
  const filled = Math.round(pct * 20)                // frozen
  const bar = "█".repeat(filled) + "░".repeat(...)   // frozen string

  return <text>{bar} {Math.round(pct * 100)}%  {props.current} of {total}</text>
}
```

`bar`, `pct`, `filled`, `total` are computed at mount and **never update**.
`props.current` in JSX does update (it's reactive) — so you get `67 of 1`
with an empty bar.

### Right — wrap in createMemo

```tsx
import { createMemo } from "solid-js"

function ProgressBar(props) {
  const total = createMemo(() => props.total > 0 ? props.total : 1)
  const pct = createMemo(() => Math.min(props.current / total(), 1))
  const filled = createMemo(() => Math.round(pct() * (props.barWidth ?? 20)))
  const bar = createMemo(() => "█".repeat(filled()) + "░".repeat((props.barWidth ?? 20) - filled()))

  return <text>{bar()} {Math.round(pct() * 100)}%  {props.current} of {total()}</text>
}
```

All derived values re-compute when `props.current` or `props.total` change.

### Quick test: is it frozen?

If a number in the UI updates but a string/graphic derived from it doesn't,
you've hit this pitfall. The fix is always `createMemo`.

### Why this happens

SolidJS compiles the component into a single-shot setup function that
registers effects and bindings. The JSX template is compiled into DOM
operations that reference signal getters directly — but `const` variables
in the function body are just local variables, evaluated once.

### TL;DR

- Plain `const` in component body = frozen at mount
- `createMemo(() => ...)` = recomputes when dependencies change
- `props.X` in JSX = reactive
- `props.X` in `const` = snapshot at mount
