# Upstream: anomalco/opencode

- **Fork commit:** `7b25f9e58d448b2d7b320902a870c7458c6e899a`
- **Upstream version:** v1.17.12
- **Fork date:** ~2026-06
- **Import method:** `git filter-repo` subtree import

## Policy

1. **Do NOT modify `packages/opencode/src/`** unless fixing an upstream bug that blocks Spinosa functionality. All Spinosa features live in `packages/tui/src/spinosa/` and `packages/spinosa-core/src/`.

2. **Integration point:** The sole bridge between opencode and Spinosa is `packages/opencode/src/cli/tui/layer.ts` (6 lines). It wires `@opencode-ai/tui`'s `run()` into the Effect runtime. If upstream restructures their Effect layer, this is the only file that needs updating.

3. **Pulling upstream:** Use `git subtree pull` to merge upstream changes. After pulling:
   - Run `bun install` to resolve any new/changed dependencies
   - Run `tsgo --noEmit` from `packages/opencode/` to verify no type errors
   - Run `bun test` from `packages/opencode/` to verify no regressions
   - Manually test the TUI launch: `bun run --cwd packages/opencode --conditions=browser src/index.ts`

4. **What not to touch:**
   - `packages/core/` — upstream opencode engine
   - `packages/plugin/` — upstream plugin SDK
   - `packages/sdk/` — upstream API client
   - `packages/server/` — upstream HTTP server
   - `packages/protocol/` — upstream API contracts
   - `packages/schema/` — upstream type definitions
   - `packages/llm/` — upstream LLM routing
   - `packages/ui/` — upstream web components
   - `packages/effect-drizzle-sqlite/` — upstream DB layer
   - `packages/effect-sqlite-node/` — upstream SQLite client
   - `packages/http-recorder/` — upstream test recorder
   - `packages/script/` — upstream build utilities

## Spinosa Architecture Overview

```
repo root
├── packages/
│   ├── opencode/          ← UPSTREAM FORK (do not modify src/)
│   │   └── src/cli/tui/layer.ts   ← sole integration bridge
│   ├── tui/               ← Spinosa TUI extensions
│   │   ├── src/spinosa/          ← spinosa-specific code
│   │   └── src/routes/spinosa/   ← spinosa route components
│   ├── spinosa-core/      ← Spinosa backend (workspace mgmt, import, etc.)
│   ├── core/              ← UPSTREAM (do not modify)
│   ├── plugin/            ← UPSTREAM (do not modify)
│   └── ... (other upstream packages)
├── .agents/               ← Agent definitions (source of truth)
├── .bin/                  ← Bash CLI and release scripts
└── .spinosa/              ← Framework manifest
```
