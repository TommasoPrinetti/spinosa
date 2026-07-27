# Plugin Package Guide

`@spinosa/plugin` is the author-facing API for Spinosa plugins. Consumed by core (execution), TUI (presentation slots), and external plugin packages.

## Exports (from `package.json`)

- `.` — core plugin types and registration
- `./tui` — TUI presentation hooks (used by `@spinosa/tui` plugin runtime)
- `./tool` — tool plugin helpers
- `./v2/effect/*` — Effect-based V2 plugin surfaces

## Boundaries

- Plugins declare behavior; hosts inject runtime (`pluginHost` in TUI `run()`, core plugin host for tools)
- TUI plugins render through slots in `packages/tui/src/plugin/` — do not import TUI from plugin definitions
- Tool plugins register through core's application tool path — see `packages/core/src/tool/AGENTS.md`

## Build

```bash
cd packages/plugin
bun typecheck
bun run build
```

## Related docs

- `packages/tui/AGENTS.md` — plugin slots and `command-shim`
- `packages/core/AGENTS.md` — plugin host in core
- User docs: `packages/web/src/content/docs/` (plugins, MCP, rules)
