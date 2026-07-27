# TUI Package Guide

`@spinosa/tui` is the canonical Spinosa terminal application. SolidJS + OpenTUI. Hosts (`packages/opencode`, `packages/cli`) only wire transport, config, and Effect layers — they do not own UI trees.

Read `specs/tui-package.md` for extraction history and boundary rules.

## Public API

Entry: `src/index.tsx` exports `run` and `TuiInput`.

Hosts call `run({ url, headers, args, config, fetch, pluginHost, ... })` and provide an Effect layer (typically `AppNodeBuilder.build(Global.node)` from core).

Subpath exports in `package.json` expose stable host/plugin surfaces: `./config`, `./runtime`, `./context/*`, `./plugin/*`, `./keymap`, `./util/*`, etc. Prefer these over deep imports when integrating from outside the package.

## Spinosa workspace shell

Entry stack (`spinosa/entry.ts`, `routes/spinosa/`):

1. **workspace-picker** — registered workspaces, cwd, Spinosa-only, new workspace
2. **onboarding** — `not_started` / add-files wizard via `SpinosaCliBridge`
3. **startup-hub** — `cli_started` → begin indexing in Chat
4. **workspace** — chat/session shell

Route model: `workspace-picker | onboarding | startup-hub | workspace | plugin`. Legacy `home`/`session` navigate inputs normalize to `workspace`.

`SpinosaWorkspaceProvider` holds `activePath` in KV (`spinosa_active_workspace_path`). `setup_status` from `.spinosa/workspace` drives routing.

**Workspace binding:** Chat sessions default to `spinosa.activePath` (not host cwd) via `HomeSessionDestinationProvider`. `SpinosaWorkspaceBinder` watches setup files and refreshes workspace state.

**Framework source:** `scripts/link-framework.sh` symlinks `../spinosa-main` → `framework/`. CLI bridge resolves `.bin/spinosa` from that tree.

**Layout:** Main content capped at **80 columns** (~800px), centered. Session sidebar (42 cols) sits outside the cap.

CLI flags `--session`, `--continue`, `--prompt` skip the picker.

## Verification

Fixture workspace: `test/spinosa/fixtures/workspace-started/` (self-contained; does not use spinosa-main).

```bash
cd packages/tui
bun run test:spinosa      # unit tests
bun run verify:spinosa    # tests + typecheck + maturity checklist
```

## Source map

```txt
src/
  app.tsx                 application root, provider tree, renderer lifecycle
  index.tsx               public exports
  spinosa/                service, bash, parse-goal, parse-corpus, artifact-watcher, types
  routes/
    spinosa/              workspace-picker, startup-hub, onboarding
    workspace/            shell
    home.tsx              new-chat prompt (chat pane)
    session/              main session view, dialogs, timeline
  context/                Solid providers (SDK, sync, theme, permission, …)
  component/              dialogs, prompt, command palette, workspace chrome
  feature-plugins/        built-in sidebar/home plugins (builtins.ts)
  plugin/                 plugin slots, runtime, command-shim
  config/                 TUI config schemas, keybind resolution
  theme/                  theme engine + assets/*.json
  prompt/                 history, stash, frecency
  ui/                     dialog primitives, spinner, toast
  util/                   locale, error, persistence, tool-display, layout
```

## Architecture rules

- **SDK is the backend boundary.** Missing data or operations belong in the server API and `@spinosa/sdk`, not imports from `packages/opencode` or `packages/cli`.
- **Do not add new `@spinosa/kernel-core` imports.** ~12 files still import core (Flag, Global, InstallationVersion, Flock, Glob, AppNodeBuilder) from the extraction migration. Shrink this set; do not expand it. Pass behavior through `run()` inputs, SDK, or explicit runtime providers instead.
- **One canonical UI.** Never duplicate feature trees into `packages/cli` or `packages/opencode`. Host adapters live in those packages; presentation lives here.
- **Tool rendering stays tolerant.** Accept `unknown` wire shapes; do not import backend tool implementations for types.

## Host integration paths

| Host | Entry | Notes |
| ---- | ----- | ----- |
| Legacy `opencode` | `packages/opencode/src/cli/cmd/tui.ts` → `cli/tui/layer.ts` | Full TUI via worker or in-process fetch |
| Legacy attach | `packages/opencode/src/cli/cmd/attach.ts` | Full TUI unless `--mini` |
| V2 `lildax` | `packages/cli/src/commands/handlers/default.ts` → `cli/tui.ts` | Daemon transport + graceful 404 fallbacks |
| Mini TUI | `packages/opencode/src/cli/cmd/run/` | **Not** this package's app tree — reuses primitives only |

## Tests and checks

```bash
cd packages/tui
bun test          # 50+ tests: unit, snapshot, sync-hydration, app-lifecycle
bun typecheck
```

Snapshot tests live under `test/`. Prefer extending existing test helpers over new global mocks.

## UI stack

- Rendering: `@opentui/core`, `@opentui/solid`, `@opentui/keymap`
- State: SolidJS (`createStore` preferred over many signals — same as `packages/app`)
- Shared web primitives: `@spinosa/ui` where terminal and web align
- Plugins: `@spinosa/plugin` presentation slots; host injects `pluginHost`

## When changing behavior

1. Session/timeline UI → `src/routes/session/`
2. Global chrome, dialogs → `src/component/`, `src/ui/`
3. Server sync, events → `src/context/sdk.tsx`, `src/context/sync.tsx`
4. Keybinds, themes → `src/config/`, `src/theme/`
5. New backend need → extend SDK/server first, then wire context here

## Dev note

There is no standalone `bun dev` in this package. Run through a host:

- `bun dev` from repo root (legacy opencode TUI)
- `bun dev` from `packages/cli` (V2 preview)

For TUI-only iteration, `packages/tui` tests are the fastest feedback loop.
