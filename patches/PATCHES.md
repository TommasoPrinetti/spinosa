# Patch Audit

14 patched dependencies. Each patch fixes an upstream bug or adds Bun compatibility. All patches should be upstreamed when possible.

| Package | Version | What it fixes | Upstream status |
|---------|---------|---------------|-----------------|
| `@ai-sdk/google` | 3.0.73 | `convertToGoogleGenerativeAIMessages` — message format compatibility | Not upstreamed |
| `@ai-sdk/xai` | 3.0.82 | `convertToXaiResponsesInput` — xAI API response format fix | Not upstreamed |
| `@ff-labs/fff-bun` | 0.9.3 | `download.ts` — native binary download path fix for Bun | Not upstreamed |
| `@modelcontextprotocol/sdk` | 1.29.0 | Client class — Bun runtime compatibility (28KB, largest patch) | Not upstreamed |
| `@npmcli/agent` | 4.0.2 | `agents.js` — proxy/agent resolution fix for Bun | Not upstreamed |
| `@pierre/trees` | 1.0.0-beta.4 | `FileTreeController.js` — tree rendering crash fix | Not upstreamed |
| `@silvia-odwyer/photon-node` | 0.3.4 | `photon_rs.js` — native addon loading for Bun | Not upstreamed |
| `@standard-community/standard-openapi` | 0.2.9 | `convert.js` — OpenAPI schema conversion fix | Not upstreamed |
| `@tanstack/solid-virtual` | 3.13.28 | `createVirtualizerBase` — SolidJS virtualizer SSR fix | Not upstreamed |
| `@tanstack/virtual-core` | 3.17.0 | `Virtualizer` class — scroll calculation fix | Not upstreamed |
| `effect` | 4.0.0-beta.83 | `HttpApiSchema.js` — SSE stream handling fix | Beta — may be fixed upstream |
| `gcp-metadata` | 8.1.2 | `isAvailable()` — GCP metadata detection timeout fix | Not upstreamed |
| `pacote` | 21.5.0 | `git.js` — Git fetcher compatibility for Bun | Not upstreamed |
| `solid-js` | 1.9.10 | `.bun-tag` files — Bun package resolution markers | Bun-specific, not upstreamable |

## Policy

1. Every patch file MUST have a comment at the top explaining WHY it exists (2-3 lines).
2. Beta dependencies (`effect@4.0.0-beta.83`, `@pierre/trees@1.0.0-beta.4`) should be re-checked when they go stable.
3. Before upgrading any patched dependency, test with the patch removed to see if the upstream fix has landed.
4. New patches should only be added when no workaround exists and the fix cannot be upstreamed within a reasonable timeframe.

## Risk Assessment

- **High:** `@modelcontextprotocol/sdk` (28KB, touches core protocol client — most likely to break on upgrade)
- **Medium:** `effect` (beta version, may be resolved when stable), `@pierre/trees` (beta)
- **Low:** `solid-js` (Bun tag markers only), `gcp-metadata` (timeout only), `@npmcli/agent` (one-line fix)
