# TUI Agent

Deterministic eyes and hands for OpenTUI applications. TUI Agent renders a real application into OpenTUI's memory terminal, drives keyboard, paste, mouse, and resize events, and saves text, styled spans, SVG frames, focus state, layout diagnostics, and adapter-owned semantic state after every action.

It is an installable npm package and a Bun CLI. The harness is application-neutral; a small trusted adapter mounts your TUI and optionally exposes routes, dialogs, backend requests, or other state that is useful for assertions.

## Requirements and installation

- Bun 1.2 or newer
- OpenTUI 0.3.4 or newer
- macOS, Linux, or Windows supported by OpenTUI's native packages

```bash
bun add --dev @spinosa/tui-agent @opentui/core
bunx tui-agent doctor
```

The tarball follows normal npm package conventions and can also be installed with `npm install --save-dev`. The executable still requires `bun` because OpenTUI's test renderer and TypeScript adapter loading use Bun at runtime.

## Five-minute quick start

Create `test/tui/adapter.tsx`:

```tsx
/** @jsxImportSource @opentui/solid */
import { render } from "@opentui/solid"
import type { TuiAgentAdapter } from "@spinosa/tui-agent"
import { App } from "../../src/app"

const adapter: TuiAgentAdapter = {
  name: "my-tui",
  async launch({ setup }) {
    await render(() => <App />, setup.renderer)
    return {
      // Return JSON-safe values only. They appear in state artifacts and JSONL.
      inspect: () => ({
        route: "home",
        state: { ready: true },
      }),
      dispose() {},
    }
  },
}

export default adapter
```

Create `test/tui/smoke.json`:

```json
{
  "$schema": "../../node_modules/@spinosa/tui-agent/scenario.schema.json",
  "name": "smoke",
  "description": "Type into the real application prompt.",
  "adapter": "./adapter.tsx",
  "terminal": { "width": 100, "height": 30 },
  "steps": [
    { "action": "waitForText", "text": "Describe the task" },
    { "action": "waitForFocus", "id": "prompt" },
    { "action": "type", "text": "hello" },
    { "action": "assert", "visible": ["hello"], "route": "home" }
  ]
}
```

Run it:

```bash
bunx tui-agent run test/tui/smoke.json
bunx tui-agent run test/tui/smoke.json --json --artifacts /tmp/tui-smoke
```

The CLI runs every scenario in a subprocess with isolated `HOME` and XDG directories. Module caches, process listeners, application persistence, and renderer state cannot leak into another run or into the developer's real configuration.

## CLI

```text
tui-agent list [--json]
tui-agent run <scenario> [--adapter <module>] [--artifacts <dir>] [--keep-fixture] [--json]
tui-agent interact <scenario> [--adapter <module>] [--artifacts <dir>] [--keep-fixture]
tui-agent show <run-directory> [--json]
tui-agent diff <frame-a> <frame-b>
tui-agent doctor [--json]
```

Every command supports `--help`; failures are written to stderr and return a nonzero exit code. `--adapter` overrides the scenario's adapter and is useful for exercising the same journey against two implementations. Adapter modules execute with the current user's permissions, so load only trusted modules.

`interact` is a persistent JSONL control loop for an agent:

```bash
bunx tui-agent interact test/tui/smoke.json
```

Send one object per line:

```json
{"command":"observe"}
{"action":"type","text":"/session"}
{"action":"key","key":"RETURN"}
{"action":"resize","width":60,"height":20}
{"command":"quit"}
```

The ready event and explicit observations contain a full frame. Normal action responses contain only changed terminal rows in `frameDelta`, plus request deltas, focus, diagnostics, and artifact paths.

## Scenario model

Scenarios are plain JSON and validated before launch. The full JSON Schema is exported as `@spinosa/tui-agent/schema` and shipped as `scenario.schema.json`.

Available actions:

| Actions | Purpose |
| --- | --- |
| `waitForText`, `waitForAbsent`, `waitForFocus` | Wait for asynchronous visual or focus state |
| `key`, `type`, `paste` | Keyboard input, modifiers, repetition, and bracketed paste |
| `click`, `doubleClick`, `clickText`, `move`, `drag`, `scroll` | Mouse input; `clickText` maps Unicode text to terminal cells |
| `resize` | Trigger real terminal reflow |
| `wait`, `capture` | Pause or name an evidence frame |
| `assert` | Check text, cursor, focus, request evidence, route, dialog, and state |

The generic runner substitutes `$FIXTURE_ROOT`, `$HOME`, and `$CWD` in scenario strings. Adapters can add tokens from `prepare()`—for example, the Spinosa adapter adds `$WORKSPACE`.

The `fixture` object is intentionally adapter-owned. This keeps application-specific database, filesystem, and backend setup out of the generic runner.

## Adapter API

An adapter has two lifecycle hooks:

```ts
type TuiAgentAdapter = {
  name: string
  prepare?: (context: AdapterPrepareContext) =>
    | AdapterPreparation
    | Promise<AdapterPreparation>
  launch: (context: AdapterLaunchContext) => RunningTui | Promise<RunningTui>
}
```

`prepare()` runs before scenario token substitution. It may create fixture files and return:

- `cwd`: application working directory
- `tokens`: additional `$TOKEN` values
- `fixture`: JSON-safe metadata written to `run.json`

`launch()` receives the resolved scenario and a `TestRendererSetup`. Mount the real application on `setup.renderer` and return:

- `dispose()`: stop the application and release listeners/resources
- `inspect()`: optional JSON-safe semantic state
- `requests`: optional mutable array of captured HTTP/backend requests

The standard inspection fields—`route`, `dialog`, and `state`—power declarative assertions. Extra JSON-safe fields are preserved in every state artifact. Never return renderer, component, SDK, or signal objects from `inspect()`; cyclic values cannot cross the JSONL protocol.

Applications that already accept a renderer can mount directly. Applications that create their own renderer should expose a renderer factory/mount seam in their test adapter or replace that factory before dynamically importing the application. Keep this application-specific mechanism in the adapter.

## Programmatic API

```ts
import {
  loadAdapter,
  resolveScenario,
  resolveScenarioAdapter,
  runScenario,
  validateScenario,
  type TuiAgentAdapter,
  type TuiScenario,
} from "@spinosa/tui-agent"
```

`runScenario()` is the low-level in-process API. It is useful in Bun tests and custom orchestrators:

```ts
const resolved = await resolveScenario("test/tui/smoke.json")
const adapter = await loadAdapter("./adapter.tsx", "test/tui")
const manifest = await runScenario({
  ...resolved,
  adapter,
  artifactDirectory: "/tmp/tui-smoke",
})
```

Direct callers own process isolation. Prefer the CLI when adapters mutate environment variables, module mocks, cwd, or global application state.

## Evidence and debugging workflow

Each run produces:

- `run.json`: manifest, timings, requests, diagnostics, and frame index
- `NNN-*.txt`: normalized visible terminal text
- `NNN-*.svg`: styled visual frame with cursor
- `NNN-*.spans.json`: cell widths, colors, attributes, and cursor
- `NNN-*.tree.json`: renderable hierarchy, bounds, and focus
- `NNN-*.state.json`: renderer metrics, layout diagnostics, and adapter inspection

A productive loop is: reproduce with `interact`, copy the discovered actions into a JSON scenario, inspect the last text/tree/state artifact, make the smallest product fix, rerun, then retain the scenario as regression evidence.

## Spinosa adapter example

This repository keeps its production integration in `adapters/spinosa.ts` and the `/session` journey in `scenarios/workspace-session.json`. It demonstrates fixture preparation, renderer factory interception, a fake SDK transport, request capture, Effect cleanup, and JSON-safe semantic inspection:

```bash
cd packages/tui
bun tools/tui-agent/cli.ts run workspace-session
bun tools/tui-agent/cli.ts interact workspace-session
```

The Spinosa adapter is a repository example, not part of the published runtime bundle; it imports Spinosa/OpenCode workspace sources directly. Copy its architecture, not its private imports, when integrating another TUI.
