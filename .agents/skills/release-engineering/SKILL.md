---
name: pilosa-release-engineering
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

| Tier | Pattern | Contains | When |
|------|---------|----------|------|
| Vendor | `pilosa-vendor-<platform>.tar.gz` | Standalone Python 3.11 + CLI wrappers (pip packages installed at install time) | Always |

The installer (`install.sh`) downloads the platform-specific vendor tarball from GitHub releases and installs pip packages at install time.

## Steps

### 1. Audit vendor state

List what exists in `.bin/lib/vendor/`:

```bash
ls -lh .bin/lib/vendor/*.tar.gz
```

Identify which platforms have vendor tarballs and which are missing.

### 2. Build vendor tarballs for all platforms

Build for all 4 platforms — pip packages are installed at install time,
so cross-platform builds always work:

```bash
bash .bin/build-pilosa-vendor.sh darwin-arm64
bash .bin/build-pilosa-vendor.sh darwin-amd64
bash .bin/build-pilosa-vendor.sh linux-amd64
bash .bin/build-pilosa-vendor.sh linux-arm64
```

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
- `pilosa-framework-<version>.tar.gz` (CLI + agents + config + gum binaries, ~18MB)
- `install.sh`
- `checksums.txt`

Vendor tarballs are Python-only (~26 MB each) and are published as standalone release assets. The installer downloads the platform-specific vendor from GitHub releases and installs pip packages at install time.

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
- `pilosa-vendor-<platform>.tar.gz` (4 platforms) exist

### 7. Align README

After publishing, check that the README reflects the new version:

```bash
rg 'v\d+\.\d+\.\d+' README.md
```

Update if stale:
- Curl URL in install command must point to new version
- Pinned version text
- Feature descriptions (routing, engine naming) must match current behaviour
- Both the **Install** section and **Quick start** section must agree
- If the release changed file-type routing (e.g. new MarkItDown filetypes), update the What it does and onboarding descriptions

Commit README changes:

```bash
git add README.md
git commit -m "docs: bump README to v<version>, align descriptions"
git push
```

### 8. Restore workspace

```bash
mv .trash/temp/* agent_reports/ && rmdir .trash/temp
```

## Rules

- Do not edit any script in `.bin/`. They are human-maintained.
- Always audit vendor state first — never rebuild unnecessarily.
- Never force-push, force-tag, or delete release assets.
- Always verify the release assets are uploaded and in `uploaded` state before declaring done.
- Handle `git status` cleanliness by moving untracked files to `.trash/temp/` — never by deleting or stashing tracked changes.
- The `publish-release.sh` script checks out the current branch's HEAD — make sure you're on the commit you want to publish.

## Script Reference

| Script | Path | Purpose |
|--------|------|---------|
| Build vendor | `.bin/build-pilosa-vendor.sh [platform]` | Creates `pilosa-vendor-<platform>.tar.gz` with standalone Python 3.11 + CLI wrappers |
| Package release | `.bin/package-release.sh <version>` | Builds `dist/v<version>/` with framework tarball + checksums |
| Publish release | `.bin/publish-release.sh <version>` | Uploads assets to GitHub release |

## See also

- `install.sh` (repo root) — installer that consumes these assets
- `.bin/lib/build-pilosa-vendor.sh` — the build script internals
- `pilosa-orchestrator-dispatch` — general prompt routing; release ops don't go through Pilosa sub-agents
