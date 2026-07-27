# Spinosa CLI Layer (V1 yargs)

`packages/opencode/src/cli/` is the legacy yargs command surface for the shipped `opencode` binary. It hosts TUI **adapters**, not the canonical UI (that is `@spinosa/tui`).

CONTRIBUTING.md still mentions `cli/cmd/tui/` — that directory was removed. UI lives in `packages/tui`.

## Command entry

- `src/index.ts` (via `src/cli/index.ts`) — yargs router
- Commands in `src/cli/cmd/*.ts`

## TUI routing (three paths)

### 1. Full TUI (canonical app)

| Trigger | File | Flow |
| ------- | ---- | ---- |
| `opencode` (default) | `cmd/tui.ts` | → `cli/tui/layer.ts` → `@spinosa/tui` `run()` |
| `opencode attach` | `cmd/attach.ts` | Full TUI unless `--mini` |
| `opencode web` | `cmd/web.ts` | Server + browser (not terminal) |

Worker/RPC: `cli/tui/worker.ts` — embedded server for in-process fetch/events.

### 2. Mini TUI (lightweight)

| Trigger | File | Flow |
| ------- | ---- | ---- |
| `opencode --mini` | `cmd/run.ts` | `runMini()` in same file |
| `opencode run` | `cmd/run.ts` | Split-footer direct mode |
| `attach --mini` | `cmd/attach.ts` | Mini path |

Mini TUI lives in `cmd/run/` — **not** the full `packages/tui` app tree. It reuses TUI primitives (`@spinosa/tui/keymap`, editor, spinner, config, theme).

### 3. Headless / server

| Command | File |
| ------- | ---- |
| `serve` | `cmd/serve.ts` |
| `run` (non-mini batch) | `cmd/run.ts` |

## Host adapters (stay in opencode)

```txt
cli/tui/
  layer.ts              wires transport + Effect layer for full TUI
  worker.ts             in-process server worker
  validate-session.ts   session validation helper
```

Config discovery: `src/config/tui.ts`, `tui-migrate.ts`, `tui-host-attention.ts`

Compatibility re-exports (prefer `@spinosa/tui` subpaths for new code):

- `src/cli/logo.ts` → `@spinosa/tui/logo`
- `src/util/locale.ts`, `error.ts`, `parsers-config.ts` → `@spinosa/tui/util/*`

## Other notable commands

`cmd/acp.ts`, `cmd/auth.ts`, `cmd/mcp.ts`, `cmd/models.ts`, `cmd/stats.ts`, `cmd/pr.ts`, `cmd/github.ts`, `cmd/export.ts`, `cmd/import.ts`, `cmd/session.ts`, `cmd/uninstall.ts`, `cmd/upgrade.ts`, `cmd/debug/`

## V2 parallel

`packages/cli` (`lildax`) is the Effect-based preview CLI. Default command also launches `@spinosa/tui` but through daemon transport — see `packages/cli/AGENTS.md`.

Do not duplicate TUI features here when fixing terminal UI — edit `packages/tui`.

## Dev

From `packages/opencode`:

```bash
bun dev              # interactive TUI — use tmux (see packages/opencode/AGENTS.md)
bun dev serve        # headless API
bun dev .            # TUI against repo root
```

## Related docs

- `packages/tui/AGENTS.md` — canonical terminal application
- `packages/opencode/AGENTS.md` — Effect module shape, database, tmux dev
- `specs/tui-package.md` — extraction spec
