# Verification Status Definitions

## Per-claim results

| Status | Meaning |
|---|---|
| `verified` | Exact match; claim holds against source. |
| `corrected` | Minor error found; fix applied in-place. |
| `unsupported` | Source exists but does not contain the claimed content. |
| `contradicted` | Source contradicts the claim. |
| `unresolved` | Source cannot be opened or path is missing. |

## Report-level statuses

| Status | Meaning |
|---|---|
| `pass` | All claims verified, no corrections needed. |
| `pass_with_corrections` | Minor fixes applied, report usable. |
| `partial` | Some claims verified; unresolved branches or missing sources prevent full pass. |
| `fail` | Claims do not hold; do not present as established. |
| `blocked` | Source cannot be opened or registered path is missing. |
