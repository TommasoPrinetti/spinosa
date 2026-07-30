
# STALE — shell upgrade path deleted; see TypeScript upgradeFramework

# Upgrade/Update Workflow Audit — 2026-07-09

## Summary

Both workflows are structurally sound but had four production issues from the Phase 1-3 changes. Three are now fixed.

---

## Issues Found & Fixed

### 1. `PINNED_VERSION` fallback reads `__VERSION__` placeholder (FIXED)

**File:** `framework/bin/lib/spinosa/commands_system.sh:525-533`

The version filter at line 524-529 falls back to grepping `PINNED_VERSION` from `install.sh` when `framework_version` returns empty/dev. Since Phase 1 changed `PINNED_VERSION` to `__VERSION__` placeholder, this fallback would return `__VERSION__` in dev mode, making the version filter useless.

**Fix:** Added `metadata/version` as the primary fallback (always has the real version). The `install.sh` fallback now rejects the `__VERSION__` placeholder.

### 2. Workspace paths: `.spinosa/` → `framework/spinosa/` (FIXED)

**Files:** `commands_system.sh`, `workspace.sh`, `workspace.sh`

The restructure moved `.spinosa/` to `framework/spinosa/`. Existing workspaces created before the restructure have the old `.spinosa/workspace` path. Four functions were affected:

| Function | File | Fix |
|----------|------|-----|
| `validate_workspace()` | workspace.sh:507-514 | Checks both new and old paths |
| `workspace_framework_version_value()` | workspace.sh:547-553 | Tries new path, falls back to old |
| `require_workspace()` CWD check | workspace.sh:598 | Checks both paths |
| `cmd_update()` metadata resolution | commands_system.sh:586-605 | Migrates old→new on first update |

### 3. `cmd_upgrade` re-exec path after upgrade (OK — no fix needed)

**File:** `commands_system.sh:309-313`

After a successful upgrade, `cmd_upgrade` re-execs `"${SPINOSA_HOME}/bin/spinosa"` to run workspace updates under the new framework. This uses the installed path (`~/.spinosa/bin/spinosa`) which is unchanged by the restructure — `install.sh` creates the shim at this path regardless of internal structure.

The `__post_upgrade_workspaces` flow at lines 319+ reads `prompt_upgrade_workspaces` which uses `discover_registered_workspaces`. This function reads from the registry (a flat file), not from workspace-internal paths. No impact from restructure.

### 4. Runtime role exclusion verified (OK — working correctly)

`is_release_managed_role()` in `core.sh:475-478` excludes `runtime` role. This is called by `is_framework_manifest_entry()` which is used at all four manifest-reading sites in `commands_system.sh` (lines 640, 682, 706, 834). The 15 `packages/` entries marked `role: runtime` are correctly skipped during `spinosa update`.

---

## Workflow Flow Diagrams

### `spinosa upgrade` (commands_system.sh:181-316)

```
1. Parse args (--channel, --version, --yes, --reinstall)
2. Resolve target version:
   - Specific version → installer_url = install_url_for_channel(channel, version)
   - "latest" → resolve_release_version_for_channel(channel)
3. Check if already on this version → skip if same and not --reinstall
4. Fetch & display release notes (unless --yes)
5. Confirm with user
6. Download installer from GitHub
7. Run: bash installer.sh --upgrade --version X.Y.Z --no-launch [--yes] [--reinstall]
8. On success: clear version cache, re-resolve FRAMEWORK_ROOT
9. Verify post-install version matches expected
10. Re-exec self: exec ~/.spinosa/bin/spinosa __post_upgrade_workspaces
11. → prompt_upgrade_workspaces() prompts to run spinosa update on each workspace
```

### `spinosa update` (commands_system.sh:497-1068)

```
1. Parse args (--yes, --dry-run, --force, [workspace-path])
2. Resolve workspace:
   - Provided path → validate_workspace → register
   - No path → require_workspace (CWD or picker)
   - "__all__" → batch mode (iterate registered workspaces)
3. Backward compat: migrate old .spinosa/workspace → framework/spinosa/workspace
4. Read framework manifest (framework/spinosa/framework-files.tsv)
5. Count entries: skip runtime, user_state, generated_state roles
6. Compare versions: installed vs workspace (block if installed older)
7. Phase 1: Build declared/processed lists from manifest
8. Phase 2: Copy framework files into workspace
   - ADD: file doesn't exist in workspace → copy from framework root
   - UPDATE: file exists and differs → replace (unless unmodified check fails)
   - SKIP: file identical or user_state → skip
9. Phase 3: Remove files in workspace not in manifest (if previous manifest existed)
10. Phase 4: Remove retired files (from retired-framework-files.tsv)
11. Regenerate workspace manifest (manifest.tsv)
12. Update workspace metadata (framework_version)
13. Run sync-agents.sh if agents changed
```

---

## Remaining Risk Areas

| Area | Risk | Mitigation |
|------|------|-----------|
| Cloud storage paths | Timeout on large dirs, Google Drive FUSE issues | Already handled: per-file timeout, stream-first copies, retry logic |
| `compare_versions` in bash 3.2 | Array syntax, `local` in loops | Has worked so far (installer auto-re-execs with bash) |
| Version cache staleness | 1-hour cache may show stale upgrade prompts | Acceptable — reduces GitHub API calls |
| `replace_if_unmodified` integrity | SHA-256 checksum comparison | OK — tracked per-file |
| Old `.spinosa/` dirs left as orphans | After migration, old dirs remain | Low impact — small metadata files, no functional issue |

---

## What's Production-Grade

- **Channel inference**: prerelease suffix → beta, plain semver → stable. Correct in both upgrade and update.
- **Version comparison**: `compare_versions` handles prereleases correctly (numeric component comparison for `beta.2` vs `beta.16`).
- **Re-exec after upgrade**: Clean — exports SPINOSA_POST_UPGRADE_REEXEC to prevent infinite loops.
- **Post-upgrade verification**: Checks installed version matches expected before proceeding.
- **Batch workspace update**: Handles `__all__` mode, filters stale workspaces, tracks per-workspace failures.
- **Dry-run mode**: Full preview of changes without applying.
- **Manifest integrity**: Source paths validated for traversal attacks.
