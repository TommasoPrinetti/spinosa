## install.sh

# ── Dead Code ────────────────────────────────────────────────────────

install.sh:300-314:detect_platform_suffix() — defined but never called anywhere in the repo; detect_platform (line 278) does the same job | impact:medium | category:dead

install.sh:458-468:_realpath() — defined but never called anywhere in the repo | impact:medium | category:dead

install.sh:472-546:safe_untar() — defined but never called in install.sh; main() extracts directly with `tar -xzf` (line 1427) bypassing all security checks | impact:high | category:dead

install.sh:733-741:reclaim_all_incomplete_versions() — defined but never called in main() or anywhere else | impact:medium | category:dead

install.sh:724-731:reclaim_incomplete_version() — only called from dead function reclaim_all_incomplete_versions (line 739); ERR trap (line 91) duplicates the logic inline instead of calling this function | impact:low | category:dead

install.sh:750-753:install_install_state_lib() — known no-op (comment says "all functionality in TypeScript"), never called | impact:low | category:dead

install.sh:1050-1097:download_and_verify() — defined but never called; main() uses raw `download` at line 1422, bypassing checksum verification and retry logic entirely | impact:high | category:dead

# ── Over-engineering ─────────────────────────────────────────────────

install.sh:183-208:spinner_start/spinner_stop — 26 lines of background-subprocess signal-management for a 12-frame Unicode spinner; each spinner_start forks a subshell that loops every 0.1s until killed, creating zombie risk on abnormal exit | impact:high | category:over

install.sh:156-175:flush_pending_input() — 20 lines of stty -icanon -echo min 0 time 1 to drain stdin before prompts; two separate read -t 0 probes and three stty calls. A single `read -t 0` drain or `exec </dev/tty` covers the same case | impact:medium | category:over

install.sh:759-829:compare_versions() — 70-line semver implementation (numeric segments, pre-release tag comparison, string-ordering fallback) that could be replaced by `sort -V` or a one-liner in the framework's TypeScript | impact:high | category:over

install.sh:472-546:safe_untar() — 74 lines computing archive root depth, symlink traversal counting, hard-link path checks, per-entry parsing of `tar -tzvf` output. `tar --no-same-owner` and a `..`/absolute-path grep would cover 95% of the same surface in 10 lines | impact:high | category:over

install.sh:278-314:detect_platform() and detect_platform_suffix() — 36 lines combined (both exist, one is dead) when case statements dwarf trivial uname parsing; the logic occupies ~30 lines for what 4 lines accomplish | impact:low | category:over

install.sh:1182-1259:setup_shell_path() — 77-line function that iterates candidate files, checks existing blocks, creates configs, and conditionally double-writes .zprofile. Adds ~5% to install.sh footprint for a PATH line append | impact:medium | category:over

install.sh:1265-1302:print_path_instructions + shell_reload_hint — 38 lines of branching logic (piped stdin, file exists, config file set) to print a `source` command | impact:low | category:over

install.sh:1125-1134:write_spinosa_env_file() — 10 lines to write a 3-line env.sh; the entire file is a heredoc with 3 export lines inside a function that first set a global variable | impact:low | category:over

install.sh:1362:maybe_launch_dashboard sleep 1 — unconditional 1-second sleep before launching dashboard | impact:low | category:over

install.sh:1414-1418:cleanup() defined as local function inside main(), then trapped — shadow-defining a function inside a function to avoid a standalone cleanup | impact:low | category:over

install.sh:869-902:check_release_age() — 33 lines for a feature (--min-days) with no documented user; two date-parsing fallbacks (GNU date vs BSD date) and a GitHub API call | impact:low | category:over

# ── Silent Breaks ───────────────────────────────────────────────────

install.sh:62:mkdir -p "$(dirname "$log_file")" 2>/dev/null || return 0 — log directory creation silenced; if mkdir fails the log silently stops writing | impact:medium | category:break

install.sh:81:printf ... >> "$log_file" 2>/dev/null || true — ALL log writes append with `|| true`, swallowing disk-full or permission errors silently | impact:high | category:break

install.sh:86:spinner_stop 2>/dev/null || true — spinner_stop errors silenced inside the ERR trap, obscuring signal-handler failures | impact:medium | category:break

install.sh:87:spinosa_log ERROR "aborted line=${line}..." — ERR trap logs to file, but the error message on stderr (line 95-97) tells the user to "See spinosa.log" — the same log file that just had its writes silenced with `|| true`; a disk-full install failure produces no log evidence but claims the log has details | impact:high | category:break

install.sh:91:rm -rf ... 2>/dev/null || true — incomplete version cleanup silently fails, leaving a half-installed version | impact:medium | category:break

install.sh:136-142:info/ok/warn/note/fail/die all call spinosa_log which is silenced with || true — every UI helper has a silent failure path | impact:medium | category:break

install.sh:449:mkdir -p "$check_path" 2>/dev/null || true — disk-space check path creation silenced | impact:low | category:break

install.sh:593:mv ... 2>/dev/null || cp ... 2>/dev/null || true — metadata migration failures swallowed | impact:low | category:break

install.sh:645-657:config_set_key() runs sed with unquoted substitution; a version string containing `/` breaks the config file silently | impact:medium | category:break

install.sh:752:install_install_state_lib return 0 — no-op with no warning, dead code hiding a missing install step | impact:low | category:break

install.sh:1422:download "$url" "$dest" && spinner_stop || { spinner_stop; die ... } — spinner_stop called twice (once after success, once in error block) in a single expression; the second spinner_stop is a no-op but the pattern is fragile | impact:low | category:break

# ── Duplication ──────────────────────────────────────────────────────

install.sh:278-298 vs 300-314:detect_platform() and detect_platform_suffix() — identical uname-s/uname-m case logic duplicated; detect_platform writes globals (OS/ARCH/PLATFORM), detect_platform_suffix echoes the same mapping | impact:medium | category:dup

install.sh:627-634:channel_install_url() — stable (line 630) and beta|dev (line 631) cases return the exact same URL (raw.githubusercontent.com/.../main/install.sh); the channel argument has no effect on the URL | impact:low | category:dup

install.sh:599-618 vs 620-625:installer_release_channel() and installer_beta_toggle() — installer_beta_toggle just wraps installer_release_channel to convert "stable"→"false" and anything else→"true"; could be inlined | impact:low | category:dup

install.sh:88-93 vs 724-731:_spinosa_install_err_trap duplicates reclaim_incomplete_version() logic inline (rm -rf of incomplete version) instead of calling the function | impact:low | category:dup

install.sh:1433:mv "$top_dir"/* "${SPINOSA_HOME}/versions/${VERSION}/" — GitHub tarball extraction bypasses safe_untar entirely; the 74-line security layer is unused while main() does a raw tar -xzf + mv | impact:high | category:dup

# ── Stdlib Reimplementations ─────────────────────────────────────────

install.sh:458-468:_realpath() — reimplements `readlink -f` (POSIX) or `realpath` (coreutils); 11 lines in shell when the binary exists on every supported platform | impact:medium | category:stdlib

install.sh:431-437:available_disk_bytes() — parses `df -Pk` output with awk to get available bytes; `stat -f %a` or a one-liner achieves the same | impact:low | category:stdlib

install.sh:439-443:disk_mb_rounded_down() — trivial `$((bytes / 1048576))` wrapped in a function with validation; 5 lines for an arithmetic expansion | impact:low | category:stdlib

install.sh:548-556:sha256_file() — selects between sha256sum and shasum; reasonable compatibility wrapper but could be `command -v` && pipe directly | impact:low | category:stdlib

install.sh:759-829:compare_versions() — 70-line semver comparator when `sort -V` (coreutils) handles version comparison in one command, and the TypeScript runtime has npm semver | impact:medium | category:stdlib

# ── Dead Args / Flags ────────────────────────────────────────────────

install.sh:229:--no-gum alias for --no-bundled-tools — defined as a flag alias but never referenced in --help output, documentation, or channel configs outside the case branch. Dead flag name | impact:low | category:dead

install.sh:1112:SPINOSA_METADATA_DIR and PREFIX_MODE=1 interaction — --prefix sets PREFIX_MODE but the lockdir path and many operations still use SPINOSA_HOME/versions/; --prefix leaves global shims uninstalled but the shim still hardcodes SPINOSA_HOME | impact:low | category:dead
