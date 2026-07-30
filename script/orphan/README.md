# Orphan scripts — DO NOT RUN during release

These scripts are quarantined leftovers from older OpenCode / Spinosa publish paths.

- **Do not run** during `bun run release` or any release recovery.
- The real pipeline lives in `script/release/`.
- Kept for archaeology only; prefer deleting when no longer useful.

| Script | Why quarantined |
|--------|-----------------|
| `build-tui.ts` | Hardcodes beta, `rm -rf dist`, not wired to root package.json |
| `publish-tui.ts` | Calls orphan `build-tui`; npm publish path superseded by GitHub release pipeline |
| `verify-release.sh` | Dead local smoke that invoked orphan `build-tui` |
| `packages/*/publish.ts` | Per-package npm publish leftovers for OpenCode-era packages; not in package.json scripts |
| `packages/spinosa-kernel/.../github*.ts` | OpenCode-era `spinosa github` agent CLI; not part of Spinosa TUI identity |
| `packages/spinosa-kernel/.../acp*` | OpenCode-era ACP protocol surface; not registered on product CLI |
