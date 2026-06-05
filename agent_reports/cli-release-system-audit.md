# Pilosa CLI Release System — Comprehensive Audit

**Date:** 2026-06-05  
**Scope:** Full cross-reference audit of `.bin/pilosa`, `.bin/check-startup.sh`, `.bin/sync-agents.sh`, `.bin/lib/metrics.sh`, `.bin/AGENTS.md`, `.pilosa/framework-files.tsv`, `.pilosa/retired-framework-files.tsv`, `.gitignore`, `README.md`, `AGENTS.md`, and all vendor agent/skill directories.  
**Status:** 33 issues found (7 Critical, 11 High, 11 Medium, 4 Low)

---

## 1. CLI BUGS (`.bin/pilosa`)

### CRITICAL — Uncommitted framework manifest entries break release packaging (3 files)

Three entries in `framework-files.tsv` are NOT tracked by git. The `package-release.sh` script (line 80) aborts with "required manifest path not found" when these are missing during release packaging.

| File in manifest | Git status | Manifest line |
|---|---|---|
| `.bin/lib/metrics.sh` | NOT IN GIT | 8 |
| `.pilosa/retired-framework-files.tsv` | NOT IN GIT | 9 |
| `.opencode/package.json` | NOT IN GIT | 15 |

**Impact:** Any `bash .bin/package-release.sh <version>` invocation will abort. These files exist on disk but have never been committed. They appear in `git status` output as untracked (`??`).

### HIGH — `sort -V` (version sort) is GNU-only; fails on macOS default sort

`.bin/pilosa` line 46:
```bash
latest_version="$(ls -1 "${PILOSA_HOME}/versions" 2>/dev/null | sort -V | tail -1)"
```
The BSD `sort` on macOS does not support `-V` (version sort). This only affects **installed mode** (the `${PILOSA_HOME}/versions/` path). Dev mode is not affected because `resolve_framework_root()` returns early at line 40.

### HIGH — `pilosa new` creates `logs/.gitkeep` not listed in `framework-files.tsv`

`.bin/pilosa` lines 1213-1217 create `.gitkeep` in 5 directories: `raw`, `maps`, `logs`, `agent_reports`, `.trash`. But `framework-files.tsv` only lists `.gitkeep` for `raw/` (line 25), `maps/` (line 28), `agent_reports/` (line 33), and `.trash/` (line 35). `logs/.gitkeep` is an orphan with no manifest entry — it won't be cleaned, updated, or tracked by the release system.

### MEDIUM — `copy_source()` triple-passes the same `find` over the source tree

`.bin/pilosa` lines 705-767: Three sequential `find "$source_path" -type f -print0` calls, each filtering by a different file class. This is O(3n) file system traversal. Additionally, the `total_files` variable at line 707 depends on global variables (`SCAN_MARKDOWN_COUNT`, `SCAN_NATIVE_COUNT`, `SCAN_BINARY_COPYABLE_COUNT`) set by a prior `scan_source()` call — if `scan_source()` was never called, the counts default to 0 and the progress bar silently breaks.

### MEDIUM — Header-skip logic hardcodes the string `"path"`

`.bin/pilosa` line 1041 (`read_manifest`) and repeated at lines 1197, 1236, 1361, 1406, 1496, 1544, 1569: All use `[[ "$path" == "path" ]] && continue` to skip the TSV header. If the column header value ever changes, every occurrence across the codebase breaks.

### LOW — `build_launch_command()` bare `sed` fallback for URL encoding is minimal

`.bin/pilosa` lines 468-469: When `python3` is unavailable, the fallback `sed 's/ /%20/g; s/"/%22/g'` encodes only spaces and double-quotes. All other special characters (newlines, single quotes, ampersands, angle brackets, etc.) pass through unencoded, producing broken URLs for the "Claude Code Desktop" handler.

### LOW — `.bin/AGENTS.md` claims POSIX shell compatibility but scripts use bashisms

`.bin/AGENTS.md` line 27 states "POSIX-compatible shell." But `.bin/pilosa` uses: `{1..76}` brace expansion (lines 65, 432, 438), `${BASH_SOURCE}` (line 23), `local -a` arrays (lines 1352-1358). `sync-agents.sh` uses `${BASH_REMATCH}` (line 88). These are Bash-specific extensions, not POSIX.

---

## 2. FRAMEWORK-FILES.TSV ISSUES

### CRITICAL — `framework-files.tsv` lists 3 files that are not committed to git

Same 3 files as Section 1. The `package-release.sh` copies framework-owned files from the repo based on the manifest (lines 62-83) and aborts on missing required files (line 80: `echo "ERROR: required manifest path not found: $path"`). These are:

- `.bin/lib/metrics.sh` — framework, `replace_if_unmodified` (TSV line 8)
- `.pilosa/retired-framework-files.tsv` — framework, `replace_if_unmodified` (TSV line 9)
- `.opencode/package.json` — framework, `replace_if_unmodified` (TSV line 15)

### CRITICAL — `.trash/AGENTS.md` listed as framework file but `.gitignore` blocks it entirely

`framework-files.tsv` line 34: `.trash/AGENTS.md` → `framework`, `replace_if_unmodified`.  
`.gitignore` line 51: `.trash/` — ignores the entire `.trash/` directory.

This file can never be committed to git. The release packaging process would need it present (it is framework-owned, role is `framework`), but `.gitignore` prevents version control. Meanwhile, `.trash/.gitkeep` IS tracked (it was committed before the `.gitignore` rule was added), creating an inconsistent state where `.gitkeep` ships but `AGENTS.md` does not.

**Fix:** Either make the `.gitignore` pattern `.trash/*` with `!.trash/AGENTS.md` and `!.trash/.gitkeep` exceptions, or remove `.trash/AGENTS.md` from the manifest (change role to `generated_state` or remove entirely).

### HIGH — `.bin/AGENTS.md` (tracked) is missing from `framework-files.tsv`

`.bin/AGENTS.md` exists on disk, is tracked by git, serves as directory guidance for `.bin/` scripts, but is not listed in the framework manifest. Framework releases would lack this file.

### HIGH — `.bin/package-release.sh` and `.bin/publish-release.sh` are not in the manifest

`package-release.sh` is tracked by git, `publish-release.sh` is untracked. Neither is in `framework-files.tsv`. If the intent is that these are build tools that don't ship with framework releases, that's fine — but `.bin/AGENTS.md` should document this distinction.

### HIGH — `install.sh` is tracked but not in `framework-files.tsv`

`install.sh` at the repo root is tracked by git but absent from the manifest. `package-release.sh` copies it manually (line 183) outside the manifest-driven path. This bypasses the manifest-as-single-source-of-truth architecture.

### HIGH — `.github/copilot-instructions.md` is tracked but not in `framework-files.tsv`

Whether this should be in the manifest depends on design intent (should workspaces receive Copilot instructions?). Absence from the manifest may be intentional, but it is a framework file on disk that is not accounted for.

### HIGH — `raw/.ocr-processed.log` exists on disk but is neither in manifest nor properly gitignored

`.gitignore` line 22 has `*.log`, but git's `*.log` pattern does NOT match files starting with a dot (`.ocr-processed.log`). This 341KB workspace-scope user data file is therefore neither tracked (correct) nor ignored (incorrect), making it permanent `git status` noise. Verification: `git ls-files --error-unmatch raw/.ocr-processed.log` returns error (untracked).

### MEDIUM — Obsidian files are tracked but missing from the manifest

`.obsidian/appearance.json` and `.obsidian/snippets/pilosa.css` exist on disk and are tracked (via `.gitignore` exceptions at lines 31-33). But neither is listed in `framework-files.tsv`. The `appearance.json` is written by `pilosa new` (`.bin/pilosa` lines 924-930) and should be distributed as a framework asset. `pilosa.css` is a CSS snippet for Obsidian rendering.

### MEDIUM — `logs/session_metrics.tsv` is `user_state` and correctly untracked, but `raw/.ocr-processed.log` has no comparable status

`raw/.ocr-processed.log` is a 341KB log file inside `raw/` that looks like user workspace data (OCR processing log). It is not in `framework-files.tsv` (correct — it is not framework-owned) and not gitignored properly (incorrect — `*.log` does not match dot-prefixed files).

### MEDIUM — `retired-framework-files.tsv` entries are correct, but the file itself is untracked

The retired manifest correctly lists 3 retired files: `onboard.command`, `onboard.cmd`, `.bin/onboard.sh`. All three are staged for deletion (`git status` shows `D`). However, the retired manifest itself (`.pilosa/retired-framework-files.tsv`) is untracked, so it cannot be shipped in a release — which means `cmd_update()` will work in dev mode but fail in installed mode for its retired-files cleanup logic.

---

## 3. SYNC-AGENTS.SH ISSUES

### MEDIUM — Redundant `.opencode/skills/` removal before the skill-sync loop

`.bin/sync-agents.sh` lines 33-34 remove `.opencode/skills/` once, and then the loop at lines 155-174 does `rm -rf "$dest"` for each platform (including `.opencode/skills/` again). Functional duplication; not harmful but indicates the initial clean step (lines 33-34) was added before the loop was generalized to iterate over three platforms.

### MEDIUM — Agent directories use `rm -f *.md` instead of `rm -rf` for stale cleanup

Lines 45-46:
```bash
rm -f "$REPO_ROOT/.opencode/agents/"*.md
rm -f "$REPO_ROOT/.claude/agents/"*.md
```
If a directory or non-`.md` file ended up in these paths (e.g., from manual intervention), it would not be cleaned. Low risk since the script only ever creates `.md` files.

### MEDIUM — `sync-agents.sh` is not documented in `.bin/AGENTS.md`

`.bin/AGENTS.md` script table (lines 31-34) only lists `pilosa` and `check-startup.sh`. The `sync-agents.sh` script is entirely absent from the documentation, despite being the sole mechanism for generating vendor agent mirrors and syncing CLAUDE.md.

### OK — All 7 agent types are handled

The `case "$agent"` at lines 128-136 correctly maps all 7 agents: `pilosa-searcher`, `pilosa-analyst`, `pilosa-writer`, `pilosa-verifier`, `pilosa-janitor`, `pilosa-mapper`, `pilosa-serendippo`. The permission mapping (canonical read/grep/glob/write/move → OpenCode read/grep/glob/edit/bash) is correct. CLAUDE.md sync (line 179) works correctly. `.codex/agents/` is correctly excluded (manually maintained TOML). Skill sync correctly handles all three platforms and `references/` subdirectories.

### LOW — Claude tools mapping uses a hardcoded `case` statement with no fallback

Lines 128-136: If a new agent is added to `.agents/agents/`, the sync script must be manually updated — there is no `*` fallback or auto-detection. The OpenCode permission mapping at lines 98-111 dynamically reads from the canonical frontmatter, which is better but still requires explicit permission key mapping.

---

## 4. CHECK-STARTUP.SH ISSUES

### HIGH — Unquoted glob in `for` loops can silently set incorrect boolean state

`check-startup.sh` line 216:
```bash
for map_file in "$maps_dir"/*.md; do
```
If no `.md` files exist in `maps/`, bash iterates once with the literal string `"$maps_dir/*.md"` (since `nullglob` is not set). `basename` returns `*.md`, which does not match any of the skip conditions (`AGENTS.md`, `map_template.md`, `.gitkeep`), so `has_overview=true` is incorrectly set — the validator reports success when no maps exist.

Same issue at line 227:
```bash
for dir in "$maps_dir"/*/; do
```
If no subdirectories exist, `basename "$dir"` returns `*/` (or `*`), which does not match `.gitkeep`, so `has_groups=true` is incorrectly set.

**Fix:** Add `shopt -s nullglob` at the top of the script, or guard with `[[ -e "$map_file" ]]` inside the loop.

### MEDIUM — Stale-marker regex is outdated relative to current templates

Lines 60-62 check for `"To be discovered"` and `"Not specified during fast setup"`. The current `system/context.md` template (generated by `.bin/pilosa` lines 844-867) uses `[inferred during startup]` and `[identified during startup]` as placeholder patterns. None of these match the regex. The stale-marker check therefore won't catch incomplete startup states using the new template format.

### MEDIUM — No validation of `.obsidian/` files

The script validates raw files, map files, dictionary, and workspace index, but never checks `.obsidian/appearance.json` or `.obsidian/snippets/pilosa.css`, both of which are created by `pilosa new` and distributed as framework assets.

### LOW — Required-files check is a subset of what startup actually needs

Lines 27-32 check 4 files: `AGENTS.md`, `system/configuration.md`, `system/startup.md`, `system/context.md`. Missing from the validation set: `system/yaml_header_template.md` (the startup prompt's step 4 reading order), `system/system_architecture_map.md`, and `.pilosa/framework-files.tsv` (used by the CLI for updates).

---

## 5. README.MD ISSUES

### HIGH — Workspace structure diagram is incomplete

`README.md` lines 84-119 show a tree diagram that is missing:

- `.bin/AGENTS.md`, `.bin/sync-agents.sh`, `.bin/publish-release.sh`, `.bin/package-release.sh`, `.bin/lib/metrics.sh` (only `pilosa` and `check-startup.sh` are shown)
- `.agents/skills/evidence-search/` and `.agents/skills/context-analysis/` (7 skills on disk, only 5 shown: source-intake, report-writing, claim-verification, workspace-cleanup, orchestrator-dispatch)
- `.opencode/skills/`, `.opencode/package.json`
- `.obsidian/snippets/` and `.obsidian/appearance.json`
- `CLAUDE.md` (generated), `install.sh` (installer), `LICENSE`

### MEDIUM — Skill listing shows 5 of 7 existing skills

README lines 93-98 list: `source-intake/`, `report-writing/`, `claim-verification/`, `workspace-cleanup/`, `orchestrator-dispatch/`. Missing: `evidence-search/`, `context-analysis/`. All 7 exist on disk under `.agents/skills/`.

### LOW — No mention of `--release-dir` or `--dry-run` update flags in README

README lines 73-76 show `pilosa update` and `pilosa update /path/to/workspace` but do not document the full flag set: `--version X.Y.Z`, `--release-dir DIR`, `--dry-run`, `--yes`, `--no-color`, `--no-gum`. These are only discoverable via `pilosa update --help`.

### LOW — Byte total claim in README may be misleading

README line 46 states: "Scan summary shows counts [...] and byte totals by major class where available." The CLI's `print_scan_summary()` (`.bin/pilosa` lines 681-692) shows byte totals for markdown, native, and PDF classes at lines 683-685. Images, video, audio are shown with byte totals but described as "skipped." Unknown files also receive a byte total. The text "where available" is misleading — byte totals are available for every class when `stat` works.

---

## 6. .GITIGNORE ISSUES

### CRITICAL — `.trash/` gitignore conflicts with manifest entry for `.trash/AGENTS.md`

`.gitignore` line 51: `.trash/` ignores the entire directory. `framework-files.tsv` line 34 lists `.trash/AGENTS.md` as a framework file (role: `framework`, policy: `replace_if_unmodified`). These are mutually exclusive — the file can never be committed to git and thus can never be shipped in a release. Either the manifest entry must be removed, or `.gitignore` must use `.trash/*` with `!.trash/AGENTS.md` and `!.trash/.gitkeep` exceptions.

### HIGH — `*.log` pattern misses dot-prefixed log files

`.gitignore` line 22: `*.log` — In git, this glob only matches files whose names do not start with a dot. The file `raw/.ocr-processed.log` (341KB, untracked) is therefore not ignored and permanently pollutes `git status`. **Fix:** Add `.raw/.ocr-processed.log` explicitly or change to `**/*.log` with exceptions, or add a separate `*.log` pattern.

### HIGH — `.opencode/package-lock.json` is untracked but not gitignored

`.opencode/package.json` IS in the manifest (framework-owned). The `package-lock.json` file is generated by `npm install` and exists on disk (confirmed by glob) but is neither tracked by git (`git ls-files` returns error) nor covered by any `.gitignore` rule. It should either be tracked alongside `package.json` or explicitly gitignored.

### MEDIUM — `.opencode/.gitignore` exists on disk as untracked file

A nested `.gitignore` at `.opencode/.gitignore` exists on disk (likely generated by `npm install` or the OpenCode SDK tooling). It is untracked and not covered by the root `.gitignore`. Should either be tracked or the root `.gitignore` should include `.opencode/.gitignore`.

### MEDIUM — 12 `.DS_Store` files exist on disk across tracked directories

Found at: root, `.agents/`, `.bin/`, `.claude/`, `.codex/`, `.opencode/`, `raw/`, `system/`, `.obsidian/`, `.agents/skills/`, `agent_reports/` (12 total). While `.gitignore` line 2 has `.DS_Store`, these are the macOS junk that perpetually regenerates. The `package-release.sh` cleans them during staging (line 97), but local working trees accumulate them. Not a `.gitignore` bug per se, but a hygiene concern.

---

## 7. CROSS-REFERENCE ISSUES

### HIGH — Two agents in the Sub-Agent Pipeline table have no route sequence that invokes them

`AGENTS.md` Sub-Agent Pipeline table (lines 129-139) lists 7 agents with roles. The Choose Sequence table (lines 91-100) defines 8 route classes with agent sequences.

Agents **never dispatched** by any route:
- **`pilosa-mapper`** — Role: "Reads raw files in batch, extracts content-grounded fragments; writes navigation maps." No route invokes it. Only used internally during the startup workflow.
- **`pilosa-serendippo`** — Role: "Holistic serendipitous research — finds hidden connections across files." No route invokes it.

This is a documentation/pipeline gap: the pipeline table sets expectations that these agents participate in request routing, but the route table never dispatches them. Either add routes for them or clarify in the table that they are startup-only/internal agents.

### MEDIUM — `pilosa new` sidecar naming can collide indefinitely if cleanup fails

`.bin/pilosa` lines 330-339 (`next_sidecar_path`): The algorithm appends `.pilosa-new.{$n}` and increments `n` until a non-existing path is found. No maximum iteration cap is enforced. If a previous failed update left hundreds of sidecars, the loop could iterate for a long time.

### LOW — Detection of LLM CLIs separates "Claude Code" from "Desktop" variant but detection only handles the CLI form

`.bin/pilosa` line 1051: `command -v claude` adds "Claude Code" to the detected list. "Claude Code Desktop" is selectable in the interactive menu (line 770) but never auto-detected. Users who only have the desktop app (no `claude` CLI on `PATH`) must manually select it — the detection list will say "Other (manual)".

---

## 8. SUMMARY TABLE

| Severity | Count | Area |
|---|---|---|
| **CRITICAL** | 7 | Package-release will abort (3 untracked manifest files: `.bin/lib/metrics.sh`, `.pilosa/retired-framework-files.tsv`, `.opencode/package.json`), `.trash/AGENTS.md` gitignore/manifest conflict, `sort -V` breaks installed mode on macOS, `logs/.gitkeep` orphan created by `pilosa new` |
| **HIGH** | 11 | Missing manifest entries (`.bin/AGENTS.md`, `package-release.sh`, `install.sh`, `.obsidian/` files), check-startup glob bugs (2), README diagram incomplete, 2 agents with no route sequences, `.gitignore` misses dot-log-files, 12 `.DS_Store` on disk, `package-lock.json` untracked/not-ignored |
| **MEDIUM** | 11 | Triple-find in `copy_source()`, hardcoded header "path" string, outdated stale-marker regex, redundant skill cleanup in sync script, agent dir cleanup uses `rm -f` not `rm -rf`, sync-agents not in `.bin/AGENTS.md`, check-startup missing `.obsidian/` validation, `raw/.ocr-processed.log` status, sidecar loop unbounded, `.opencode/.gitignore` untracked |
| **LOW** | 4 | POSIX claim in `.bin/AGENTS.md` is false, `sed` URL-encoding fallback incomplete, update flags not in README, byte-total wording misleading |

---

## 9. ACTION ITEMS (Prioritized)

### Immediate (Blocking Release)

1. Commit `.bin/lib/metrics.sh`, `.pilosa/retired-framework-files.tsv`, `.opencode/package.json` to git.
2. Resolve `.trash/AGENTS.md` conflict: either change `.gitignore` `.trash/` to `.trash/*` with `!.trash/AGENTS.md` and `!.trash/.gitkeep`, or remove `.trash/AGENTS.md` from `framework-files.tsv`.
3. Fix `sort -V` on macOS: use `sort -t. -k1,1n -k2,2n -k3,3n` as a portable version-sort alternative at `.bin/pilosa` line 46.

### High Priority (Correctness)

4. Add `logs/.gitkeep` to `framework-files.tsv` (or stop `pilosa new` from creating it at line 1214).
5. Add `.bin/AGENTS.md` to `framework-files.tsv`.
6. Add `shopt -s nullglob` to `check-startup.sh` or guard the `for` loops with existence checks.
7. Add missing pattern for dot-log files in `.gitignore` (add `*.log` entry or specific `raw/.ocr-processed.log` entry).
8. Add `.opencode/package-lock.json` to `.gitignore` (or track it alongside `package.json`).
9. Update README workspace diagram to include all current files/directories.

### Medium Priority (Hygiene)

10. Refactor `copy_source()` to single-pass source scanning.
11. Replace hardcoded `"path"` header skip with column-index-based parsing or tagged header detection.
12. Update `check-startup.sh` stale-marker regex to match current template placeholders (`[inferred during startup]`, etc.).
13. Add `sync-agents.sh` and missing scripts to `.bin/AGENTS.md` script table.
14. Add `pilosa-mapper` and `pilosa-serendippo` to route sequences or document them as startup-only agents.

### Low Priority (Polish)

15. Fix POSIX claim in `.bin/AGENTS.md` (change to "Bash" or remove the claim).
16. Improve `sed` URL encoding fallback to cover more characters.
17. Document `--release-dir` and `--dry-run` in README.
18. Add `.obsidian/` validation to `check-startup.sh`.
