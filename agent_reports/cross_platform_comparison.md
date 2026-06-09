---
type: report
agent: pilosa-searcher
created: 2026-06-09
scope: cross-platform (macOS vs Linux)
description:
  - Structured inventory of all platform-branching logic in the Pilosa framework
verified: true
connects_to:
  - .bin/pilosa
  - install.sh
  - .bin/package-release.sh
  - .bin/build-pilosa-vendor.sh
  - .bin/build-rapidocr-vendor.sh
  - .bin/sync-agents.sh
  - .bin/check-startup.sh
---

# Cross-Platform Comparison: macOS vs Linux

## 1. Platform Detection Patterns

### 1.1 `uname -s` / `uname -m` invocations

| # | File | Lines | Pattern | macOS returns | Linux returns |
|---|------|-------|---------|---------------|---------------|
| P1 | `install.sh` | 172-173 | `uname -s` / `uname -m` | `Darwin` / `arm64` or `x86_64` | `Linux` / `aarch64` or `x86_64` |
| P2 | `install.sh` | 298-308 | `uname -s` / `uname -m` (in `verify_vendor_binaries`) | Same | Same |
| P3 | `install.sh` | 609-619 | `uname -s` / `uname -m` (vendor install) | Same | Same |
| P4 | `install.sh` | 725 | `uname -s` == `Linux` (libGL check) | Not entered | Runs `ldconfig` check |
| P5 | `.bin/pilosa` | 1080 | `uname` == `Darwin` (terminal launch) | Enters macOS branch | Enters Linux branch |
| P6 | `.bin/pilosa` | 1150 | `uname` == `Darwin` (Claude Desktop) | Enters macOS branch | Enters Linux/else branch |
| P7 | `.bin/pilosa` | 2458 | `uname -s` (PLATFORM variable) | `darwin-arm64` etc. | `linux-arm64` etc. |
| P8 | `.bin/build-pilosa-vendor.sh` | 44-56 | `uname -s` / `uname -m` | `darwin-arm64` etc. | `linux-arm64` etc. |
| P9 | `.bin/build-rapidocr-vendor.sh` | 45-61 | `uname -s` / `uname -m` | Same | Same |

### 1.2 Architecture normalization

| # | Architecture | Normalized To |
|---|--------------|---------------|
| A1 | `arm64`, `aarch64` | `arm64` |
| A2 | `x86_64`, `amd64` | `amd64` |
| A3 | `i386`, `i686` | `i386` (Linux only) |

**Impact:** Architecture normalization is consistent across all scripts. macOS only produces `arm64` or `amd64`; Linux adds `i386` support.

---

## 2. Platform-Branching Logic (Detailed)

### 2.1 [.bin/pilosa] `_launch_in_terminal()` -- Lines 1078-1094

```
if [[ "$(uname)" == "Darwin" ]]; then
    # macOS: rename .sh to .command, chmod +x, open
    local mac_script="${script%.sh}.command"
    mv "$script" "$mac_script"
    chmod +x "$mac_script"
    open "$mac_script"
elif command -v x-terminal-emulator >/dev/null 2>&1; then
    x-terminal-emulator -e bash "$script" &
elif command -v gnome-terminal >/dev/null 2>&1; then
    gnome-terminal -- bash "$script" &
elif command -v xterm >/dev/null 2>&1; then
    xterm -hold -e bash "$script" &
else
    exec bash "$script"
fi
```

**Difference:** On macOS uses `open` on a `.command` file (Finder handles it). On Linux tries `x-terminal-emulator`, `gnome-terminal`, `xterm` in fallback order.

**End-user effect:** Affects how CLI handoff (`run now`) opens a new terminal window.

**Tested:** Tests exist only for the macOS path via `open`; no test harness for Linux terminal emulators.

### 2.2 [.bin/pilosa] `run_cli_with_prompt()` -- Lines 1147-1156

```
claude_code_desktop)
    if [[ "$(uname)" == "Darwin" ]]; then
        open "claude://code/new?q=${encoded_prompt}&folder=${root}"
    else
        copy_to_clipboard "$prompt"
    fi
```

**Difference:** macOS can deep-link to the Claude Desktop app via `claude://` URL scheme. Linux falls back to clipboard copy.

**End-user effect:** macOS users get a seamless Claude Desktop launch; Linux users must manually paste.

### 2.3 [.bin/pilosa] `file_size_bytes()` -- Lines 1287-1293

```
if stat -c %s "$path" >/dev/null 2>&1; then
    stat -c %s "$path"           # Linux format
elif stat -f %z "$path" >/dev/null 2>&1; then
    stat -f %z "$path"           # macOS/BSD format
```

**Difference:** `stat -c %s` is Linux/GNU, `stat -f %z` is macOS/BSD. The code tries Linux first, falls back to macOS.

**End-user effect:** Safe -- both paths are covered. But the preference is Linux-first (inefficient on macOS since it tries and fails the Linux check first).

### 2.4 [.bin/pilosa] `cache_is_fresh()` -- Line 3886

```
cache_time="$(stat -f %m "$PILOSA_CACHE" 2>/dev/null || stat -c %Y "$PILOSA_CACHE" 2>/dev/null || echo 0)"
```

**Difference:** macOS uses `stat -f %m`, Linux uses `stat -c %Y`. This function tries macOS first (opposite of `file_size_bytes`).

**End-user effect:** Safe -- both paths are covered.

### 2.5 [.bin/pilosa] `sed -i` in-place editing -- Lines 2669-2670, 2878-2879, 3407-3408, 3790-3794

```
sed -i.bak 's/.../.../' file 2>/dev/null || \     # macOS (requires extension arg)
sed -i '' 's/.../.../' file 2>/dev/null || true    # Linux (no arg or empty string)
```

**Difference:** macOS `sed` requires an argument after `-i` (even if empty string `''`). Linux GNU `sed` allows `-i` without argument. All instances have a fallback chain: `sed -i.bak` (works on macOS, creates .bak) then `sed -i ''` (works on Linux).

**End-user effect:** Safe -- both paths covered. Creates `.bak` files that are cleaned up.

### 2.6 [.bin/pilosa] `sort -V` version sort -- Lines 76-81

```
if sort -V /dev/null 2>/dev/null; then
    portable_sort_args=(sort -V)           # GNU sort (Linux)
else
    portable_sort_args=(sort -t. -k1,1n -k2,2n -k3,3n)  # BSD sort (macOS)
fi
```

**Difference:** `sort -V` (version-sort) is GNU-specific; macOS `sort` lacks `-V`. The code probes for `-V` support first, falls back to field-based sort.

**End-user effect:** Safe -- both paths covered.

### 2.7 [.bin/pilosa] `expand_home()` -- Lines 831-837

```
if [[ "$path" == "~"* ]]; then
    path="${path/#\~/$HOME}"
fi
```

**Difference:** Not a platform branch per se, but `~` expansion is shell-dependent. This function manually handles it.

**End-user effect:** Safe -- ensures `~` works regardless of shell.

### 2.8 [install.sh] `detect_platform()` -- Lines 171-189

```
case "$os" in
    Darwin)  OS="darwin" ;;
    Linux)   OS="linux" ;;
    *)       die "Unsupported OS: $os (Pilosa supports macOS and Linux)" ;;
esac
```

**Difference:** Fatal error on any OS other than macOS/Linux.

**End-user effect:** Framework refuses to install on Windows (including WSL without proper detection), FreeBSD, etc.

### 2.9 [install.sh] `date -d` vs `date -j` -- Line 268

```
release_ts="$(date -d "$published_at" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%SZ" "$published_at" +%s 2>/dev/null)"
```

**Difference:** `date -d` is GNU/Linux; `date -j -f` is BSD/macOS. Tries Linux first, falls back to macOS.

**End-user effect:** Safe -- both paths covered. Inefficient on macOS (fails Linux check first).

### 2.10 [install.sh] libGL check on Linux -- Lines 724-730

```
if [[ "$(uname -s)" == "Linux" ]] && ! ldconfig -p 2>/dev/null | grep -q "libGL.so"; then
    fail "libGL.so.1 not found -- RapidOCR/OpenCV needs this on Linux"
    note "Install: sudo apt-get install libgl1  (Debian/Ubuntu)"
    note "        sudo dnf install mesa-libGL  (Fedora)"
    note "        sudo pacman -S mesa           (Arch)"
fi
```

**Difference:** Linux-only check. macOS does not need this check since OpenCV can use Metal/Vision frameworks.

**End-user effect:** Linux users get explicit guidance if libGL is missing. macOS users skip this check entirely.

### 2.11 [install.sh] Vendor binary install -- Lines 604-634

```
case "$(uname -s)" in
    Darwin) os="darwin" ;;
    Linux)  os="linux" ;;
esac
case "$(uname -m)" in
    arm64|aarch64) arch="arm64" ;;
    x86_64|amd64)  arch="amd64" ;;
    i386|i686)     arch="i386" ;;   # Linux only
esac
suffix="${os}-${arch}"
```

**Difference:** Linux supports `i386` architecture; macOS does not. The `i386` arm only exists in the Linux universe.

**End-user effect:** Linux 32-bit users get the right binary; macOS 32-bit is not supported (Intel Macs are always x86_64).

### 2.12 [install.sh] Shell config path -- Lines 780-785

```
case "$current_shell" in
    fish) candidates=("$HOME/.config/fish/config.fish") ;;
    zsh)  candidates=("${ZDOTDIR:-$HOME}/.zshrc" "${ZDOTDIR:-$HOME}/.zshenv") ;;
    bash) candidates=("$HOME/.bashrc" "$HOME/.bash_profile" "$HOME/.profile") ;;
    *)    candidates=("$HOME/.profile") ;;
esac
```

**Difference:** Default shell config files are platform-agnostic. But macOS defaults to `zsh` since Catalina, Linux often defaults to `bash`.

**End-user effect:** On macOS, `~/.zshrc` is the most common target; on Linux, `~/.bashrc` or `~/.profile`.

### 2.13 [.bin/package-release.sh] Platform-specific tar -- Line 300

```
COPYFILE_DISABLE=1 tar -czf ... 2>/dev/null
```

**Difference:** `COPYFILE_DISABLE=1` is macOS-specific (prevents Apple Double files `._*` from being included). On Linux this env var is a no-op.

**End-user effect:** On macOS, ensures `.tar.gz` archives do not contain Apple metadata. No effect on Linux.

### 2.14 [.bin/package-release.sh] Checksum generation -- Line 310

```
(cd "$DIST" && shasum -a 256 * > checksums.txt 2>/dev/null || sha256sum * > checksums.txt)
```

**Difference:** `shasum` is the tool name on macOS; `sha256sum` on Linux. Tries macOS first, falls back to Linux.

**End-user effect:** Safe -- both paths covered.

### 2.15 [.bin/package-release.sh] gum download URLs -- Lines 238-256

```
gum_${GUM_VERSION}_Darwin_arm64.tar.gz   -> darwin-arm64
gum_${GUM_VERSION}_Darwin_x86_64.tar.gz  -> darwin-amd64
gum_${GUM_VERSION}_Linux_arm64.tar.gz    -> linux-arm64
gum_${GUM_VERSION}_Linux_x86_64.tar.gz   -> linux-amd64
gum_${GUM_VERSION}_Linux_i386.tar.gz     -> linux-i386
```

**Difference:** 4 platform variants (darwin-arm64, darwin-amd64, linux-arm64, linux-amd64) plus Linux-only i386.

**End-user effect:** Platform-specific Gum binaries provided.

### 2.16 [.bin/build-pilosa-vendor.sh] Python standalone URLs -- Lines 59-70

```
darwin-arm64 -> os="apple-darwin", arch="aarch64"
darwin-amd64 -> os="apple-darwin", arch="x86_64"
linux-amd64  -> os="unknown-linux-gnu", arch="x86_64"
linux-arm64  -> os="unknown-linux-gnu", arch="aarch64"
```

**Difference:** Different Python standalone build triples for macOS vs Linux.

**End-user effect:** The correct Python binary is bundled for each platform.

### 2.17 [.bin/build-pilosa-vendor.sh] Python binary path -- Lines 72-81

```
for bin in "${python_dir}/bin/python3" "${python_dir}/Python.framework/Versions/Current/bin/python3"; do
```

**Difference:** `Python.framework/Versions/Current/bin/python3` is macOS-specific (`.framework` bundle structure). Linux uses `bin/python3`.

**End-user effect:** Both layouts are probed; whichever exists is used. Safe.

### 2.18 [.bin/build-pilosa-vendor.sh] CLI wrapper scripts -- Lines 118-150

Both `rapidocr-cli` and `markitdown-cli` wrappers probe:
```
PYTHON_BIN="${SCRIPT_DIR}/python/bin/python3"
if [[ ! -x "${PYTHON_BIN}" ]]; then
    PYTHON_BIN="${SCRIPT_DIR}/Python.framework/Versions/Current/bin/python3"
fi
```

**Difference:** Same macOS-vs-Linux Python layout fallback.

**End-user effect:** Safe -- both paths probed.

### 2.19 [.bin/build-rapidocr-vendor.sh] Cross-platform detection -- Lines 63-71

```
can_execute() {
    local platform="$1"
    local host_platform
    host_platform="$(detect_platform)"
    [[ "$platform" == "$host_platform" ]]
}
```

**Difference:** If building for a different platform than the host (e.g., building `linux-amd64` on macOS), pip install and model downloads are skipped.

**End-user effect:** Cross-compiled vendor bundles do not have pre-installed models; they install on first use.

### 2.20 [.bin/sync-agents.sh] `sed -i` -- Lines 199, 203

```
sed -i.bak \
    ... \
    "$repo_root/CLAUDE.md" 2>/dev/null || \
sed -i '' \
    ... \
    "$repo_root/CLAUDE.md" 2>/dev/null || true
```

**Difference:** Same macOS/Linux `sed -i` fallback pattern as `.bin/pilosa`.

**End-user effect:** Safe -- both paths covered.

---

## 3. Terminal Escape Sequences (`\033[`)

### 3.1 ANSI standard assessment

All escape sequences used are standard ANSI SGR (Select Graphic Rendition) codes:

| Code | Meaning | Standard |
|------|---------|----------|
| `\033[0m` | Reset all attributes | ANSI X3.64 |
| `\033[1m` | Bold / Increased intensity | ANSI X3.64 |
| `\033[2m` | Dim / Decreased intensity | ANSI X3.64 |
| `\033[4m` | Underline | ANSI X3.64 |
| `\033[24m` | Underline off | ANSI X3.64 |
| `\033[31m` | Red foreground | ANSI X3.64 |
| `\033[32m` | Green foreground | ANSI X3.64 |
| `\033[33m` | Yellow foreground | ANSI X3.64 |
| `\033[34m` | Blue foreground | ANSI X3.64 |
| `\033[35m` | Magenta foreground | ANSI X3.64 |
| `\033[36m` | Cyan foreground | ANSI X3.64 |
| `\033[2K` | Erase entire line | ANSI X3.64 |
| `\033[?25h` | Show cursor | DEC private mode (widely supported) |
| `\033[?25l` | Hide cursor | DEC private mode (widely supported) |
| `\033[<n>F` | Cursor up N lines | ANSI X3.64 |

**Verdict:** All sequences are ANSI X3.64 / ECMA-48 standard. They work identically on macOS Terminal, iTerm2, Linux console, GNOME Terminal, Konsole, etc.

### 3.2 Files using escape sequences

| File | Lines | Purpose |
|------|-------|---------|
| `.bin/pilosa` | 26-27, 457, 459, 515, 517, 524, 526-527, 554, 574, 636, 720, 722, 726, 728, 738-739, 752, 767, 787, 793, 1614, 1625, 1638 | Colors, spinners, progress bars, cursor positioning |
| `install.sh` | 50-51, 59, 81, 94, 110, 126 | Colors, spinners, progress bars |
| `.bin/build-pilosa-vendor.sh` | 33-36 | Colors (bash CLI wrappers) |
| `.bin/build-rapidocr-vendor.sh` | 33-36 | Colors |
| `.bin/check-startup.sh` | 8 | Colors |
| `tests/test_cli.sh` | 21 | Colors |
| `tests/test_interactive.sh` | 15 | Colors |

---

## 4. Clipboard Support

### 4.1 `copy_to_clipboard()` -- `.bin/pilosa` lines 968-981

```
copy_to_clipboard() {
  local text="$1"
  if command -v pbcopy >/dev/null 2>&1; then
    printf '%s' "$text" | pbcopy          # macOS
  elif command -v xclip >/dev/null 2>&1; then
    printf '%s' "$text" | xclip -selection clipboard  # Linux (x11)
  elif command -v xsel >/dev/null 2>&1; then
    printf '%s' "$text" | xsel --clipboard --input    # Linux (x11)
  elif command -v clip.exe >/dev/null 2>&1; then
    printf '%s' "$text" | clip.exe         # WSL
  else
    return 1
  fi
```

**Priority order:** `pbcopy` (macOS) -> `xclip` (Linux/X11) -> `xsel` (Linux/X11) -> `clip.exe` (WSL).

**End-user effect:** Clipboard will work on all platforms if the corresponding CLI tool is present. Fallback order is reasonable.

**Testing status:** No automated tests for clipboard functions (requires graphics environment).

---

## 5. File Path Patterns

### 5.1 `/tmp` usage

| File | Line | Usage | Platform-safe? |
|------|------|-------|----------------|
| `install.sh` | 10 | `mktemp /tmp/pilosa-install.XXXXXX` | Yes -- `mktemp` is cross-platform |
| `.bin/pilosa` | 1102, 1104, 1120, 1122, 1138, 1140, 1161, 1163 | `mktemp /tmp/pilosa-prompt.XXXXXX` etc. | Yes |
| `.bin/pilosa` | 3135 | `mktemp -d` (update) | Yes |
| `.bin/build-pilosa-vendor.sh` | 96 | `/tmp/python-standalone-${platform}.tar.gz` | Yes |
| `.bin/build-rapidocr-vendor.sh` | 135 | Same pattern | Yes |
| `.bin/package-release.sh` | 26, 185 | `mktemp -d` | Yes |

**Verdict:** All `/tmp` usage goes through `mktemp`, which is cross-platform safe.

### 5.2 `$HOME` / `~` usage

| Use | Locations | Platform-safe? |
|-----|-----------|----------------|
| `$HOME/.pilosa` (install root) | `install.sh:43`, `.bin/pilosa:34` | Yes |
| `$HOME/.local/bin` (shim dir) | `install.sh:44` | Yes -- XDG convention |
| `$HOME/.config/fish/config.fish` | `install.sh:781` | Yes |
| `$HOME/.zshrc`, `.bashrc`, `.bash_profile` | `install.sh:782-783` | Yes |
| `$HOME/Projects`, `$HOME/Work`, `$HOME/Documents` | `.bin/pilosa:3815` (default scan roots) | Yes |

**Verdict:** All paths are platform-agnostic.

---

## 6. Package Manager Detection

### 6.1 `install.sh` -- Bash dependency hint (Lines 17-24)

```
if command -v apk >/dev/null 2>&1; then
    echo "    apk add bash"
elif command -v apt-get >/dev/null 2>&1; then
    echo "    sudo apt-get install bash"
elif command -v brew >/dev/null 2>&1; then
    echo "    brew install bash"
else
    echo "    Install bash through your system package manager."
fi
```

| Manager | Platform | How detected |
|---------|----------|--------------|
| `apk` | Alpine Linux | `command -v apk` |
| `apt-get` | Debian/Ubuntu | `command -v apt-get` |
| `brew` | macOS (Homebrew) | `command -v brew` |

### 6.2 `install.sh` -- libGL hint (Lines 727-729)

```
note "Install: sudo apt-get install libgl1  (Debian/Ubuntu)"
note "        sudo dnf install mesa-libGL  (Fedora)"
note "        sudo pacman -S mesa           (Arch)"
```

| Manager | Platform | Note |
|---------|----------|------|
| `apt-get` | Debian/Ubuntu | Only hinted, not auto-detected |
| `dnf` | Fedora/RHEL | Only hinted |
| `pacman` | Arch Linux | Only hinted |

---

## 7. Summary Table of All Platform Differences

### 7.1 Critical Differences (end-user behavior changes)

| # | Feature | macOS | Linux | Affected File | Lines |
|---|---------|-------|-------|---------------|-------|
| D1 | Terminal launch | `open .command` via Finder | `x-terminal-emulator` / `gnome-terminal` / `xterm` | `.bin/pilosa` | 1080-1094 |
| D2 | Claude Desktop handoff | `open claude://` deep link | Clipboard copy only | `.bin/pilosa` | 1147-1156 |
| D3 | libGL check | Not performed | Checks and warns if missing | `install.sh` | 724-730 |
| D4 | Cross-platform vendor builds | Can build all platforms | Can build all platforms (native) | `build-rapidocr-vendor.sh` | 63-71 |
| D5 | Python framework layout | `Python.framework/Versions/...` | `bin/python3` | `build-pilosa-vendor.sh`, `build-rapidocr-vendor.sh` | 72-81, 104-117 |
| D6 | Binary support | `arm64`, `amd64` | `arm64`, `amd64`, `i386` | all detection blocks | multiple |

### 7.2 Safe Differences (both paths covered)

| # | Feature | macOS path | Linux path | Files | Lines |
|---|---------|-----------|------------|-------|-------|
| S1 | `stat` file size | `stat -f %z` | `stat -c %s` | `.bin/pilosa` | 1287-1293 |
| S2 | `stat` mtime | `stat -f %m` | `stat -c %Y` | `.bin/pilosa` | 3886 |
| S3 | `sed -i` | `sed -i.bak` (needs arg) | `sed -i ''` (needs empty arg) | multiple | 2669-2670, 2878-2879, 3407-3408, 3790-3794 |
| S4 | `sort -V` | Falls back to field sort | Uses `sort -V` | `.bin/pilosa` | 76-81 |
| S5 | `date` parsing | `date -j -f` | `date -d` | `install.sh` | 268 |
| S6 | SHA tools | `shasum -a 256` | `sha256sum` | multiple | 850-856, 227-233, 197, 278, 310 |
| S7 | tar Apple Double | `COPYFILE_DISABLE=1` | No-op env var | `package-release.sh` | 300 |
| S8 | Clipboard | `pbcopy` | `xclip` / `xsel` / `clip.exe` | `.bin/pilosa` | 968-981 |

### 7.3 Platform-Exclusive Features

| # | Feature | Platform | Description | File | Lines |
|---|---------|----------|-------------|------|-------|
| E1 | `.DS_Store` cleanup | macOS | Finder creates these; framework explicitly removes them | `.bin/pilosa`, `.bin/package-release.sh` | 96-97, 3013-3014 |
| E2 | Shell profiles | macOS (zsh default) | `~/.zshrc` is primary target | `install.sh` | 780-785 |
| E3 | Shell profiles | Linux (bash default) | `~/.bashrc` or `~/.profile` is primary target | `install.sh` | 780-785 |

---

## 8. Testing Status

### 8.1 Tests that run on both platforms

| Test File | What it tests | macOS tested? | Linux tested? |
|-----------|---------------|---------------|---------------|
| `tests/smoke.sh` | Full workflow: install, uninstall, new, onboard, filter, fail, verify | Yes (CI) | Yes (CI) |
| `tests/test_cli.sh` | Individual CLI functions (config, registry, discovery, validation) | Yes | Likely |
| `tests/test_interactive.sh` | Dashboard menu, workspace discovery, permission, upgrade | Yes | Likely |

### 8.2 Untested platform-specific code

| Feature | Risk | Reason |
|---------|------|--------|
| Terminal emulator launch on Linux (gnome-terminal, xterm) | Medium | No CI test harness for graphical terminal emulators |
| Clipboard functions (pbcopy, xclip, xsel) | Medium | Requires X11/Wayland display server |
| `open` command on macOS | Low | Well-tested macOS feature |
| `claude://` deep link | Low | URL scheme, tested by Claude Code itself |
| Cross-platform vendor builds | Medium | `can_execute()` logic has no explicit unit test |
| libGL detection on Linux | Low | Simple `ldconfig` check -- reliable |

---

## 9. Recommendations

1. **`stat` fallback order inconsistency**: `file_size_bytes()` tries Linux format first then macOS; `cache_is_fresh()` does the opposite. For consistency, consider using the same fallback order everywhere.

2. **`date` parsing fallback order**: `install.sh:268` tries Linux `date -d` first, then macOS `date -j`. On macOS this always produces a one-line stderr error before succeeding. Consider trying the native format first (detect platform, then choose).

3. **Terminal emulator test**: Add a test that mocks `command -v` responses to verify the Linux terminal emulator fallback chain without requiring an actual display.

4. **Clipboard test**: Add a test that creates mock `pbcopy`/`xclip`/`xsel` scripts and verifies the fallback chain.

5. **Cross-platform builds**: Add documentation that cross-platform builds skip pip install; this is currently only noted in the DEPRECATED `build-rapidocr-vendor.sh` header.
