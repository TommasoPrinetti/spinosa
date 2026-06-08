---
type: analysis_report
created: 2026-06-08
scope: .bin/pilosa CLI and install.sh flow mapping
---

# Pilosa CLI and Install Script Flow Analysis

## File: `/Users/tommasoprinetti/Documents/pilosa-main/.bin/pilosa` (3936 lines)
## File: `/Users/tommasoprinetti/Documents/pilosa-main/install.sh` (689 lines)

---

## Global Architecture

### Entry Point (lines 3918-3934)

```
case "${1:-}" in
  new)       shift; cmd_new "$@" || true ;;
  onboard)   shift; cmd_onboard "$@" || true ;;
  update)    shift; cmd_update "$@" || true ;;
  upgrade)   shift; cmd_upgrade "$@" || true ;;
  check)     shift; cmd_check "$@" || true ;;
  sync)      shift; cmd_sync || true ;;
  health)    shift; cmd_health || true ;;
  uninstall) shift; cmd_uninstall "$@" || true ;;
  help|-h|--help) cmd_help ;;
  "") cmd_dashboard ;;              # <-- no args = dashboard
  *)
    printf '%s\n' "${R}Unknown command: $1${RESET}" >&2
    cmd_help
    exit 1
    ;;
esac
```

**Key observations:**
- All command dispatches use `|| true` which swallows errors. If `cmd_new` fails with exit 1, the script continues silently with exit 0. This is a **major concern**: errors from commands are silently eaten by the dispatch layer.
- The only explicit `exit 1` is for unknown commands.
- `cmd_dashboard` is the default when no args are given.

### Global Infrastructure (lines 1-87)

| Item | Detail |
|---|---|
| `set -euo pipefail` | Strict mode -- any unset variable or failed command kills the script |
| `PILOSA_HOME` | `$HOME/.pilosa` (overrideable) |
| `PILOSA_REPO` | `TommasoPrinetti/pilosa` |
| `FRAMEWORK_ROOT` | Resolved at line 86 via `resolve_framework_root()` |
| `cleanup_on_exit` trap | Kills spinner, runs `stty sane`. Registered for EXIT, INT, TERM |
| `USE_GUM` | Default 0; set to 1 via `--gum` flag or `USE_GUM=1` env |

### `resolve_framework_root()` (lines 53-84)

- **Dev mode**: Checks if `SCRIPT_DIR/../` has `.pilosa/framework-files.tsv`
- **Installed mode**: Looks in `~/.pilosa/versions/<latest>/` using `sort -V` (with portable fallback)
- **Failure**: Returns empty string. Commands that need framework (like `cmd_new`) will `die`.

---

## Command: `cmd_new` (lines 2359-2517)

### Entry and Argument Parsing

```
cmd_new()
  Parse: --force (die), --numbered, --no-color, --gum, --no-gum, --help|-h
  Collects positional args into new_args[]
```

**Note**: `--force` explicitly dies with message "--force is not supported for pilosa new." This is confusing -- it is accepted by the parser but always fails.

### Complete Flow

| Step | Action | User Interaction |
|------|--------|------------------|
| 1 | Corpus root prompt | `prompt_input "Corpus folder" "" "e.g. ~/Documents/my-research"` -- loop until valid directory |
| 2 | Auto-generate workspace path | `${parent}/${corpus_name}-pilosa` with numeric suffix collision avoidance. No user prompt. |
| 3 | Project name prompt | `prompt_input "Project name" "$default_name"` -- loop until non-empty |
| 4 | Framework check | `die` if FRAMEWORK_ROOT empty or manifest missing |
| 5 | Create workspace dir + copy framework files | `mkdir -p`, `cp -a` from manifest. Creates raw/, maps/, logs/, agent_reports/, .trash/ with .gitkeep |
| 6 | Write workspace metadata | Creates `.pilosa/workspace` and `.pilosa/manifest.tsv` |
| 7 | Register workspace | Appends to `~/.pilosa/workspaces.txt` |
| 8 | `run_integrated_onboarding` | **This is the big flow -- see below** |

### `run_integrated_onboarding()` (lines 2055-2171)

This is a shared function used by both `cmd_new` and `cmd_onboard`.

| Step | Line | Action | Prompts |
|------|------|--------|---------|
| 1.1 | 2061-2065 | If `preselected_source` given (cmd_new passes corpus_path), skip prompt | None |
| 1.2 | 2079-2090 | Source folder prompt loop | `prompt_directory "Source folder (absolute path)" "" "e.g. /home/user/Documents/my-sources"` -- validates exists and is directory |
| 2.1 | 2094-2097 | `print_onboarding_preflight` | Info only (writes to stderr) |
| 2.2 | 2096 | `scan_source "$source_path"` | Spinner animation during file scan |
| 2.3 | 2097 | `print_scan_summary` | Summary output |
| 2.4 | 2099 | `choose_import_batches` | `prompt_multi_choose` -- arrow-key or gum multi-select |
| 2.5 | 2101-2111 | Auto-detect OCR from selected extensions | No prompt |
| 2.6 | 2113-2133 | Copyable count, disk check, confirmation | `note` messages only, then `break` |
| 3.1 | 2137 | `copy_source "$source_path" "$root/raw"` | Progress bars for copy + OCR |
| 3.2 | 2141 | `choose_preferred_cli` | `prompt_choose` -- single-select with 8 CLI options |
| 3.3 | 2145 | `write_setup_files` | Writes system/context.md, system/configuration.md, .obsidian/appearance.json |
| 3.4 | 2146-2148 | `sed` to update setup_status | In-place edit |
| 3.5 | 2153-2154 | Print startup prompt preview + launch command preview | `print_box` |
| 3.6 | 2156 | `choose_handoff_action` | `prompt_choose` -- "Copy launch command" or "Run launch command now" |
| 3.7 | 2159-2168 | Execute handoff | `run_cli_with_prompt` or `copy_to_clipboard` |
| 3.8 | 2170 | `write_onboarding_summary` | Writes `.pilosa/onboarding-summary.md` |

### Exit Points

| Location | Type | Condition |
|----------|------|-----------|
| 2084-2089 | Loop retry | Empty or non-existent source path |
| 2099 | `return 1` | User cancels import batch selection |
| 2133 | `return 1` | Zero copyable files after scan |
| 2141 | `return 1` | User cancels CLI selection |
| 2156 | `return 1` | User cancels handoff action |
| 2160-2164 | Fallback | `run_cli_with_prompt` fails -- copies command instead |

### Side Effects

- Creates entire workspace directory tree
- Copies files from source into workspace
- Writes .pilosa/workspace, .pilosa/manifest.tsv, .pilosa/onboarding-summary.md
- Writes system/context.md, system/configuration.md
- Copies AGENTS.md to CLAUDE.md if preferred CLI is Claude Code
- Writes .obsidian/appearance.json
- Registers workspace in ~/.pilosa/workspaces.txt
- May exec a new process (Claude, Codex, etc.) if "Run now" chosen -- **this replaces the pilosa process**

### User Gotchas

1. **`--force` is accepted but always dies** (line 2368): Confusing UX
2. **Arrow key menu with `q` to cancel**: `arrow_select` returns 1 on `q`, causing `cmd_onboard` to `return 1`. The main dispatcher swallows this with `|| true`, so the user sees no error but no success either.
3. **`exec` in `run_cli_with_prompt`**: If user picks "Run now" with a supported CLI, the process is replaced. No return to pilosa.
4. **No way to go back**: Once you start onboarding, there is no "back" option. The source folder rescan loop is the only escape (via `choose_scan_action` returning "rescan").
5. **`choose_import_batches` loops indefinitely**: If user deselects all items and tries to continue, they get "Select at least one file type" warning and must re-select. There is no cancel option.

---

## Command: `cmd_onboard` (lines 2298-2353)

### Entry and Argument Parsing

```
cmd_onboard()
  Parse: --no-color, --gum, --no-gum, --source-dir PATH, --help|-h
  Positional args into onboard_args[]
  Resolves workspace via require_workspace()
  Extracts project name from .pilosa/workspace or prompts
```

### Complete Flow

| Step | Action | Prompts |
|------|--------|---------|
| 1 | `require_workspace` | If not in workspace: discover or prompt for path |
| 2 | `cd` to workspace | `die` on failure |
| 3 | Extract project_name from .pilosa/workspace | `prompt_input` if missing |
| 4 | Extract source_dir from .pilosa/workspace or --source-dir | Info if previous location found; warn if doesn't exist |
| 5 | `run_integrated_onboarding` | Same as cmd_new steps |

### Exit Points

| Location | Type | Condition |
|----------|------|-----------|
| 2316 | `die` | Unknown option |
| 2323-2326 | `return $?` | `require_workspace` fails |
| 2327 | `die` | Cannot cd to workspace |
| 2352 | via `run_integrated_onboarding` | All the same exits as cmd_new |

### Side Effects

- Writes same files as cmd_new's onboarding
- Modifies .pilosa/workspace (project_name, setup_status)
- Copies source files into raw/
- May exec a CLI process

### User Gotchas

1. **Bug: `workspace_path` is set to `""` on line 2299 but checked on line 2322**: The variable `workspace_path` is never set from `onboard_args`. The check `if [[ -n "$workspace_path" ]]` is always false. The `--source-dir` flag works, but positional workspace path is silently ignored.
2. **No validation that raw/ is empty**: If you re-run onboard on a workspace that already has files in raw/, existing files are not overwritten (skipped silently in `copy_source`).
3. **Same `return 1` swallowing** by main dispatcher.

---

## Command: `cmd_update` (lines 2522-2874)

### Entry and Argument Parsing

```
cmd_update()
  Parse: --version, --release-dir, --dry-run, --yes/-y, --no-color, --gum, --no-gum, --help|-h
  Positional: workspace path (optional)
  Resolves workspace via require_workspace()
```

### Complete Flow

| Step | Line | Action | User Interaction |
|------|------|--------|------------------|
| 1 | 2566-2572 | Resolve workspace, cd | `require_workspace` or die |
| 2 | 2574-2579 | Read current framework_version, project_name | Info output |
| 3 | 2582-2584 | Validate manifest exists | `die` if missing |
| 4 | 2587-2593 | `prepare_release_framework` | Downloads tarball, verifies checksum, extracts |
| 5 | 2596-2696 | Compare checksums (diff) | Lists: clean replace, forced replace, sidecar, add, directory, retired |
| 6 | 2708-2711 | Dry run exit | `return 0` with temp cleanup |
| 7 | 2714-2754 | Confirmation prompts (4 separate confirms) | confirm_action for: sidecars, forced, directories, retired, final "Apply" |
| 8 | 2756-2804 | Execute file updates | cp operations |
| 9 | 2807-2827 | Retired file cleanup | rm operations |
| 10 | 2829-2857 | Update manifest | Rewrite manifest.tsv |
| 11 | 2859-2863 | Update workspace version | sed in-place edit |

### Exit Points

| Location | Type | Condition |
|----------|------|-----------|
| 2553 | `die` | Unknown update option |
| 2559 | `die` | Extra workspace argument |
| 2568-2571 | `return $?` | Workspace resolution fails |
| 2572 | `die` | Cannot cd |
| 2583 | `die` | Manifest missing |
| 2709-2711 | `return 0` | Dry run |
| 2717-2721 | `return 0` | User declines sidecar |
| 2724-2729 | `return 0` | User declines forced replace |
| 2732-2737 | `return 0` | User declines directory refresh |
| 2740-2743 | `skip_retired_cleanup=1` | User declines retired removal (soft skip) |
| 2747-2750 | `return 0` | User declines final apply |

### Side Effects

- Downloads release tarball to temp dir
- Copies/overwrites framework files in workspace
- Creates `.pilosa-new` sidecar files for conflicts
- Rewrites `.pilosa/manifest.tsv`
- Updates `.pilosa/workspace` version
- Removes retired framework files
- Cleans up temp dir

### User Gotchas

1. **Four sequential confirmation prompts**: Users may find the multi-step confirmation tedious. The `--yes` flag bypasses all.
2. **`--yes` bypasses the final "Apply this update?" default is `n`**: With `--yes`, the update applies silently. Without it, default is "n" so declining is the safe default.
3. **Sidecar naming**: Files get `.pilosa-new` suffix. No guidance on how to resolve conflicts later.
4. **`prepare_release_framework` calls `die` on failure**: If the download fails, the script exits immediately. Temp dir cleanup happens via the global EXIT trap.

---

## Command: `cmd_upgrade` (lines 3685-3769)

### Entry and Argument Parsing

```
cmd_upgrade()
  Parse: --version, --yes/-y, --help|-h
  Target version defaults to "latest"
```

### Complete Flow

| Step | Line | Action | User Interaction |
|------|------|--------|------------------|
| 1 | 3706-3718 | Fetch release notes from GitHub API | spinner; `fetch_release_notes` uses curl + python3 |
| 2 | 3713-3714 | `display_release_notes` | Formatted box display |
| 3 | 3722-3727 | Confirm download | `confirm "Download and run the Pilosa installer to upgrade?"` |
| 4 | 3729-3753 | Download installer.sh from GitHub | First tries release tag, falls back to raw main branch |
| 5 | 3758-3763 | Build upgrade_args | `--upgrade`, optional `--version`, optional `--yes` |
| 6 | 3766 | `bash "$installer" "${upgrade_args[@]}"` | Runs install.sh |
| 7 | 3768 | `rm -rf "$tmpdir"` | Cleanup |

### Exit Points

| Location | Type | Condition |
|----------|------|-----------|
| 3693-3697 | `return 0` | `--help` |
| 3699 | `die` | Unknown option |
| 3724-3726 | `return 0` | User declines upgrade |
| 3743-3744 | Falls back to main branch | Release download fails |
| 3747-3748 | `die` | Main branch download also fails |
| 3766 | (implicit) | `bash` runs installer which may `exit 1` |

### Side Effects

- Downloads installer.sh to temp dir
- Executes install.sh with `--upgrade` flag (which replaces the pilosa binary, framework, vendor binaries)
- Cleans up temp dir

### User Gotchas

1. **`fetch_release_notes` depends on python3**: If python3 is not installed, release notes silently fail (warn only).
2. **Installer runs in subprocess**: The `bash "$installer"` call is a subprocess, not `exec`. After the installer finishes, control returns to cmd_upgrade.
3. **The installer itself may prompt**: install.sh has its own confirmation prompts (see install.sh analysis below).

---

## Command: `cmd_check` (lines 2879-3024)

### Entry and Argument Parsing

```
cmd_check()
  Takes optional $1 as workspace path
  Resolves workspace via require_workspace()
```

### Complete Flow

| Step | Line | Action | Prompts |
|------|------|--------|---------|
| 1 | 2883-2889 | Resolve workspace, cd | `require_workspace` or die |
| 2 | 2898-2910 | Check required files exist | AGENTS.md, system/configuration.md, system/startup.md, system/context.md, system/yaml_header_template.md, .pilosa/framework-files.tsv |
| 3 | 2912-2923 | Check for placeholder strings | Reads configuration.md + context.md |
| 4 | 2925-2931 | Check setup_status | Fail if "cli_started", warn if "workspace_started" not found |
| 5 | 2933-2942 | Check source_location | Extract from config, verify directory exists |
| 6 | 2944-2947 | Check external_sources_allowed | Must be "yes" or "no" |
| 7 | 2949-2958 | Check workspace_index.md + dictionary.md | Only if setup_status is "workspace_started" |
| 8 | 2960-2966 | Check .obsidian files | Warn if missing |
| 9 | 2968-2996 | Check maps directory | Only if "workspace_started" |

### Exit Points

| Location | Type | Condition |
|----------|------|-----------|
| 2885-2887 | `return $?` | Workspace resolution fails |
| 2889 | `die` | Cannot cd |
| 3012 | `exit 1` | **Uses `exit 1` not `return 1`** -- exits entire script |
| 3016 | Implicit return 0 | All checks pass |

### Side Effects

- None. Pure validation, no file writes.

### User Gotchas

1. **Uses `exit 1` on failure (line 3012)**: This is inconsistent with other commands which use `return 1`. With `exit 1`, the global EXIT trap fires and the script terminates. Since the main dispatcher uses `|| true`, this means the script exits with code 0 anyway (the `|| true` overrides). This is confusing but harmless.
2. **No way to check non-workspace directories**: The check only works on valid Pilosa workspaces.

---

## Command: `cmd_sync` (lines 3029-3196)

### Entry and Argument Parsing

```
cmd_sync()
  No arguments parsed. Pure execution.
  Hardcodes repo_root as SCRIPT_DIR/..
```

### Complete Flow

| Step | Line | Action | Side Effects |
|------|------|--------|--------------|
| 1 | 3030-3031 | Resolve repo_root | No side effects |
| 2 | 3038-3040 | Check canonical agents dir | `die` if missing |
| 3 | 3043-3044 | Clean stale .opencode/skills | `rm -rf` |
| 4 | 3047-3049 | Ensure vendor dirs exist | `mkdir -p` |
| 5 | 3051-3054 | Clean existing vendor agent files | `rm -f` on .opencode/agents/*.md, .claude/agents/*.md, .codex/agents/*.toml |
| 6 | 3064-3152 | For each canonical agent: parse frontmatter, generate OpenCode, Claude, Codex variants | Writes files to vendor dirs |
| 7 | 3155-3172 | Sync skills | `rm -rf` + `cp` to .opencode/skills, .claude/skills, .codex/skills |
| 8 | 3174-3191 | Sync CLAUDE.md | `cp AGENTS.md CLAUDE.md`, then `sed` to update frontmatter |

### Exit Points

| Location | Type | Condition |
|----------|------|-----------|
| 3039 | `die` | Canonical agents dir missing |
| 3196 | Implicit return 0 | Success |

### Side Effects

- **Deletes** .opencode/skills/ entirely
- **Deletes** all *.md from .opencode/agents/, .claude/agents/
- **Deletes** all *.toml from .codex/agents/
- **Deletes** all skills dirs under .opencode/skills, .claude/skills, .codex/skills
- **Writes** new agent files to .opencode/, .claude/, .codex/
- **Writes** CLAUDE.md with sed-modified frontmatter

### User Gotchas

1. **Destructive sync**: All existing vendor agent files are deleted and regenerated. Any local modifications to vendor agents are lost.
2. **No confirmation prompt**: Runs immediately with no user confirmation.
3. **`sed -i.bak` with cleanup**: Uses portable `sed -i.bak` then removes .bak. This works but is fragile on different platforms.
4. **Hardcoded repo_root**: `cmd_sync` resolves repo_root from SCRIPT_DIR, not from FRAMEWORK_ROOT. In installed mode, this would point to the wrong location if run from the installed binary.

---

## Command: `cmd_uninstall` (lines 2206-2250)

### Entry and Argument Parsing

```
cmd_uninstall()
  Parse: --no-color, --yes/-y, --help|-h
  Reads PILOSA_BIN_DIR (default: ~/.local/bin)
```

### Complete Flow

| Step | Line | Action | Prompts |
|------|------|--------|---------|
| 1 | 2220-2224 | Check if Pilosa is installed | Info if not found |
| 2 | 2226-2232 | Show what will be removed | Info output |
| 3 | 2234-2239 | Confirm | `confirm "Remove Pilosa from this system?"` (unless --yes) |
| 4 | 2241 | Remove PILOSA_HOME | `rm -rf "$PILOSA_HOME"` |
| 5 | 2242 | Remove shim | `rm -f "$bin_dir/pilosa"` |
| 6 | 2244-2249 | Completion message | Info output |

### Exit Points

| Location | Type | Condition |
|----------|------|-----------|
| 2211 | `return 0` | `--help` |
| 2213 | `die` | Unknown option |
| 2223 | `return 0` | Not installed, no stray shim |
| 2236-2238 | `return 0` | User declines |
| 2245 | Implicit return 0 | Success |

### Side Effects

- Deletes `~/.pilosa/` recursively (framework, binary, versions, config, vendor, workspace cache)
- Deletes `~/.local/bin/pilosa` shim

### User Gotchas

1. **No per-workspace cleanup**: The warning "Research workspaces are NOT affected" is shown, but there is no guidance on where workspaces are or how to remove them.
2. **Aggressive `rm -rf`**: Deletes entire PILOSA_HOME with no undo.
3. **No confirmation of what workspaces exist**: Could warn about registered workspaces before deleting.

---

## Command: `cmd_dashboard` (lines 3774-3913)

### Entry and Argument Parsing

```
cmd_dashboard()
  No arguments. This is the default when no command is given.
```

### Complete Flow

| Step | Line | Action | Prompts |
|------|------|--------|---------|
| 1 | 3775-3777 | Get framework version | None |
| 2 | 3787-3792 | Check if in workspace | Reads .pilosa/workspace |
| 3 | 3799-3848 | If not in workspace: ask scan permission, discover workspaces | `ask_scan_permission` if first time |
| 4 | 3853-3876 | Detect LLM CLIs | Spinner |
| 5 | 3880-3912 | **Main menu loop** | `prompt_choose` with 9 options |
| 6 | 3898-3909 | Dispatch selected command | Calls cmd_* functions with `\|\| true` |

### Exit Points

| Location | Type | Condition |
|----------|------|-----------|
| 3894 | `return 0` | User cancels menu selection (q/Escape) |
| 3908 | `return 0` | Unknown choice (should not happen) |

### Side Effects

- Asks scan permission (writes to ~/.pilosa/config.yaml)
- Discovers and caches workspaces (writes ~/.pilosa/workspace_cache.txt, ~/.pilosa/workspaces.txt)
- Dispatches to other commands (which have their own side effects)

### User Gotchas

1. **First-run permission prompt**: `ask_scan_permission` asks to scan ~/Projects, ~/Work, ~/Documents. If denied, no workspaces are discovered and manual entry is required.
2. **Infinite loop**: The `while true` loop at line 3881 never exits unless user presses `q`/Escape in the menu. There is no "exit" option in the menu -- the user must know to press `q`.
3. **`|| true` on all dispatched commands**: Errors from sub-commands are swallowed. The user sees the sub-command output but the dashboard loops back silently.

---

## Command: `cmd_help` (lines 2255-2293)

### Complete Flow

| Step | Action |
|------|--------|
| 1 | Print header and usage |
| 2 | If in workspace, print workspace info (name, framework, status) |
| 3 | Detect and print LLM CLIs |

### Side Effects

- None. Pure output.

---

## `install.sh` Analysis (689 lines)

### Entry Point (line 689)

```
main "$@"
```

### Flags Parsed (lines 86-122)

| Flag | Effect |
|------|--------|
| `--version X.Y.Z` | Set version |
| `--latest` | VERSION="latest" |
| `--dry-run` | Show what would happen |
| `--verify-only` | Verify installed binaries |
| `--upgrade` | Upgrade mode |
| `--reinstall` | Reinstall same version |
| `--no-gum` | Skip Gum binary installation |
| `--min-days N` | Reject fresh releases |
| `--prefix PATH` | Install root |
| `--bin-dir PATH` | Shim directory |
| `--yes/-y` | Skip prompts |

### Complete Flow (`main()`)

| Step | Line | Action | Prompts |
|------|------|--------|---------|
| 1 | 432 | `detect_platform` | None (dies on unsupported) |
| 2 | 433 | `resolve_version` | Downloads from GitHub to resolve "latest" |
| 3 | 434 | `check_release_age` | GitHub API call |
| 4 | 445-466 | Check existing installation | `prompt_upgrade` or fresh install confirm |
| 5 | 469-483 | Verify-only mode | Verify vendor binaries, exit |
| 6 | 486-493 | Dry-run mode | Show plan, exit |
| 7 | 497-499 | Create directories | `mkdir -p` |
| 8 | 502-506 | Download framework tarball | Spinner |
| 9 | 508-524 | Verify checksum | Spinner |
| 10 | 527-528 | Unpack tarball | `tar -xzf` |
| 11 | 530-538 | Install pilosa CLI | `cp` + `chmod` |
| 12 | 541-617 | Install vendor binaries (Gum, RapidOCR) | Spinner for downloads |
| 13 | 619-626 | Create shim | Writes `~/.local/bin/pilosa` |
| 14 | 632-645 | PATH check | Warns if not on PATH |
| 15 | 647-654 | Smoke test | Runs `pilosa help` |
| 16 | 656-681 | Success banner | Info output |

### `prompt_upgrade()` (lines 332-425)

Handles three cases:
- **Same version**: Asks "Reinstall?" (default: N)
- **Newer version available**: Asks "Upgrade?" (default: Y)
- **Installed is newer**: Asks "Downgrade?" (default: N)

### Exit Points

| Location | Type | Condition |
|----------|------|-----------|
| 48 | `exit 1` via `die` | Any fatal error |
| 118 | `exit 0` | `--help` |
| 132 | `exit 1` | Unsupported OS |
| 138 | `exit 1` | Unsupported architecture |
| 155 | `exit 1` | No curl/wget |
| 192 | `exit 1` | Invalid --min-days |
| 200 | `exit 1` | Release age check fails with --min-days |
| 281 | `exit 1` | Vendor binary checksum fails |
| 296-298 | `exit 1` | Cannot resolve latest version |
| 361,389,418,457 | `exit 1` | Cannot read from terminal without --yes |
| 451 | `return 0` | User declines reinstall |
| 462 | `return 0` | User declines fresh install |
| 493 | `return 0` | Dry run |
| 483 | `return 0` | Verify-only |

### Side Effects

- Creates `~/.pilosa/` directory tree
- Downloads and unpacks tarball
- Copies pilosa CLI binary
- Copies Gum binary (if not --no-gum)
- Installs RapidOCR (bundled or downloaded)
- Creates shim at `~/.local/bin/pilosa`
- Verifies vendor binary checksums

### User Gotchas

1. **`read_from_tty` failure is fatal**: If running in a non-interactive context without `--yes`, the installer dies with "Cannot read from terminal."
2. **install.sh uses `set -eu` (not pipefail)**: Missing pipes won't cause failures.
3. **RapidOCR installation**: If not bundled and download fails, it silently warns and continues. No way to force it.
4. **Shim creation overwrites**: The shim at `~/.local/bin/pilosa` is overwritten without backup.
5. **`--min-days` is security-focused**: Rejects very new releases to avoid zero-day compromised uploads. Good security practice.

---

## Cross-Cutting Issues

### 1. Error Swallowing in Main Dispatcher (CRITICAL)

**Lines 3918-3934**: Every command dispatch uses `|| true`:
```bash
new)       shift; cmd_new "$@" || true ;;
```

This means if `cmd_new` exits with code 1 (e.g., user cancels, or a `die` call), the main case statement exits with code 0. The user cannot tell from the exit code whether the command succeeded or failed.

**Impact**: CI/automation cannot detect failures. Shell scripts calling `pilosa new` will think it succeeded even when it failed.

### 2. `die()` vs `return` Inconsistency

- `die()` calls `exit 1` (line 95) -- terminates the entire script
- Some commands use `return 1` for user cancellations
- `cmd_check` uses `exit 1` (line 3012) instead of `return 1`
- `cmd_dashboard` sub-command dispatches use `|| true` which catches `return 1` but not `exit 1`

### 3. `require_workspace()` Recursive Execution (potential issue)

Line 3542: `exec "$0" "${BASH_ARGV[@]}"` -- When user selects "Find other workspaces" in the workspace selector, it re-executes the entire script. This means:
- All global state is lost
- The user is reprompted from scratch
- This could cause confusion if called from `cmd_update` or `cmd_check`

### 4. TTY Handling

The script has robust TTY handling:
- `read_from_tty()` tries stdin first, then `/dev/tty`
- Falls back to stdin if TTY unavailable
- All prompts degrade gracefully to non-interactive mode
- Arrow menus fall back to numbered menus when TTY unavailable

### 5. Gum Integration

Gum is optional and private-installed:
- `gum_available()` checks USE_GUM=1 AND -t 0 AND binary exists
- All gum_ functions return 127 if gum unavailable
- Fallback chain: gum -> arrow_select -> select_menu (numbered)
- The fallback is always available

### 6. Framework Resolution in Installed Mode

When pilosa is installed via install.sh:
- Binary lives at `~/.pilosa/bin/pilosa`
- Framework is at `~/.pilosa/versions/<version>/pilosa-framework-<version>/`
- `resolve_framework_root()` uses `ls -1 | sort -V | tail -1` to find latest version
- In dev mode, framework is detected by `.pilosa/framework-files.tsv` in parent dir

---

## Summary of User Stuck Points

| Scenario | Command | Issue |
|----------|---------|-------|
| User presses `q` in arrow menu | cmd_new, cmd_onboard | Returns 1, swallowed by `\|\| true`. Script appears to succeed silently. |
| No source files found | cmd_new, cmd_onboard | `warn "No copyable files found"` then `return 1` -- swallowed. |
| Framework not found | cmd_new | `die` -- exits script, but swallowed by `\|\| true` |
| User cancels all confirmations | cmd_update | Returns 0 with message "Update cancelled." |
| User enters invalid path | cmd_onboard | Loops forever with error messages until valid path given |
| No LLM CLI installed | cmd_new | Handoff continues; "Other" option copies generic command |
| `pilosa` not on PATH after install | install.sh | Warns and shows instructions, but smoke test may fail |
| Running in CI/non-interactive | All commands | Most prompts work via stdin fallback, but arrow menus always fall back to numbered |

---

## Recommendations

1. **Remove `|| true` from main dispatcher** or add explicit exit code forwarding
2. **Standardize `die` vs `return`**: Commands should `return 1` for recoverable user cancellations, `die` only for unrecoverable errors
3. **Add `--yes` flag to `cmd_new` and `cmd_onboard`** for automation
4. **Add `exit` option to dashboard menu** (currently requires knowing to press `q`)
5. **Fix `cmd_onboard` workspace_path bug** (positional arg is silently ignored)
6. **Consider adding `--dry-run` to `cmd_sync`** before destructive vendor file deletion
7. **Add workspace listing to `cmd_uninstall`** so users know what will be orphaned
