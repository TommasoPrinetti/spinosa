# Protocol Package Guide

`@spinosa/protocol` defines the V2 Effect HttpApi contract: endpoint groups, request/response schemas, middleware placement, OpenAPI shape. No handlers, no database, no session execution.

Dependency: `@spinosa/schema` only (+ `effect`).

## Entry points

- `src/api.ts` — `makeDefaultApi`, `makeApiFromGroup`
- `src/groups/` — one file per API area
- `src/middleware/` — `authorization.ts`, `schema-error.ts`
- `src/errors.ts` — shared API errors

## Group index

Files in `src/groups/`:

`session`, `message`, `model`, `provider`, `permission`, `fs`, `command`, `skill`, `event`, `agent`, `health`, `pty`, `question`, `reference`, `location`, `integration`, `credential`, `project-copy`

Factory helpers: `makeSessionGroup`, `makePermissionGroup`, `makeQuestionGroup`, `makeEventGroup` — use when middleware or event definitions need injection.

## Middleware model

Protocol owns **where** middleware attaches; Server injects concrete service keys so Core identities stay downstream.

```txt
makeApiFromGroup(eventGroup, locationMiddleware, sessionLocationMiddleware)
```

Location-scoped groups get `locationMiddleware`. Session-scoped groups also get `sessionLocationMiddleware`. See `src/api.ts` for the full merge order.

## Adding an endpoint

1. Add or extend schema types in `packages/schema`
2. Add route definition in the matching `src/groups/<name>.ts`
3. Implement handler in `packages/server/src/handlers/<name>.ts`
4. Regenerate client: `packages/client`: `bun run generate`

Do not put handler logic in protocol files. Do not import `@spinosa/kernel-core` or `@spinosa/server`.

## Events and manifests

Event classification rules live in `packages/schema/AGENTS.md`. V1-only events stay out of current protocol/SDK surfaces unless documented.

## Checks

```bash
cd packages/protocol
bun typecheck
```

## V1 parallel

Legacy instance HttpApi: `packages/opencode/src/server/routes/instance/httpapi/` — separate types, separate handlers. V2 is the long-term `/api/...` surface consumed by `sdk-next` and the V2 CLI daemon.

## Related docs

- `packages/schema/AGENTS.md` — wire type conventions
- `packages/server/AGENTS.md` — handler implementation
- `packages/client/AGENTS.md` — codegen after protocol edits
