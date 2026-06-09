---
name: release-engineering
type: skill
scope: release_operations
description: Build vendor bundles, package, and publish Pilosa Framework releases
created: 2026-06-09
updated: 2026-06-09
---

## Purpose

Check vendor bundle state, build missing unified vendor tarballs (RapidOCR + MarkItDown), package the framework, and publish a GitHub release. Used whenever the installer fails to find release assets or a new release needs to be cut.

## Prerequisites

- `gh` CLI authenticated and available
- macOS with Rosetta (darwin-arm64 host)
- Scripts at `.bin/build-pilosa-vendor.sh`, `.bin/package-release.sh`, `.bin/publish-release.sh`
- Vendor tarballs stored in `.bin/lib/vendor/`

## Vendor Tarball Strategy

Two tiers of vendor bundles:

| Tier | Pattern | Contains | When |
|------|---------|----------|------|
| Unified | `pilosa-vendor-<platform>.tar.gz` | Standalone Python 3.11 + RapidOCR + MarkItDown | Built natively, full engine support |
| Legacy | `rapidocr-<platform>.tar.gz` | RapidOCR + onnxruntime only | Fallback when unified can't be built |

The installer (`install.sh`) tries unified first, then legacy. Platforms without a unified bundle get OCR-only (no MarkItDown).

### Known cross-platform limitations

- `onnxruntime==1.26.0` has no macOS x86_64 wheel for Python 3.11 — darwin-amd64 unified builds fail at pip install step.
- Linux unified bundles can't be built on macOS (cross-OS). They need CI or native Linux host.
- Solution for missing platforms: ship legacy `rapidocr-*.tar.gz` as fallback.

## Steps

### 1. Audit vendor state

List what exists in `.bin/lib/vendor/`:

```bash
ls -lh .bin/lib/vendor/*.tar.gz
```

Identify which platforms have unified vendor and which are legacy-only.

### 2. Build missing unified vendor tarballs

For the current (native) platform:

```bash
bash .bin/build-pilosa-vendor.sh
```

For darwin-amd64 on Apple Silicon (requires Rosetta):

```bash
arch -x86_64 bash .bin/build-pilosa-vendor.sh darwin-amd64
```

If this fails with pip install errors (e.g., `onnxruntime==1.26.0` wheel missing), skip that platform and note the limitation. The legacy rapidocr bundle will serve as fallback.

### 3. Clear the working tree

`publish-release.sh` requires a clean `git status`:

```bash
# Check for untracked files
git status --porcelain

# Move agent reports and other untracked files aside
mkdir -p .trash/temp
mv agent_reports/<file>.md .trash/temp/   # per-file as needed
```

Only move untracked files — never stash or modify tracked files.

### 4. Package the release

```bash
bash .bin/package-release.sh <version>
```

This creates `dist/v<version>/` with:
- `pilosa-framework-<version>.tar.gz`
- `install.sh`
- `checksums.txt`
- Copies vendor tarballs from `.bin/lib/vendor/` into the framework archive

### 5. Publish to GitHub

```bash
bash .bin/publish-release.sh <version>
```

If the release tag already exists, assets are uploaded with `--clobber`. If not, a new release is created.

### 6. Verify

```bash
curl -sL "https://api.github.com/repos/TommasoPrinetti/pilosa/releases/tags/v<version>" | python3 -c "
import json,sys
r = json.load(sys.stdin)
for a in r['assets']:
    print(f'  {a[\"name\"]:50s} {a[\"size\"]:>15,} bytes  {a[\"state\"]}')
"
```

Check that:
- `pilosa-framework-<version>.tar.gz` exists
- `install.sh` exists
- `checksums.txt` exists
- Platform-relevant vendor tarballs exist (unified for native, legacy for others)

### 7. Restore workspace

```bash
mv .trash/temp/* agent_reports/ && rmdir .trash/temp
```

## Rules

- Do not edit any script in `.bin/`. They are human-maintained.
- Always audit vendor state first — never rebuild unnecessarily.
- Never force-push, force-tag, or delete release assets.
- Always verify the release assets are uploaded and in `uploaded` state before declaring done.
- If a native build fails with a pip dependency error, skip that platform and document the limitation.
- Handle `git status` cleanliness by moving untracked files to `.trash/temp/` — never by deleting or stashing tracked changes.
- The `publish-release.sh` script checks out the current branch's HEAD — make sure you're on the commit you want to publish.

## Script Reference

| Script | Path | Purpose |
|--------|------|---------|
| Build unified vendor | `.bin/build-pilosa-vendor.sh [platform]` | Creates `pilosa-vendor-<platform>.tar.gz` with standalone Python + both engines |
| Build legacy vendor | `.bin/build-rapidocr-vendor.sh [platform]` | DEPRECATED — creates `rapidocr-<platform>.tar.gz` with RapidOCR only |
| Package release | `.bin/package-release.sh <version>` | Builds `dist/v<version>/` with framework tarball + checksums |
| Publish release | `.bin/publish-release.sh <version>` | Uploads assets to GitHub release |

## See also

- `install.sh` (repo root) — installer that consumes these assets
- `.bin/lib/build-pilosa-vendor.sh` — the build script internals
- `orchestrator-dispatch` — general prompt routing; release ops don't go through Pilosa sub-agents
