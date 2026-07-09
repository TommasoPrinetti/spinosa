# Spinosa Architecture Clean-Up Plan

## Goal

Ship a clean, maintainable codebase where:

- **Framework files** (AGENTS.md, skills, prompts, system config) ship to user workspaces
- **Runtime** (TUI binary) ships as a self-contained package
- **CI** gates every change and handles releases
- **Dead code** is removed
- **Critical bugs** are fixed

---

## The Core Architectural Fix: Separate Framework from Runtime

**Current state:** `.spinosa/framework-files.tsv` lists 15 `packages/` directories. Every `spinosa update` copies all 15 packages into every user workspace. 12 of those are upstream opencode packages the user never touches.

**Root cause:** The framework tarball conflates two things:
1. **Agent files** — the instructions, skills, prompts, and system config that make Spinosa work (≈60 files)
2. **Runtime source** — the TypeScript source of 15 packages (≈250K lines)

**Target:** Framework = agent files only. Runtime = `@spinosa/tui` binary (npm) + optional dev source tree.

### Step 1: Split the Manifest

Create two manifests:

```
.spinosa/
├── framework-files.tsv        # Agent files only (no packages/)
├── runtime-files.tsv          # Packages needed for dev mode (was in framework-files.tsv)
└── retired-framework-files.tsv
```

**New `framework-files.tsv`** — everything currently in it MINUS `packages/` entries:

```
path	role	update_policy
AGENTS.md	framework	always_replace
README.md	framework	replace_if_unmodified
package.json	framework	replace_if_unmodified
bunfig.toml	framework	replace_if_unmodified
LICENSE	framework	replace_if_unmodified
patches/	framework	replace_if_unmodified
.gitignore	framework	replace_if_unmodified
.editorconfig	framework	replace_if_unmodified
.bin/check-startup.sh	framework	replace_if_unmodified
startup-prompt.md	framework	replace_if_unmodified
metadata/version	framework	replace_if_unmodified
.bin/AGENTS.md	framework	replace_if_unmodified
.bin/lib/CONVERTER_PROTOCOL.md	framework	replace_if_unmodified
.spinosa/retired-framework-files.tsv	framework	replace_if_unmodified
.bin/startup-prompt.md	framework	replace_if_unmodified
.bin/spinosa	framework	replace_if_unmodified
.bin/lib/spinosa/	framework	replace_if_unmodified
.bin/sync-agents.sh	framework	replace_if_unmodified
.agents/	framework	replace_if_unmodified
docs/	framework	replace_if_unmodified
system/yaml_header_template.md	framework	replace_if_unmodified
system/AGENTS.md	framework	replace_if_unmodified
system/system_architecture_map.md	framework	replace_if_unmodified
system/configuration.md	user_state	never_replace
system/context.md	user_state	never_replace
system/dictionary.md	user_state	never_replace
system/workspace_index.md	user_state	never_replace
raw/AGENTS.md	framework	replace_if_unmodified
raw/.gitkeep	framework	replace_if_unmodified
maps/AGENTS.md	framework	replace_if_unmodified
maps/map_template.md	framework	replace_if_unmodified
maps/.gitkeep	framework	replace_if_unmodified
.logs/AGENTS.md	framework	replace_if_unmodified
.logs/.gitkeep	framework	replace_if_unmodified
.spinosa/memory/	user_state	never_replace
.spinosa/archive/	user_state	never_replace
.spinosa/memory/AGENTS.md	framework	replace_if_unmodified
.spinosa/memory/orchestrator-notes.md	user_state	never_replace
.spinosa/memory/.gitkeep	framework	replace_if_unmodified
agent_reports/AGENTS.md	framework	replace_if_unmodified
agent_reports/.gitkeep	framework	replace_if_unmodified
.trash/AGENTS.md	framework	replace_if_unmodified
.trash/.gitkeep	framework	replace_if_unmodified
CLAUDE.md	generated_state	exclude_from_update
.obsidian/appearance.json	framework	replace_if_unmodified
.obsidian/snippets/spinosa.css	framework	replace_if_unmodified
```

**New `runtime-files.tsv`** — the 15 `packages/` entries, for dev-mode source tree only:

```
# Development-only: shipped in framework tarball for dev mode (SPINOSA_FRAMEWORK_ROOT).
# Production users get the TUI via @spinosa/tui npm package instead.
path	role	update_policy
packages/spinosa-core/	runtime	replace_if_unmodified
packages/opencode/	runtime	replace_if_unmodified
packages/tui/	runtime	replace_if_unmodified
packages/core/	runtime	replace_if_unmodified
packages/effect-drizzle-sqlite/	runtime	replace_if_unmodified
packages/effect-sqlite-node/	runtime	replace_if_unmodified
packages/http-recorder/	runtime	replace_if_unmodified
packages/llm/	runtime	replace_if_unmodified
packages/plugin/	runtime	replace_if_unmodified
packages/protocol/	runtime	replace_if_unmodified
packages/schema/	runtime	replace_if_unmodified
packages/script/	runtime	replace_if_unmodified
packages/sdk/js/	runtime	replace_if_unmodified
packages/server/	runtime	replace_if_unmodified
packages/ui/	runtime	replace_if_unmodified
```

### Step 2: Update `spinosa update` to Skip Runtime Files

In `.bin/lib/spinosa/commands_system.sh` (the `cmd_update` function), the manifest reader currently treats ALL entries as framework files to copy. Add a filter: skip entries with `role: runtime` when copying into workspaces.

This means `spinosa update` only copies the agent files — not the 15 packages. User workspaces get lighter by ~250K lines.

### Step 3: Simplify `package-release.sh`

Currently builds one tarball with everything. New behavior:

1. Build **framework tarball** from `framework-files.tsv` — agent files only (~5MB)
2. Build **runtime tarball** from `runtime-files.tsv` — for dev mode, NOT shipped by default
3. `install.sh` extracts both into `~/.spinosa/versions/X.Y.Z/`:
   - Framework files: always
   - Runtime packages: only if user passes `--dev` flag
4. `bun install --production` only runs if `--dev` flag is set

Production install (default):
```
curl .../install.sh | bash
# → Downloads ~5MB framework tarball
# → Installs @spinosa/tui via npm
# → Done. No bun install, no 250K lines of source.
```

Dev install:
```
curl .../install.sh | bash -s -- --dev
# → Downloads both tarballs
# → bun install --production
# → Sets SPINOSA_FRAMEWORK_ROOT
```

### Step 4: Clean Up `install.sh`

Remove the `bun install --production` block for the production path. Move it behind a `--dev` flag. This cuts install time from ~60s to ~5s for production users.

---

## Package Structure Cleanup

### Flatten `packages/sdk/js/` → `packages/sdk/`

- Move contents of `packages/sdk/js/` up one level
- Update all `workspace:*` references in `package.json` workspaces array
- Delete the `js/` subdirectory
- This removes pointless nesting (no other language SDK exists)

### Document the opencode fork

Create `packages/opencode/UPSTREAM.md`:

```markdown
# Upstream: anomalco/opencode

- Fork commit: 7b25f9e58d448b2d7b320902a870c7458c6e899a
- Upstream version: v1.17.12
- Fork date: ~2026-06
- Import method: git filter-repo subtree

## Policy

- Do NOT modify packages/opencode/src/ unless fixing an upstream bug
- Pull upstream changes: git subtree pull
- Spinosa extensions live in packages/tui/src/spinosa/ and packages/spinosa-core/
```

### Clean root `package.json` deps

Move `@ff-labs/fff-bun`, `@opentui/core`, `@parcel/watcher` from root `dependencies` to the workspace package that actually imports them. Root `package.json` being `private: true` shouldn't have runtime deps.

---

## Critical Bug Fixes

### Fix macOS `sort -V` → Silent Version Detection Failure

**File:** `install.sh` and `.bin/lib/spinosa/install_state.sh`

**Problem:** BSD `sort` on macOS ignores `-V` flag, does lexicographic sort. `0.8.0-beta.16` sorts AFTER `0.9.0` in lexicographic order (`.` < `-`), so the "latest version" detection picks the wrong version.

**Fix:** Replace all `sort -V | tail -1` with the `compare_versions` function already defined in install.sh. The function does proper semver comparison. Keep a single implementation shared between install.sh and install_state.sh.

```bash
# OLD (broken on macOS):
latest="$(ls -d "$SPINOSA_HOME/versions"/*/ 2>/dev/null | sort -V | tail -1)"

# NEW (works everywhere):
latest=""
for d in "$SPINOSA_HOME/versions"/*/; do
  [ -d "$d" ] || continue
  ver="$(basename "$d")"
  if spinosa_version_install_complete "$ver"; then
    if [ -z "$latest" ] || compare_versions "$ver" "$latest" gt; then
      latest="$ver"
    fi
  fi
done
```

### Fix safe_untar Security Divergence

**File:** `.bin/lib/spinosa/core.sh`

**Problem:** `install.sh`'s `safe_untar` has path-traversal checks (rejects paths starting with `/` or containing `..`). `.bin/lib/spinosa/core.sh`'s version is missing these checks.

**Fix:** Copy the security checks from install.sh's safe_untar into core.sh's version. Add a comment at both locations: "MUST keep in sync with [other file]."

### Fix CLAUDE.md Frontmatter Duplication

**File:** `.bin/sync-agents.sh`

**Problem:** The script appends `generated_by: sync-agents` without removing stale `generated_by` keys from previous runs.

**Fix:** Strip existing `generated_by` keys before appending the new one. In the `sync_agents_file` function.

---

## CI Pipeline

### Add to existing `ci.yml`

```yaml
jobs:
  test:
    # ... existing bash checks ...

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup-bun  # need to create this
      - run: bun run typecheck

  unit-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup-bun
      - run: bun install
      - run: bun test --filter './packages/*'
```

Create `.github/actions/setup-bun/action.yml` (matching pattern from upstream opencode).

### Add `release.yml` (Phase 2 of migration plan)

Full CI-driven release pipeline as designed previously.

---

## Dead Code Removal

Remove these files (move to `.trash/` first, delete after confirming):

| File | Reason |
|------|--------|
| `.bin/build-spinosa-vendor.sh` | Retired v0.8.0-beta.12 |
| `.bin/test-install-vendor-reuse.sh` | Tests retired vendor system |
| `.bin/lib/vendor/` | Vendor tarball directory (empty since v0.8.0-beta.12) |
| `RELEASE_GUIDE.md` vendor sections | Stale Python vendor references |
| `publish-release.sh` VENDOR_ASSETS loop (lines 150-156) | Dead code |
| `package-release.sh` vendor staging (lines 292-303) | Dead code |

---

## Remaining Items (Lower Priority)

| Item | When |
|------|------|
| Generate agent mirrors at build time, don't commit | Phase 2 (with CI pipeline) |
| Deduplicate AI SDK deps in opencode vs core | Phase 3 (riskier — changes dep graph) |
| Patch audit (document WHY for each of 14 patches) | Phase 3 |
| Convert route types to plugin-registration | Phase 3 |
| Define explicit core exports | Phase 3 |
| Decouple home.tsx from spinosa imports | Phase 3 |
| Compile `.bin/spinosa` to binary | Phase 3 |
| Document Hermes agent gap | Phase 3 |

---

## Implementation Order

```
Phase 1 (this session):
  ✅ Version unification
  [ ] Fix macOS sort -V bug
  [ ] Fix safe_untar divergence
  [ ] Fix CLAUDE.md frontmatter duplication
  [ ] Remove dead code
  [ ] Create UPSTREAM.md

Phase 2:
  [ ] Split framework-files.tsv → framework + runtime manifests
  [ ] Update spinosa update to skip runtime files
  [ ] Split package-release.sh for two tarballs
  [ ] Simplify install.sh (--dev flag, remove bun install from default path)
  [ ] CI: add typecheck + test jobs
  [ ] CI: add release pipeline

Phase 3:
  [ ] Flatten sdk/js/ → sdk/
  [ ] Clean root package.json deps
  [ ] Agent mirror generation at build time
  [ ] Patch audit
  [ ] Remaining lower-priority items
```
