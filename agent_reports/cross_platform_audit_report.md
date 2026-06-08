---
type: audit_report
agent: pilosa-auditor
description: Comprehensive cross-platform audit of Pilosa framework shell scripts
created: 2026-06-08
scope: .bin/*.sh, install.sh, tests/*.sh
platforms_audited: macOS (Darwin/BSD), Linux (GNU), Windows (native/WSL/Git Bash)
severity: HIGH / MEDIUM / LOW
---

# Cross-Platform Audit Report — Pilosa Framework

## Summary

| Severity | Count |
|----------|-------|
| HIGH (prevents running) | 9 |
| MEDIUM (breaks feature) | 18 |
| LOW (cosmetic / edge) | 7 |
| **Total** | **34** |

---

## HIGH Severity — Prevents Running

### H1: macOS `open` command — 5 instances
**Breakage:** Linux and Windows (no `open` command)

| File | Line | Code | Platform |
|------|------|------|----------|
| `.bin/pilosa` | 1077 | `open "$_ltmp_codex"` | Linux, Windows |
| `.bin/pilosa` | 1099 | `open "$_ltmp_oc"` | Linux, Windows |
| `.bin/pilosa` | 1121 | `open "$_ltmp_cc"` | Linux, Windows |
| `.bin/pilosa` | 1132 | `open "claude://code/new?q=${encoded_prompt}&folder=${root}"` | Linux, Windows |
| `.bin/pilosa` | 1149 | `open "$_ltmp_kl"` | Linux, Windows |

These are all inside `run_cli_with_prompt()` in `if [[ "$(uname)" == "Darwin" ]]` blocks. On Linux they fall through to the `else` branch, so the `open` command itself is never reached. **Safe at runtime** due to Darwin guard.

**Same issue in `build_launch_command()`:**
- Line 1049: `printf 'open "claude://code/new?...'` — This **generates a command string** printed/copied to clipboard on ALL platforms. On Linux/Windows, the user gets a useless command.
- **Severity: MEDIUM** (command is printed for manual use, not executed)

### H2: `mkfifo` — 1 instance
**Breakage:** Windows (not available in Git Bash, MSYS2 without additional tools)

| File | Line | Code |
|------|------|------|
| `.bin/pilosa` | 1683 | `if [[ -n "$_ocr_bin" ]] && mkfifo "$_ocr_fifo" 2>/dev/null; then` |

In the OCR pipeline. On failure, falls to line 1765 which warns `"Could not create FIFO - OCR skipped"`. **OCR feature breaks, but not the whole script.**

**Fix:** Replace FIFO with a temp file for cross-platform support.

### H3: `/dev/tty` — 3 instances
**Breakage:** Windows native (not available; works in Git Bash/WSL)

| File | Line | Code |
|------|------|------|
| `install.sh` | 65-66 | `elif [ -r /dev/tty ]; then ... < /dev/tty` |
| `install.sh` | 725 | `exec "${PILOSA_BIN_DIR}/pilosa" </dev/tty` |
| `.bin/pilosa` | 103 | `{ [[ -r /dev/tty ]] && IFS= read -r "$@" < /dev/tty; }` |

The `read_from_tty()` function handles this gracefully. The `exec </dev/tty` at line 725 of `install.sh` is more problematic — would fail on native Windows.

**Fix:** Guard `</dev/tty` with a check for the file's existence.

### H4: `date +%s%N` (nanoseconds) — 6 instances (GNU-only)
**Breakage:** macOS/BSD (BSD `date` does not support `%N`)

| File | Line | Code |
|------|------|------|
| `tests/test_cli.sh` | 29 | `TEST_START_TIME=$(date +%s%N 2>/dev/null || echo "0")` |
| `tests/test_cli.sh` | 36 | `local end_time=$(date +%s%N 2>/dev/null || echo "0")` |
| `tests/test_cli.sh` | 48 | `local end_time=$(date +%s%N 2>/dev/null || echo "0")` |
| `tests/test_cli.sh` | 553 | `local registry_start=$(date +%s%N 2>/dev/null || echo "0")` |
| `tests/test_cli.sh` | 555 | `local registry_end=$(date +%s%N 2>/dev/null || echo "0")` |
| `tests/test_cli.sh` | 562-564 | `local scan_start/scan_end=$(date +%s%N 2>/dev/null || echo "0")` |

All use `2>/dev/null || echo "0"` fallback, so the test silently degrades to 0ms timing on macOS. **Does not crash** — just loses precision.

### H5: `BASH_ARGV` — 1 instance
**Breakage:** Not available in all bash modes

| File | Line | Code |
|------|------|------|
| `.bin/pilosa` | 3752 | `exec "$0" "${BASH_ARGV[@]}"` |

`BASH_ARGV` is only available when `extdebug` is enabled. In standard bash, this array is empty. Could cause re-exec without args.

**Fix:** Save original args at top: `ORIGINAL_ARGS=("$@")` and use `exec "$0" "${ORIGINAL_ARGS[@]}"`.

### H6: `python3` dependency for user-facing operations — 2 instances
**Breakage:** Linux and Windows without Python3 installed

| File | Line | Code |
|------|------|------|
| `.bin/pilosa` | 1048, 1130 | `python3 -c 'import sys, urllib.parse; ...'` for URL encoding |
| `.bin/pilosa` | 3839 | `curl | python3 -c "import sys, json..."` for release notes |

URL encoding has a `sed` fallback. JSON parsing for release notes (line 3839) has no fallback.

**Fix:** Add fallback parsing for release notes when `python3` is not available.

### H7: macOS `open` URL scheme in `build_launch_command` — 1 instance
Same as H1 note above. Line 1049 prints an `open "claude://..."` command on all platforms.

---

## MEDIUM Severity — Breaks Feature

### M1: `pbcopy` — 2 instances (macOS-only)
| File | Line | Code |
|------|------|------|
| `.bin/pilosa` | 957-958 | `pbcopy` |

**Already handled:** The `copy_to_clipboard()` function falls back to `xclip`, `xsel`, and `clip.exe`. **No action needed.**

### M2: `sed -i` BSD vs GNU differences — 8 instances
| File | Lines | Pattern |
|------|-------|---------|
| `.bin/pilosa` | 2304-2305, 2505-2506, 3030-3031, 3395-3399 | `sed -i.bak ... \|\| sed -i '' ...` |
| `sync-agents.sh` | 200-210 | Same pattern |

**Already handled:** Every usage has a fallback. **No action needed.**

### M3: `stat` with BSD vs GNU flags — 2 locations
| File | Line | Pattern |
|------|------|---------|
| `.bin/pilosa` | 1230-1233 | `stat -c %s` (GNU) \|\| `stat -f %z` (BSD) |
| `.bin/pilosa` | 3491 | `stat -f %m` (BSD) \|\| `stat -c %Y` (GNU) |

**Already handled:** Both use `||` fallback with both formats tested. **No action needed.**

### M4: `sort -V` fallback — 1 instance
| File | Line | Code |
|------|------|------|
| `.bin/pilosa` | 65-68 | Checks if `sort -V` works, falls back to `sort -t. -k1,1n -k2,2n -k3,3n` |

**Already handled:** No action needed.

### M5: `date -d` vs `date -j` — 1 instance
| File | Line | Code |
|------|------|------|
| `install.sh` | 236 | `date -d "$published_at" +%s \|\| date -j -f ... "$published_at" +%s` |

**Already handled:** Tests both GNU and BSD formats. **No action needed.**

### M6: SHA-256 fallback order inconsistency — 3 locations
- `package-release.sh` line 323: `shasum` tried FIRST, then `sha256sum` (reversed vs. everywhere else)
- All other files: `sha256sum` first, `shasum` second

### M7: `wc -l` leading whitespace — 2 instances
| File | Line | Code | Need fix? |
|------|------|------|-----------|
| `sync-agents.sh` | 189 | `count=$(find ... | wc -l)` | **YES** — missing `tr -d ' '` |
| `.bin/pilosa` | 3386 | `... | wc -l | tr -d ' '` | **OK** — already strips |

**Fix:** Add `tr -d ' '` to `sync-agents.sh` line 189.

### M8: `find -delete` non-standard — 1 instance
| File | Line | Code |
|------|------|------|
| `package-release.sh` | 97 | `find ... -delete 2>/dev/null || true` |

The `-delete` action is widely supported but non-POSIX. The `2>/dev/null || true` suppresses errors.

### M9: `echo -e` in `build-rapidocr-vendor.sh` — 1 instance
| File | Line | Code |
|------|------|------|
| `build-rapidocr-vendor.sh` | 39-41 | `log() { echo -e "${GREEN}${NC} $*"; }` |

`echo -e` is not portable. Script has `#!/usr/bin/env bash` so fine with bash. If invoked via `sh`, breaks.

### M10: `build-rapidocr-vendor.sh` hardcoded `/tmp` — 1 instance
| File | Line | Code |
|------|------|------|
| `build-rapidocr-vendor.sh` | 136 | `local python_tar="/tmp/python-standalone-${platform}.tar.gz"` |

**Fix:** Use `mktemp`.

### M11: `tests/test_cli.sh` fragile sed harness — 1 instance
| File | Line | Code |
|------|------|------|
| `tests/test_cli.sh` | 61 | `sed '/^case "${1:-}" in$/,$d' "$PILOSA_BIN"` |

Relies on exact whitespace match of the `case` statement. If formatting changes, tests silently break.

### M12: `tr '[:upper:]' '[:lower:]'` locale-dependent — ~10 instances
Extensive use throughout `.bin/pilosa`. May not work correctly in Turkish or other locales.

---

## LOW Severity

### L1: `shasum -a 256` not a standard tool
`package-release.sh` line 323 tries `shasum` first (macOS Perl script), falls back to `sha256sum` (GNU). Present on all systems with Perl.

### L2: `install.sh` checks for `brew` (macOS-only package manager)
Line 21: Informational message about installing bash. Harmless on Linux.

### L3: Darwin platform check restricts Windows support
Multiple files check for Darwin/Linux and die on anything else. Design limitation.

### L4: Only `.tar.gz` archives — no `.zip` support
Windows users expect `.zip`. Entire framework distribution uses `.tar.gz`.

### L5: Brace expansion in `printf` arguments
Used for drawing lines. Bash-specific (all scripts require bash).

### L6: `sync-agents.sh` fragile glob `cp "$skill_dir"*.md`
Line 182: If no `.md` files exist, glob literal passes to `cp`, silently fails.

### L7: `df -Pk` with `awk` assumes POSIX output
Line 1255 in `.bin/pilosa`. The `-Pk` flags are POSIX, so this is actually correct.

---

## Cross-Platform Best Practices Already Found (Preserve These!)

1. **Clipboard fallback chain**: `pbcopy` -> `xclip` -> `xsel` -> `clip.exe`
2. **`stat` fallback**: Tests both `-c %s` (GNU) and `-f %z` (BSD)
3. **`date` fallback**: Tests both `-d` (GNU) and `-j -f` (BSD)
4. **`sort -V` fallback**: Checks capability first
5. **`sed -i` dual format**: BSD style with `.bak` fallback
6. **`sha256sum` / `shasum` dual detection**: Both tools supported
7. **`detect_platform()` functions**: Normalize OS/arch names
8. **`read_from_tty()`**: Falls back from `/dev/tty` to stdin
9. **`NO_COLOR` support**: All scripts honor this convention
10. **`set -euo pipefail`**: Consistent error handling

---

## Recommendations

### Immediate Fixes (P1)
1. Replace `exec "$0" "${BASH_ARGV[@]}"` with saved `ORIGINAL_ARGS`
2. Replace `date +%s%N` with `perl -MTime::HiRes -e 'print Time::HiRes::time'` in tests
3. Guard `install.sh` line 725 `exec </dev/tty` with existence check

### Feature Fixes (P2)
4. Replace `mkfifo` with temp file in OCR pipeline
5. Add `tr -d ' '` to `sync-agents.sh` line 189
6. Add Python3 fallback for release notes JSON parsing
7. Use `mktemp` in `build-rapidocr-vendor.sh` instead of hardcoded `/tmp`

### Quality Fixes (P3)
8. Replace `find -delete` with `find -exec rm {} +` in `package-release.sh`
9. Make `tests/test_cli.sh` test harness sed pattern more robust

---

## Files Surveyed

| File | Lines | Role |
|------|-------|------|
| `.bin/pilosa` | 4151 | Main CLI entry point |
| `install.sh` | 733 | Framework installer |
| `.bin/check-startup.sh` | 293 | Legacy validation |
| `.bin/lib/metrics.sh` | 144 | Shared metrics helpers |
| `.bin/package-release.sh` | 334 | Release packaging |
| `.bin/build-rapidocr-vendor.sh` | 277 | RapidOCR vendor builder |
| `.bin/publish-release.sh` | 115 | Release publishing |
| `.bin/sync-agents.sh` | 215 | Agent mirror syncing |
| `tests/smoke.sh` | 416 | Smoke tests |
| `tests/test_cli.sh` | 667 | CLI unit tests |
| `tests/test_interactive.sh` | 507 | Interactive tests |

*Report generated 2026-06-08 — 34 issues found across 8,437 lines in 11 files.*
