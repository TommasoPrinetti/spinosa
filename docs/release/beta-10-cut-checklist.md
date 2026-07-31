# 1.0.3-beta.10 cut checklist

Prep only — **do not** run `release:beta:patch`, **do not** GitHub-publish, **do not** promote stable.

Target: first binary-distribution hard cut (`distribution: binary`, four product binaries, no source tarball).

## Pre-cut (local, this machine)

- [x] Branch: `binary-distribution-hard-cut`
- [x] Four product binaries built via `SPINOSA_BINARY_SMOKE_STRICT=1 bun run build:binaries -- --skip-embed-web-ui`
- [x] Host strict smoke green: `bun script/smoke-install.ts --binary dist/v1.0.3-beta.9/spinosa-darwin-arm64`
- [x] Cross assets verified (exist, mode `755`, size ≫ 1KiB, correct Mach-O/ELF, onnx + canvas embed strings)
- [x] Stay on Bun for packaging (`packageManager: bun@1.3.14`); npm only if Bun compile fails (it did not)
- [ ] Working tree committed on cut branch (or release branch) — **not done in this session**
- [ ] Version bumped to `1.0.3-beta.10` via release orchestrator (or `bun script/set-version.ts`) — **not done**
- [ ] `SPINOSA_BINARY_SMOKE_STRICT=1 bun run quality:binary` on the bumped tree
- [ ] `bun run quality` on the bumped tree
- [ ] Rebuild four binaries for **v1.0.3-beta.10** into `dist/v1.0.3-beta.10/`
- [ ] Stage `install.sh` + `checksums.txt` + `build-manifest.json` (release `build` stage)
- [ ] Installer HTTP smoke: `bun script/smoke-install.ts --dist dist/v1.0.3-beta.10`

## Four-asset matrix (local verify, built as 1.0.3-beta.9 rehearsal)

| Asset | Host smoke | Cross verify on this Mac |
| ----- | ---------- | ------------------------ |
| `spinosa-darwin-arm64` | Strict version/doctor green | Native arm64 Mach-O |
| `spinosa-darwin-x64` | N/A (Intel) | Exists, `755`, x86_64 Mach-O, onnx+canvas embeds |
| `spinosa-linux-arm64` | N/A (ELF) | Exists, `755`, aarch64 ELF, onnx+canvas embeds |
| `spinosa-linux-x64` | N/A (ELF) | Exists, `755`, x86_64 ELF, onnx+canvas embeds |

Cannot run natively here: `darwin-x64` (needs Intel/Rosetta host), both Linux ELFs.

## Publish gate (when ready — out of scope now)

1. Clean tree on allowed beta branch
2. `bun run release:beta:patch` (or equivalent orchestrated cut)
3. Confirm immutable release assets: `install.sh` + four binaries + `checksums.txt` + `build-manifest.json`
4. Copy `docs/release-signoff-template.md` → `dist/v1.0.3-beta.10/SIGNOFF.md` and fill
5. Native smoke on remaining three platforms before stable soak (see `docs/release/stable-promotion-gates.md`)

## Known non-blockers

- **pdfjs canvas warnings**: product binary prints `Cannot load "@napi-rs/canvas"` / ImageData/Path2D polyfill warnings from pdfjs optional probes. Doctor still reports `Canvas: available`, `PDF engine: available`, smoke exits 0. Our render path uses explicit `import("@napi-rs/canvas")` (same as doctor). Follow-up: silence pdfjs optional resolve noise; not a cut blocker.
- **darwin-x64 onnx**: upstream `onnxruntime-node@≥1.24` omits `darwin/x64`; build vendors `onnxruntime-node@1.23.2` slice fail-closed. OCR ABI on Intel Mac may need native soak before stable.

## Verify commands

```bash
SPINOSA_BINARY_SMOKE_STRICT=1 bun run build:binaries -- --skip-embed-web-ui
SPINOSA_BINARY_SMOKE_STRICT=1 bun script/smoke-install.ts --binary dist/v$(jq -r .version package.json)/spinosa-darwin-arm64
SPINOSA_BINARY_SMOKE_STRICT=1 bun run quality:binary
bun run quality
bun run test:installer
```
