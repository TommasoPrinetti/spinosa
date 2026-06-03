---
name: claim-verification
description: Verify claims, quotes, and paths against original sources
---

## Purpose

Trace every claim to its source. Confirm accuracy. Correct errors in-place. Never hide failures.

## Prerequisites

- Writer report exists in `agent_reports/` with status `draft`
- Source paths are cited in the report
- Root Vault or workspace raw copies are accessible

## Steps

1. For each claim in the report, locate the original source file.
2. Confirm the source path exists in the workspace or Root Vault.
3. Compare the quote or claim against the source:
   - `verified` — exact match, claim holds.
   - `corrected` — minor error, fix applied in-place.
   - `unsupported` — source exists but does not contain the claimed content.
   - `contradicted` — source contradicts the claim.
   - `unresolved` — source cannot be opened or path is missing.
4. Apply corrections directly to the report in `agent_reports/`.
5. Update report `status` from `draft` to `pass`, `pass_with_corrections`, or `partial`.
6. For `find_material` routes, verify the located path actually exists — mark as `blocked` if not.
7. Refuse to certify claims that cannot be traced to a registered source path.

## Rules

- Verification failures are documented, not hidden.
- Never soften a failed verification.
- Never create new interpretations — only verify existing claims.
- Use verbatim quote format for direct quotes:
  - `> **Author Name**, *Source Title* (Date, Place)`
  - Minimum 2 sentences or 1 full paragraph.
  - Key passage in **bold**.
- Do not edit Root Vault files.
- Do not create separate checker notes when a report exists — modify the report itself.

## Status meanings

See `references/status-definitions.md` for full definitions.

- `pass` — all claims verified, no corrections needed.
- `pass_with_corrections` — minor fixes applied, report usable.
- `partial` — some claims verified, unresolved branches or missing sources prevent full pass.
- `fail` — claims do not hold, do not present as established.
- `blocked` — source cannot be opened or registered path is missing.

## See also

- `report-writing` — for the Writer's report structure
- `orchestrator-dispatch` — Verifier is mandatory on every non-fast path
