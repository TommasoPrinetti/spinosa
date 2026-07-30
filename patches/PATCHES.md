# Patch Audit

Generated from `package.json` `patchedDependencies` (13 entries).
Do not edit the table by hand — run `bun script/generate-patches-md.ts`.

| Package | Version | Patch file |
|---------|---------|------------|
| `@ai-sdk/google` | 3.0.73 | `patches/@ai-sdk%2Fgoogle@3.0.73.patch` |
| `@ai-sdk/xai` | 3.0.82 | `patches/@ai-sdk%2Fxai@3.0.82.patch` |
| `@modelcontextprotocol/sdk` | 1.29.0 | `patches/@modelcontextprotocol%2Fsdk@1.29.0.patch` |
| `@npmcli/agent` | 4.0.2 | `patches/@npmcli%2Fagent@4.0.2.patch` |
| `@opentui/solid` | 0.3.4 | `patches/@opentui%2Fsolid@0.3.4.patch` |
| `@pierre/trees` | 1.0.0-beta.4 | `patches/@pierre%2Ftrees@1.0.0-beta.4.patch` |
| `@silvia-odwyer/photon-node` | 0.3.4 | `patches/@silvia-odwyer%2Fphoton-node@0.3.4.patch` |
| `@standard-community/standard-openapi` | 0.2.9 | `patches/@standard-community%2Fstandard-openapi@0.2.9.patch` |
| `@tanstack/solid-virtual` | 3.13.28 | `patches/@tanstack%2Fsolid-virtual@3.13.28.patch` |
| `@tanstack/virtual-core` | 3.17.0 | `patches/@tanstack%2Fvirtual-core@3.17.0.patch` |
| `effect` | 4.0.0-beta.83 | `patches/effect@4.0.0-beta.83.patch` |
| `gcp-metadata` | 8.1.2 | `patches/gcp-metadata@8.1.2.patch` |
| `pacote` | 21.5.0 | `patches/pacote@21.5.0.patch` |

## Policy

1. Every patch file MUST have a comment at the top explaining WHY it exists (2-3 lines).
2. Beta dependencies should be re-checked when they go stable.
3. Before upgrading any patched dependency, test with the patch removed to see if the upstream fix has landed.
4. New patches should only be added when no workaround exists and the fix cannot be upstreamed within a reasonable timeframe.

## Drift checks

- Missing patch files: none
- Orphan patch files (not in patchedDependencies): none
