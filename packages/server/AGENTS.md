# Server Package Guide

`@opencode-ai/server` implements the V2 HTTP API. It wires `packages/protocol` endpoint groups to `@opencode-ai/core` Effect handlers. No business rules invented here — translate HTTP ↔ core services.

## Entry points

- `src/api.ts` — `makeDefaultApi({ locationMiddleware, sessionLocationMiddleware })`
- `src/handlers.ts` — merges all handler layers
- `src/routes.ts` — route assembly
- `src/auth.ts`, `src/cors.ts`, `src/location.ts` — cross-cutting HTTP concerns

## Handler map

Each file in `src/handlers/` maps to a protocol group:

| Handler | Domain |
| ------- | ------ |
| `session.ts` | Sessions, prompts, execution |
| `message.ts` | Messages, parts |
| `model.ts`, `provider.ts` | Model catalog, providers |
| `permission.ts` | Permission requests |
| `agent.ts` | Agent config |
| `event.ts` | Server-sent events |
| `fs.ts` | Filesystem operations |
| `command.ts`, `skill.ts` | Commands and skills |
| `pty.ts` | PTY tickets and streams |
| `question.ts`, `reference.ts` | Questions, references |
| `location.ts` | Workspace/location context |
| `integration.ts`, `credential.ts` | Integrations, credentials |
| `project-copy.ts` | Project copy |
| `health.ts` | Health checks |

Middleware: `src/middleware/authorization.ts`, `session-location.ts`, `schema-error.ts`

## Adding or changing an endpoint

1. **Schema** — add/update types in `packages/schema` (see `packages/schema/AGENTS.md`)
2. **Protocol** — add endpoint to matching `packages/protocol/src/groups/*.ts`
3. **Handler** — implement in `src/handlers/` calling core services
4. **Client** — `cd packages/client && bun run generate` (never hand-edit `src/generated*`)
5. **Tests** — handler tests in this package; core logic tests in `packages/core`

Dependency direction: `schema ← protocol ← server → core`. Server imports core; core never imports server.

## Running the server

No standalone `bun dev` in this package. Consumers:

- `packages/cli` — `serve` command or daemon `service start`
- `packages/sdk-next` — embedded in-memory HttpClient for tests/tools
- Integration tests — compose layers from `packages/core` + this package

## Checks

```bash
cd packages/server
bun typecheck
```

## V1 vs V2

Legacy V1 HttpApi lives in `packages/opencode/src/server/routes/instance/httpapi/` (separate stack). Do not add V2 endpoints there. TUI/SDK may still hit V1 paths during migration — see `packages/cli/src/tui.ts` graceful fallbacks.

## Related docs

- `packages/protocol/AGENTS.md` — HttpApi groups, middleware placement
- `packages/client/AGENTS.md` — codegen workflow
- `packages/core/AGENTS.md` — domain services handlers call into