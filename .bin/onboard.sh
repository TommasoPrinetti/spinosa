#!/usr/bin/env bash
set -euo pipefail

# ── ANSI colors (zero dependencies) ──────────────────────────────────────────
if [[ "${NO_COLOR:-}" == "1" ]] || [[ ! -t 1 ]]; then
  R="" G="" B="" Y="" C="" M="" DIM="" BOLD="" RESET=""
else
  R=$'\033[31m' G=$'\033[32m' B=$'\033[34m' Y=$'\033[33m'
  C=$'\033[36m' M=$'\033[35m' DIM=$'\033[2m' BOLD=$'\033[1m' RESET=$'\033[0m'
fi

# ── helpers ──────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(pwd)"
TODAY="$(date +%Y-%m-%d)"
FORCE="0"

Information="$ROOT/context.md"
Config="$ROOT/system/configuration.md"
Agents="$ROOT/AGENTS.md"
Claude="$ROOT/CLAUDE.md"
RawDir="$ROOT/raw"

# text-based extensions — renamed to .md (lossless conversion)
MARKDOWN_EXTENSIONS="txt|rtf|textile|wiki|mediawiki|dokuwiki|pmwiki|outliner|workflowy|dynalist"

# text-based extensions — copied unchanged (LLMs read natively)
NATIVE_EXTENSIONS="md|csv|json|yaml|yml|toml|xml|html|css|js|ts|py|rb|sh|log|ini|cfg|conf|tex|bib|org|adoc|rst|tiddlywiki|logseq|roam|obsidian"

# binary extensions — copied as-is (not pointer records)
BINARY_COPYABLE_EXTENSIONS="pdf"

divider()   { printf '%s\n' "${DIM}$(printf '%.0s─' 1 {1..78})${RESET}"; }
header()    { printf '\n%s\n\n' "${BOLD}${C}$1${RESET}"; }
info()      { printf '  %s %s\n' "${DIM}→${RESET}" "$1"; }
ok()        { printf '  %s %s\n' "${G}✦${RESET}" "$1"; }
warn()      { printf '  %s %s\n' "${Y}⚠${RESET}" "$1"; }
note()      { printf '  %s↳%s %s\n' "${DIM}" "${RESET}" "$1"; }
print_step(){ printf '\n  %s%s[%s/%s] %s%s\n' "${BOLD}" "${C}" "$1" "$2" "$3" "${RESET}"; }
print_box() {
  printf '\n  %s┌%s┐%s\n' "${DIM}" "$(printf '%.0s─' 1 {1..76})" "${RESET}"
  printf '  %s│%s %s%s%s\n' "${DIM}" "${RESET}" "${BOLD}$1${RESET}" "${DIM}" "${RESET}"
  printf '  %s├%s┤%s\n' "${DIM}" "$(printf '%.0s─' 1 {1..76})" "${RESET}"
  while IFS= read -r line; do
    printf '  %s│%s %s\n' "${DIM}" "${RESET}" "$line"
  done
  printf '  %s└%s┘%s\n' "${DIM}" "$(printf '%.0s─' 1 {1..76})" "${RESET}"
}

prompt_preview() {
  local line count=0
  while IFS= read -r line; do
    printf '%s\n' "$line"
    count=$((count + 1))
    [[ "$count" -ge 4 ]] && break
  done
  printf '...\n'
}

shell_quote() {
  local value="$1"
  value="${value//\'/\'\\\'\'}"
  printf "'%s'" "$value"
}

build_launch_command() {
  local cli="$1" prompt="$2" root_cmd
  root_cmd="$(shell_quote "$ROOT")"

  case "$cli" in
    "Codex")
      printf 'codex -C %s "$(cat <<'\''PILOSA_STARTUP_PROMPT'\''\n' "$root_cmd"
      printf '%s\n' "$prompt"
      printf 'PILOSA_STARTUP_PROMPT\n)"\n'
      ;;
    "Codex App")
      printf 'codex app %s\n' "$root_cmd"
      ;;
    "OpenCode")
      printf 'opencode --prompt "$(cat <<'\''PILOSA_STARTUP_PROMPT'\''\n'
      printf '%s\n' "$prompt"
      printf 'PILOSA_STARTUP_PROMPT\n)" %s\n' "$root_cmd"
      ;;
    "OpenCode Desktop")
      printf 'opencode %s\n' "$root_cmd"
      ;;
    "Claude Code")
      printf 'cd %s && claude "$(cat <<'\''PILOSA_STARTUP_PROMPT'\''\n' "$root_cmd"
      printf '%s\n' "$prompt"
      printf 'PILOSA_STARTUP_PROMPT\n)"\n'
      ;;
    "Claude Code Desktop")
      local encoded_prompt
      encoded_prompt="$(printf '%s' "$prompt" | python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.stdin.read(), safe=""))' 2>/dev/null || printf '%s' "$prompt" | sed 's/ /%20/g; s/"/%22/g')"
      printf 'open "claude://code/new?q=%s&folder=%s"\n' "$encoded_prompt" "$root_cmd"
      ;;
    "Kilo")
      printf 'cd %s && kilo "$(cat <<'\''PILOSA_STARTUP_PROMPT'\''\n' "$root_cmd"
      printf '%s\n' "$prompt"
      printf 'PILOSA_STARTUP_PROMPT\n)"\n'
      ;;
    *)
      printf 'cd %s && <your-llm-cli> "$(cat <<'\''PILOSA_STARTUP_PROMPT'\''\n' "$root_cmd"
      printf '%s\n' "$prompt"
      printf 'PILOSA_STARTUP_PROMPT\n)"\n'
      ;;
  esac
}

run_cli_with_prompt() {
  local cli="$1" prompt="$2"
  case "$cli" in
    "Codex")
      if ! command -v codex >/dev/null 2>&1; then
        warn "codex was not found on PATH."
        return 1
      fi
      exec codex -C "$ROOT" "$prompt"
      ;;
    "Codex App")
      if ! command -v codex >/dev/null 2>&1; then
        warn "codex was not found on PATH."
        return 1
      fi
      copy_to_clipboard "$prompt"
      codex app "$ROOT" &
      ok "Prompt copied to clipboard — paste it in the Codex app."
      return 0
      ;;
    "OpenCode")
      if ! command -v opencode >/dev/null 2>&1; then
        warn "opencode was not found on PATH."
        return 1
      fi
      exec opencode --prompt "$prompt" "$ROOT"
      ;;
    "OpenCode Desktop")
      if ! command -v opencode >/dev/null 2>&1; then
        warn "opencode was not found on PATH."
        return 1
      fi
      copy_to_clipboard "$prompt"
      opencode "$ROOT" &
      ok "Prompt copied to clipboard — paste it in the OpenCode TUI."
      return 0
      ;;
    "Claude Code")
      if ! command -v claude >/dev/null 2>&1; then
        warn "claude was not found on PATH."
        return 1
      fi
      cd "$ROOT"
      exec claude "$prompt"
      ;;
    "Claude Code Desktop")
      local encoded_prompt
      encoded_prompt="$(printf '%s' "$prompt" | python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.stdin.read(), safe=""))' 2>/dev/null || printf '%s' "$prompt" | sed 's/ /%20/g; s/"/%22/g')"
      if [[ "$(uname)" == "Darwin" ]]; then
        open "claude://code/new?q=${encoded_prompt}&folder=${ROOT}"
        ok "Opening Claude Code Desktop with pre-filled prompt."
      else
        copy_to_clipboard "$prompt"
        ok "Prompt copied to clipboard — open Claude Code Desktop and paste it."
      fi
      return 0
      ;;
    "Kilo")
      if ! command -v kilo >/dev/null 2>&1; then
        warn "kilo was not found on PATH."
        return 1
      fi
      cd "$ROOT"
      exec kilo "$prompt"
      ;;
    *)
      warn "Run-now is only available for known CLI choices."
      return 1
      ;;
  esac
}

ask() {
  local prompt="$1" default="${2:-}" hint="${3:-}"
  local fb=""
  [[ -n "$default" ]] && fb=" ${DIM}(${default})${RESET}"
  [[ -n "$hint" ]] && printf '  %s %s\n' "${DIM}↳${RESET}" "$hint" >&2
  printf '%s' "${BOLD}${prompt}${RESET}${fb}${DIM}: ${RESET}" >&2
  local reply
  IFS= read -r reply || true
  reply="${reply:-$default}"
  echo "$reply"
}

select_menu() {
  local prompt="$1"
  shift
  local options=("$@")

  printf '%s\n' "${BOLD}${prompt}${RESET}" >&2
  for i in "${!options[@]}"; do
    printf '  %s %s\n' "${DIM}$((i+1)).${RESET}" "${options[$i]}" >&2
  done

  local choice
  while true; do
    printf '%s' "${DIM}  Enter number [1-${#options[@]}]: ${RESET}" >&2
    IFS= read -r choice || choice="1"
    if [[ "$choice" =~ ^[0-9]+$ ]] && (( choice >= 1 && choice <= ${#options[@]} )); then
      echo "${options[$((choice-1))]}"
      return
    fi
    printf '  %s\n' "${R}Invalid choice. Try again.${RESET}" >&2
  done
}

arrow_select() {
  # Arrow-key menu with TTY detection.
  # - In a TTY: up/down keys move the cursor, Enter selects, q cancels.
  # - Outside a TTY (piped input, non-interactive shells): fall back to select_menu.
  # - Set NUMBERED=1 in the environment to force the numbered menu.
  local prompt="$1"
  shift
  local options=("$@")

  if [[ "${NUMBERED:-0}" == "1" ]] || [[ ! -t 0 ]]; then
    select_menu "$prompt" "${options[@]}"
    return
  fi

  if ! command -v stty >/dev/null 2>&1; then
    select_menu "$prompt" "${options[@]}"
    return
  fi

  local count=${#options[@]}
  local current=0
  local key seq part
  local old_stty
  old_stty=$(stty -g 2>/dev/null) || { select_menu "$prompt" "${options[@]}"; return; }

  # Render initial menu
  printf '\n  %s\n' "${BOLD}${prompt}${RESET}" >&2
  printf '  %s\n' "${DIM}↑/↓ to move, Enter to confirm, q to cancel${RESET}" >&2
  for i in "${!options[@]}"; do
    if (( i == current )); then
      printf '  %s %s %s\n' "${C}" "▶" "${BOLD}${options[$i]}${RESET}" >&2
    else
      printf '    %s\n' "${options[$i]}" >&2
    fi
  done

  if ! stty raw -echo 2>/dev/null; then
    printf '\n  %s arrow-key mode failed, falling back to numbered menu\n' "${Y}⚠${RESET}" >&2
    # Clear the partial menu we already printed
    printf '\033[%dF' "$count" >&2
    for _ in "${!options[@]}"; do printf '\r\033[2K\n' >&2; done
    select_menu "$prompt" "${options[@]}"
    return
  fi

  local old_int_trap old_term_trap old_exit_trap
  old_int_trap="$(trap -p INT || true)"
  old_term_trap="$(trap -p TERM || true)"
  old_exit_trap="$(trap -p EXIT || true)"

  restore_arrow_traps() {
    if [[ -n "$old_int_trap" ]]; then eval "$old_int_trap"; else trap - INT; fi
    if [[ -n "$old_term_trap" ]]; then eval "$old_term_trap"; else trap - TERM; fi
    if [[ -n "$old_exit_trap" ]]; then eval "$old_exit_trap"; else trap - EXIT; fi
  }

  cleanup_arrow() {
    stty "$old_stty" 2>/dev/null || true
    printf '\033[?25h' >&2
    restore_arrow_traps
  }
  trap 'cleanup_arrow; printf "\n  Cancelled.\n" >&2; exit 1' INT TERM
  trap 'cleanup_arrow' EXIT

  while true; do
    IFS= read -r -n 1 -s key 2>/dev/null || { cleanup_arrow; return 1; }
    case "$key" in
      $'\x1b')
        seq=""
        while IFS= read -r -n 1 -s -t 1 part 2>/dev/null; do
          seq+="$part"
          [[ ${#seq} -ge 2 ]] && break
        done
        case "$seq" in
          '[A'|'OA') ((current--)); ((current < 0)) && current=$((count - 1)) ;; # up
          '[B'|'OB') ((current++)); ((current >= count)) && current=0 ;;            # down
          *) continue ;;
        esac
        # Redraw: move to the first option column, then rewrite each line.
        printf '\033[%dF' "$count" >&2
        for i in "${!options[@]}"; do
          printf '\r\033[2K' >&2
          if (( i == current )); then
            printf '  %s %s %s\n' "${C}" "▶" "${BOLD}${options[$i]}${RESET}" >&2
          else
            printf '    %s\n' "${options[$i]}" >&2
          fi
        done
        ;;
      ''|$'\n'|$'\r') break ;; # Enter
      $'\x03') cleanup_arrow; printf '\n  %s\n' "${DIM}Cancelled.${RESET}" >&2; return 1 ;;
      'q'|'Q') cleanup_arrow; printf '\n  %s\n' "${DIM}Cancelled.${RESET}" >&2; return 1 ;;
    esac
  done

  cleanup_arrow

  # Print final selection visibly
  printf '  %s %s %s\n' "${G}" "✓" "${BOLD}${options[$current]}${RESET}" >&2
  echo "${options[$current]}"
}

confirm() {
  local prompt="$1" default="${2:-y}"
  local hint="Y/n"
  [[ "$default" == "n" ]] && hint="y/N"
  local reply normalized
  while true; do
    printf '%s' "${BOLD}${prompt}${RESET} ${DIM}${hint}${RESET}: " >&2
    IFS= read -r reply || reply="$default"
    reply="${reply:-$default}"
    normalized="$(printf '%s' "$reply" | tr '[:upper:]' '[:lower:]')"
    case "$normalized" in
      y|yes) return 0 ;;
      n|no) return 1 ;;
      *) printf '  %s\n' "${R}Please answer y/yes or n/no.${RESET}" >&2 ;;
    esac
  done
}

copy_to_clipboard() {
  local text="$1"
  if command -v pbcopy &>/dev/null; then
    printf '%s' "$text" | pbcopy
    return 0
  elif command -v xclip &>/dev/null; then
    printf '%s' "$text" | xclip -selection clipboard
    return 0
  elif command -v xsel &>/dev/null; then
    printf '%s' "$text" | xsel --clipboard --input
    return 0
  elif command -v clip.exe &>/dev/null; then
    printf '%s' "$text" | clip.exe
    return 0
  fi
  return 1
}

sanitize_yaml() { printf '%s' "$1" | tr '"' "'" | tr '\n' ' '; }

normalize_path_input() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  if [[ ${#value} -ge 2 ]]; then
    if [[ "${value:0:1}" == "'" && "${value: -1}" == "'" ]] || [[ "${value:0:1}" == '"' && "${value: -1}" == '"' ]]; then
      value="${value:1:${#value}-2}"
    fi
  fi
  value="${value//\\ / }"
  echo "$value"
}

should_skip_source_file() {
  local name lower_name
  name="$(basename "$1")"
  lower_name="$(printf '%s' "$name" | tr '[:upper:]' '[:lower:]')"

  # AGENTS.md is repository/control guidance, not research corpus.
  [[ "$lower_name" == "agents.md" ]] && return 0

  case "$1" in
    */.DS_Store|*/.gitkeep|*/node_modules/*|*/.git/*) return 0 ;;
    *) return 1 ;;
  esac
}

is_markdown_convertible_file() {
  local path="$1"
  local name ext
  name="$(basename "$path")"

  [[ "$name" == *.* ]] || return 1
  ext="${name##*.}"
  ext="$(printf '%s' "$ext" | tr '[:upper:]' '[:lower:]')"

  case "|$MARKDOWN_EXTENSIONS|" in
    *"|$ext|"*) return 0 ;;
    *) return 1 ;;
  esac
}

is_native_readable_file() {
  local path="$1"
  local name ext
  name="$(basename "$path")"

  [[ "$name" == *.* ]] || return 1
  ext="${name##*.}"
  ext="$(printf '%s' "$ext" | tr '[:upper:]' '[:lower:]')"

  case "|$NATIVE_EXTENSIONS|" in
    *"|$ext|"*) return 0 ;;
    *) return 1 ;;
  esac
}

is_binary_copyable_file() {
  local path="$1"
  local name ext
  name="$(basename "$path")"

  [[ "$name" == *.* ]] || return 1
  ext="${name##*.}"
  ext="$(printf '%s' "$ext" | tr '[:upper:]' '[:lower:]')"

  case "|$BINARY_COPYABLE_EXTENSIONS|" in
    *"|$ext|"*) return 0 ;;
    *) return 1 ;;
  esac
}

markdown_raw_rel_path() {
  local rel_path="$1"
  local name dir stem ext
  name="$(basename "$rel_path")"
  dir="$(dirname "$rel_path")"

  ext="${name##*.}"
  ext="$(printf '%s' "$ext" | tr '[:upper:]' '[:lower:]')"

  if [[ "$ext" == "md" ]]; then
    echo "$rel_path"
    return
  fi

  stem="${name%.*}"
  if [[ "$dir" == "." ]]; then
    echo "${stem}__${ext}.md"
  else
    echo "${dir}/${stem}__${ext}.md"
  fi
}

native_raw_rel_path() {
  local rel_path="$1"
  echo "$rel_path"
}

render_copy_progress() {
  local processed="$1" total="$2" copied="$3" skipped="$4" current_file="${5:-}"
  local width=28
  local filled=0
  local bar="" i

  if [[ "$total" -gt 0 ]]; then
    filled=$((processed * width / total))
  fi

  for ((i = 0; i < width; i++)); do
    if (( i < filled )); then
      bar+="█"
    else
      bar+="░"
    fi
  done

  if [[ -n "$current_file" ]]; then
    current_file="$(truncate_display_path "$current_file" 46)"
    printf '\r\033[2K  %s[%s]%s %d/%d %s•%s %s (%d copied, %d skipped)' \
      "${C}" "$bar" "${RESET}" "$processed" "$total" "${DIM}" "${RESET}" "$current_file" "$copied" "$skipped" >&2
  else
    printf '\r\033[2K  %s[%s]%s %d/%d files processed (%d copied, %d skipped)' \
      "${C}" "$bar" "${RESET}" "$processed" "$total" "$copied" "$skipped" >&2
  fi
}

truncate_display_path() {
  local value="$1" max_len="$2"
  if (( ${#value} <= max_len )); then
    echo "$value"
  else
    echo "...${value:$((${#value} - max_len + 3))}"
  fi
}

plural_count() {
  local count="$1" singular="$2" plural="${3:-$2s}"
  if [[ "$count" -eq 1 ]]; then
    printf '1 %s' "$singular"
  else
    printf '%d %s' "$count" "$plural"
  fi
}

file_size_bytes() {
  local path="$1"
  if stat -c %s "$path" >/dev/null 2>&1; then
    stat -c %s "$path"
  elif stat -f %z "$path" >/dev/null 2>&1; then
    stat -f %z "$path"
  else
    printf '0'
  fi
}

format_bytes() {
  local bytes="$1"
  if [[ "$bytes" -ge 1073741824 ]]; then
    printf '%d.%02d GB' $((bytes / 1073741824)) $(((bytes % 1073741824) * 100 / 1073741824))
  elif [[ "$bytes" -ge 1048576 ]]; then
    printf '%d.%02d MB' $((bytes / 1048576)) $(((bytes % 1048576) * 100 / 1048576))
  elif [[ "$bytes" -ge 1024 ]]; then
    printf '%d.%02d KB' $((bytes / 1024)) $(((bytes % 1024) * 100 / 1024))
  else
    printf '%d B' "$bytes"
  fi
}

classify_source_file() {
  local path="$1"
  local name ext

  if should_skip_source_file "$path"; then
    echo "ignored"
    return
  fi

  if is_markdown_convertible_file "$path"; then
    echo "markdown"
    return
  fi

  if is_native_readable_file "$path"; then
    echo "native"
    return
  fi

  if is_binary_copyable_file "$path"; then
    echo "binary_copyable"
    return
  fi

  name="$(basename "$path")"
  if [[ "$name" == *.* ]]; then
    ext="${name##*.}"
    ext="$(printf '%s' "$ext" | tr '[:upper:]' '[:lower:]')"
  else
    ext=""
  fi

  case "$ext" in
    jpg|jpeg|png|gif|webp|heic|heif|tif|tiff|bmp|svg) echo "image" ;;
    mp4|mov|m4v|avi|mkv|webm|wmv) echo "video" ;;
    mp3|wav|m4a|aac|flac|ogg|opus|aiff) echo "audio" ;;
    *) echo "unknown" ;;
  esac
}

scan_source() {
  local vault_path="$1"
  SCAN_TOTAL_COUNT=0
  SCAN_MARKDOWN_COUNT=0
  SCAN_NATIVE_COUNT=0
  SCAN_BINARY_COPYABLE_COUNT=0
  SCAN_IMAGE_COUNT=0
  SCAN_VIDEO_COUNT=0
  SCAN_AUDIO_COUNT=0
  SCAN_UNKNOWN_COUNT=0
  SCAN_IGNORED_COUNT=0
  SCAN_MARKDOWN_BYTES=0
  SCAN_NATIVE_BYTES=0
  SCAN_BINARY_COPYABLE_BYTES=0
  SCAN_IMAGE_BYTES=0
  SCAN_VIDEO_BYTES=0
  SCAN_AUDIO_BYTES=0
  SCAN_UNKNOWN_BYTES=0

  printf '\n  %sScanning source location before writing raw copies...%s\n' "${DIM}" "${RESET}"

  local f class size
  while IFS= read -r -d '' f; do
    class="$(classify_source_file "$f")"
    if [[ "$class" != "ignored" ]]; then
      SCAN_TOTAL_COUNT=$((SCAN_TOTAL_COUNT + 1))
      size="$(file_size_bytes "$f")"
    else
      size=0
    fi

    case "$class" in
      markdown)
        SCAN_MARKDOWN_COUNT=$((SCAN_MARKDOWN_COUNT + 1))
        SCAN_MARKDOWN_BYTES=$((SCAN_MARKDOWN_BYTES + size))
        ;;
      native)
        SCAN_NATIVE_COUNT=$((SCAN_NATIVE_COUNT + 1))
        SCAN_NATIVE_BYTES=$((SCAN_NATIVE_BYTES + size))
        ;;
      binary_copyable)
        SCAN_BINARY_COPYABLE_COUNT=$((SCAN_BINARY_COPYABLE_COUNT + 1))
        SCAN_BINARY_COPYABLE_BYTES=$((SCAN_BINARY_COPYABLE_BYTES + size))
        ;;
      image)
        SCAN_IMAGE_COUNT=$((SCAN_IMAGE_COUNT + 1))
        SCAN_IMAGE_BYTES=$((SCAN_IMAGE_BYTES + size))
        ;;
      video)
        SCAN_VIDEO_COUNT=$((SCAN_VIDEO_COUNT + 1))
        SCAN_VIDEO_BYTES=$((SCAN_VIDEO_BYTES + size))
        ;;
      audio)
        SCAN_AUDIO_COUNT=$((SCAN_AUDIO_COUNT + 1))
        SCAN_AUDIO_BYTES=$((SCAN_AUDIO_BYTES + size))
        ;;
      unknown)
        SCAN_UNKNOWN_COUNT=$((SCAN_UNKNOWN_COUNT + 1))
        SCAN_UNKNOWN_BYTES=$((SCAN_UNKNOWN_BYTES + size))
        ;;
      ignored)
        SCAN_IGNORED_COUNT=$((SCAN_IGNORED_COUNT + 1))
        ;;
    esac
  done < <(find "$vault_path" -type f -print0 2>/dev/null)
}

print_scan_summary() {
  printf '  %s✓%s Source scan complete\n' "${G}" "${RESET}"
  if [[ "$SCAN_MARKDOWN_COUNT" -gt 0 ]]; then
    printf '  %s├─%s %s to rename to .md\n' "${DIM}" "${RESET}" "$(plural_count "$SCAN_MARKDOWN_COUNT" "text-based file")"
    printf '  %s│ %s%s%s\n' "${DIM}" "${RESET}" "$(format_bytes "$SCAN_MARKDOWN_BYTES")" "${DIM} text-like data${RESET}"
  fi
  if [[ "$SCAN_NATIVE_COUNT" -gt 0 ]]; then
    printf '  %s├─%s %s to copy unchanged\n' "${DIM}" "${RESET}" "$(plural_count "$SCAN_NATIVE_COUNT" "native-readable file")"
    printf '  %s│ %s%s%s\n' "${DIM}" "${RESET}" "$(format_bytes "$SCAN_NATIVE_BYTES")" "${DIM} native data${RESET}"
  fi
  if [[ "$SCAN_BINARY_COPYABLE_COUNT" -gt 0 ]]; then
    printf '  %s├─%s %s to copy as-is\n' "${DIM}" "${RESET}" "$(plural_count "$SCAN_BINARY_COPYABLE_COUNT" "PDF")"
    printf '  %s│ %s%s%s\n' "${DIM}" "${RESET}" "$(format_bytes "$SCAN_BINARY_COPYABLE_BYTES")" "${DIM} PDF data${RESET}"
  fi
  if [[ "$SCAN_IMAGE_COUNT" -gt 0 ]]; then
    printf '  %s├─%s %s skipped\n' "${DIM}" "${RESET}" "$(plural_count "$SCAN_IMAGE_COUNT" "image")"
    printf '  %s│ %s%s%s\n' "${DIM}" "${RESET}" "$(format_bytes "$SCAN_IMAGE_BYTES")" "${DIM} image data${RESET}"
  fi
  if [[ "$SCAN_VIDEO_COUNT" -gt 0 ]]; then
    printf '  %s├─%s %s skipped\n' "${DIM}" "${RESET}" "$(plural_count "$SCAN_VIDEO_COUNT" "video")"
    printf '  %s│ %s%s%s\n' "${DIM}" "${RESET}" "$(format_bytes "$SCAN_VIDEO_BYTES")" "${DIM} video data${RESET}"
  fi
  if [[ "$SCAN_AUDIO_COUNT" -gt 0 ]]; then
    printf '  %s├─%s %s skipped\n' "${DIM}" "${RESET}" "$(plural_count "$SCAN_AUDIO_COUNT" "audio file")"
    printf '  %s│ %s%s%s\n' "${DIM}" "${RESET}" "$(format_bytes "$SCAN_AUDIO_BYTES")" "${DIM} audio data${RESET}"
  fi
  if [[ "$SCAN_UNKNOWN_COUNT" -gt 0 ]]; then
    printf '  %s├─%s %s unsupported or unknown\n' "${DIM}" "${RESET}" "$(plural_count "$SCAN_UNKNOWN_COUNT" "file")"
    printf '  %s│ %s%s%s\n' "${DIM}" "${RESET}" "$(format_bytes "$SCAN_UNKNOWN_BYTES")" "${DIM} unknown data${RESET}"
  fi
  printf '  %s└─%s %s ignored\n' "${DIM}" "${RESET}" "$(plural_count "$SCAN_IGNORED_COUNT" "file")"
  note "Text-like files are renamed to .md; native-readable files keep their extension; PDFs are copied as-is; images, video, audio, and AGENTS.md control files are skipped."
  note "Startup later builds detailed Obsidian-wikilink maps in maps/."
}

print_transposition_summary() {
  local dest_dir="$1" copied="$2" skipped="$3" native_copied="$4" native_skipped="$5" binary_copied="$6" binary_skipped="$7"

  printf '\n  %s┌─%s %sTransposition complete%s\n' "${DIM}" "${RESET}" "${BOLD}" "${RESET}"
  printf '  %s│%s %s✓%s %s written (renamed to .md)\n' "${DIM}" "${RESET}" "${G}" "${RESET}" "$(plural_count "$copied" "markdown-convertible file")"
  if [[ "$skipped" -gt 0 ]]; then
    printf '  %s│%s %s↷%s %s already existed\n' "${DIM}" "${RESET}" "${Y}" "${RESET}" "$(plural_count "$skipped" "markdown-convertible file")"
  fi
  if [[ "$native_copied" -gt 0 ]]; then
    printf '  %s│%s %s✓%s %s written (unchanged)\n' "${DIM}" "${RESET}" "${G}" "${RESET}" "$(plural_count "$native_copied" "native-readable file")"
  fi
  if [[ "$native_skipped" -gt 0 ]]; then
    printf '  %s│%s %s↷%s %s already existed\n' "${DIM}" "${RESET}" "${Y}" "${RESET}" "$(plural_count "$native_skipped" "native-readable file")"
  fi
  if [[ "$binary_copied" -gt 0 ]]; then
    printf '  %s│%s %s✓%s %s written (as-is)\n' "${DIM}" "${RESET}" "${G}" "${RESET}" "$(plural_count "$binary_copied" "PDF")"
  fi
  if [[ "$binary_skipped" -gt 0 ]]; then
    printf '  %s│%s %s↷%s %s already existed\n' "${DIM}" "${RESET}" "${Y}" "${RESET}" "$(plural_count "$binary_skipped" "PDF")"
  fi
  if [[ "$SCAN_IGNORED_COUNT" -gt 0 ]]; then
    printf '  %s│%s %s•%s %s skipped\n' "${DIM}" "${RESET}" "${DIM}" "${RESET}" "$(plural_count "$SCAN_IGNORED_COUNT" "ignored file")"
  fi
  printf '  %s└─%s Raw corpus records: %s%s%s\n' "${DIM}" "${RESET}" "${C}${BOLD}" "$dest_dir" "${RESET}"
}

# ── transpose source files into raw copies ─────────────────────────────
copy_source() {
  local vault_path="$1"
  local dest_dir="$2"

  local total_files=$(( SCAN_MARKDOWN_COUNT + SCAN_NATIVE_COUNT + SCAN_BINARY_COPYABLE_COUNT ))
  if [[ "$total_files" -eq 0 ]]; then
    warn "No copyable files found in source location."
    return 1
  fi

  printf '  %s→%s Starting transposition of %s (%s + %s + %s)\n' \
    "${DIM}" "${RESET}" \
    "$(plural_count "$total_files" "file")" \
    "$(plural_count "$SCAN_MARKDOWN_COUNT" "markdown-convertible")" \
    "$(plural_count "$SCAN_NATIVE_COUNT" "native-readable")" \
    "$(plural_count "$SCAN_BINARY_COPYABLE_COUNT" "PDF")"
  render_copy_progress 0 "$total_files" 0 0

  local copied=0 skipped=0 processed=0
  local native_copied=0 native_skipped=0 binary_copied=0 binary_skipped=0

  # ── loop 1: markdown-convertible files → renamed to .md ──
  while IFS= read -r -d '' src_file; do
    should_skip_source_file "$src_file" && continue
    is_markdown_convertible_file "$src_file" || continue

    local rel_path="${src_file#"$vault_path"/}"
    local raw_rel_path
    raw_rel_path="$(markdown_raw_rel_path "$rel_path")"
    local dest_file="$dest_dir/$raw_rel_path"
    local dest_parent
    dest_parent="$(dirname "$dest_file")"

    mkdir -p "$dest_parent"

    if [[ -f "$dest_file" ]]; then
      skipped=$((skipped + 1))
      processed=$((processed + 1))
      render_copy_progress "$processed" "$total_files" "$copied" "$skipped" "$rel_path"
      continue
    fi

    cp "$src_file" "$dest_file"
    copied=$((copied + 1))
    processed=$((processed + 1))
    render_copy_progress "$processed" "$total_files" "$copied" "$skipped" "$rel_path"
  done < <(find "$vault_path" -type f -print0 2>/dev/null)

  # ── loop 2: native-readable files → copied unchanged ──
  while IFS= read -r -d '' src_file; do
    should_skip_source_file "$src_file" && continue
    is_native_readable_file "$src_file" || continue

    local rel_path="${src_file#"$vault_path"/}"
    local raw_rel_path
    raw_rel_path="$(native_raw_rel_path "$rel_path")"
    local dest_file="$dest_dir/$raw_rel_path"
    local dest_parent
    dest_parent="$(dirname "$dest_file")"

    mkdir -p "$dest_parent"

    if [[ -f "$dest_file" ]]; then
      native_skipped=$((native_skipped + 1))
      processed=$((processed + 1))
      render_copy_progress "$processed" "$total_files" "$copied" "$skipped" "$rel_path"
      continue
    fi

    cp "$src_file" "$dest_file"
    native_copied=$((native_copied + 1))
    processed=$((processed + 1))
    render_copy_progress "$processed" "$total_files" "$copied" "$skipped" "$rel_path"
  done < <(find "$vault_path" -type f -print0 2>/dev/null)

  # ── loop 3: binary-copyable files (PDFs) → copied as-is ──
  while IFS= read -r -d '' src_file; do
    should_skip_source_file "$src_file" && continue
    is_binary_copyable_file "$src_file" || continue

    local rel_path="${src_file#"$vault_path"/}"
    local raw_rel_path
    raw_rel_path="$(native_raw_rel_path "$rel_path")"
    local dest_file="$dest_dir/$raw_rel_path"
    local dest_parent
    dest_parent="$(dirname "$dest_file")"

    mkdir -p "$dest_parent"

    if [[ -f "$dest_file" ]]; then
      binary_skipped=$((binary_skipped + 1))
      processed=$((processed + 1))
      render_copy_progress "$processed" "$total_files" "$copied" "$skipped" "$rel_path"
      continue
    fi

    cp "$src_file" "$dest_file"
    binary_copied=$((binary_copied + 1))
    processed=$((processed + 1))
    render_copy_progress "$processed" "$total_files" "$copied" "$skipped" "$rel_path"
  done < <(find "$vault_path" -type f -print0 2>/dev/null)

  printf '\n'

  printf '  %s✓%s %sRaw records written to%s %s%s%s\n' "${G}${BOLD}" "${RESET}" "${BOLD}" "${RESET}" "${C}${BOLD}" "${dest_dir}" "${RESET}"
  print_transposition_summary "$dest_dir" "$copied" "$skipped" "$native_copied" "$native_skipped" "$binary_copied" "$binary_skipped"
  return 0
}

# ── overwrite check ─────────────────────────────────────────────────────────
has_filled_setup() {
  [[ -f "$Information" && -f "$Config" ]] || return 1
  local b c
  b=$(<"$Information")
  c=$(<"$Config")
  for ph in "[project name]" "[path]"; do
    [[ "$b" == *"$ph"* || "$c" == *"$ph"* ]] && return 1
  done
  return 0
}

# ── main ─────────────────────────────────────────────────────────────────────
main() {
  # Top-level cleanup: restore terminal cursor on interrupts.
  cleanup_main() {
    printf '\033[?25h' >&2
  }
  trap 'cleanup_main; printf "\n  Onboarding interrupted. Nothing was written.\n" >&2; exit 1' INT TERM
  trap 'cleanup_main' EXIT

  # parse flags
  for arg in "$@"; do
    case "$arg" in
      --force) FORCE="1" ;;
      --numbered) NUMBERED="1" ;;
      --no-color) R="" G="" B="" Y="" C="" M="" DIM="" BOLD="" RESET="" ;;
      --help|-h)
        printf '\n  %s\n\n' "${BOLD}Pilosa Setup${RESET}"
        printf '  %s\n\n' "${DIM}Usage:${RESET} bash .bin/onboard.sh [--force] [--numbered] [--no-color]"
        printf '  %s\n\n' "${DIM}Flags:${RESET}"
        printf '    %-14s %s\n' "--force" "Overwrite existing setup data"
        printf '    %-14s %s\n' "--numbered" "Force numbered menu instead of arrow-key picker"
        printf '    %-14s %s\n' "--no-color" "Disable colored output"
        printf '\n  %s\n' "${DIM}Collects: project name and source location, scans the corpus, transposes files to raw/, syncs agent definitions from .agents/agents/, enables Obsidian CSS snippet, then asks which LLM CLI should receive the startup handoff.${RESET}"
        return 0
        ;;
    esac
  done

  # title
  printf '\n'
  printf '  %s\n' "${BOLD}${C}██████╗ ██╗██╗      ██████╗ ███████╗ █████╗ ${RESET}"
  printf '  %s\n' "${BOLD}${C}██╔══██╗██║██║     ██╔═══██╗██╔════╝██╔══██╗${RESET}"
  printf '  %s\n' "${BOLD}${C}██████╔╝██║██║     ██║   ██║███████╗███████║${RESET}"
  printf '  %s\n' "${BOLD}${C}██╔═══╝ ██║██║     ██║   ██║╚════██║██╔══██║${RESET}"
  printf '  %s\n' "${BOLD}${C}██║     ██║███████╗╚██████╔╝███████║██║  ██║${RESET}"
  printf '  %s\n' "${BOLD}${C}╚═╝     ╚═╝╚══════╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝${RESET}"
  printf '\n'
  divider
  printf '\n  %s  %s\n' "${BOLD}${C}Pilosa${RESET}" "${DIM}Fast Setup${RESET}"
  printf '\n  %s\n' "${DIM}Project name, source location, corpus scan, consent, then LLM CLI handoff.${RESET}"
  divider

  # ── sync agent definitions from source of truth ──────────────────────────────
  if [[ -f "$SCRIPT_DIR/sync-agents.sh" ]]; then
    printf '\n'
    bash "$SCRIPT_DIR/sync-agents.sh"
  fi

  if has_filled_setup && [[ "$FORCE" != "1" ]]; then
    printf '\n  %s Existing setup data found.\n' "${Y}${BOLD}⚠${RESET}"
    if ! confirm "  Overwrite?" "n"; then
      printf '\n  %s\n\n' "${DIM}No changes made. Use --force to overwrite.${RESET}"
      return 0
    fi
  fi

  # ── Question 1: project name ─────────────────────────────────────────────
  print_step 1 4 "Project name"
  note "This is the working title for your research framework."
  note "It appears at the top of every report and in the blueprint."
  note "You can change it later by editing context.md."
  project_title=""
  while [[ -z "$project_title" ]]; do
    project_title="$(ask "Project name" "" "e.g. My Research Project")"
    [[ -z "$project_title" ]] && printf '  %s\n' "${R}Project name is required.${RESET}" >&2
  done
  ok "Project: ${BOLD}${project_title}${RESET}"

  # ── Question 2: source location ──────────────────────────────────────────
  print_step 2 4 "Source location"
  note "This is the folder of your source files — PDFs, notes, transcripts, etc."
  note "Nothing in this folder is moved, renamed, or edited."
  note "Text-like files, native-readable files, and PDFs can be copied into raw/; images, video, audio, and AGENTS.md control files are skipped."
  note "Startup will create maps/ as the central navigation layer."
  note "Use an absolute path (drag the folder onto the terminal to paste its path)."
  source_path=""
  while [[ -z "$source_path" ]]; do
    source_path="$(ask "Source location (absolute)" "" "e.g. /Users/name/Documents/my-sources")"
    source_path="$(normalize_path_input "$source_path")"
    [[ -z "$source_path" ]] && printf '  %s\n' "${R}Source location is required.${RESET}" >&2
  done

  if [[ ! -d "$source_path" ]]; then
    printf '\n  %s Source location does not exist: %s\n\n' "${R}✗${RESET}" "$source_path" >&2
    return 1
  fi
  ok "Source: ${BOLD}${source_path}${RESET}"

  # scan before any raw files are written
  print_step 3 4 "Corpus scan and consent"
  scan_source "$source_path"
  print_scan_summary

  local copyable_count=$(( SCAN_MARKDOWN_COUNT + SCAN_NATIVE_COUNT + SCAN_BINARY_COPYABLE_COUNT ))
  if [[ "$copyable_count" -eq 0 ]]; then
    warn "No copyable files found in source location."
    return 1
  fi

  if ! confirm "  Write accepted raw copies into raw/?" "y"; then
    printf '\n  %s\n\n' "${DIM}No raw copies were written. Onboarding stopped after the scan.${RESET}"
    return 0
  fi

  # transpose accepted files into raw copies
  printf '\n'
  copy_source "$source_path" "$RawDir"
  printf '\n'

  # ── Question 4: CLI preference ───────────────────────────────────────────
  print_step 4 4 "Startup handoff"
  note "Choose the CLI that should receive the startup prompt."
  note "You can change this later; the prompt is the same shape."
  preferred_cli="$(arrow_select "Preferred LLM CLI" "Claude Code" "Claude Code Desktop" "Codex" "Codex App" "OpenCode" "OpenCode Desktop" "Kilo" "Other")" || return 1
  ok "CLI: ${BOLD}${preferred_cli}${RESET}"

  # ── ensure directories exist ──────────────────────────────────────────────
  mkdir -p "$(dirname "$Information")"
  mkdir -p "$(dirname "$Config")"

  # ── write informations ─────────────────────────────────────────────────────
  cat > "$Information" << INFORMATIONS_EOF
---
type: information
agent: setup_cli
description:
  - Project blueprint filled during onboarding and startup.
  - Agents read this to understand scope, source location, evidence rules, and researcher preferences.
created: $TODAY
updated: $TODAY
setup_status: cli_started
connects_to:
  - AGENTS.md
  - system/configuration.md
  - system/startup.md
  - logs/user_requests.md
---

# Information

## Project
- Title: ${project_title:-[project name]}
- Description: not provided during fast setup; infer from the raw corpus during startup

## Project Artifacts
- none provided during fast setup

## Sources
- Source location: ${source_path:-[path]}
- Main source types: [inferred during startup from the source material]
- Expected incoming sources: [inferred during startup]

## Research Vocabulary
- Key actors / institutions / places: [inferred during startup]
- Key concepts: [inferred during startup]
- Sensitizing concepts, not evidence: [inferred during startup]
- Theoretical frames, not forced labels: [inferred during startup]

## Method And Evidence
- Methods: [inferred during startup]
- Claims require source paths.
- L2 clues require Verifier checking before reporting.
- External sources must stay labeled external unless moved into `raw/`.
- External source policy: no (default; ask only if external access is needed)

## Outputs
- Start with maps in maps/ and evidence-grounded answers unless the researcher requests another output.

## Blind Spots
- [identified during startup]

## Researcher Preferences
[stated or inferred during startup]

## Preferred LLM CLI
$preferred_cli
INFORMATIONS_EOF

  # ── write config ──────────────────────────────────────────────────────────
  local safe_source
  safe_source="$(sanitize_yaml "$source_path")"

  cat > "$Config" << CONFIG_EOF
---
type: project_configuration
agent: setup_cli
description:
  - Operating profile for the current Pilosa project or framework template.
  - Agents read this first to learn source policy, protected paths, and setup status.
created: $TODAY
updated: $TODAY
setup_status: cli_started
---

# Configuration

Agents read this before major work.

\`\`\`yaml
workspace_type: research_framework
research_mode: evolving_complex_corpus
source_location: "$safe_source"
source_mode: protected_append_only

source_policy: internal_first
active_corpus_path: raw/
active_corpus_policy: raw_first_after_onboarding
external_sources_allowed: no

claim_standard: source_link_required
l2_policy: verifier_required

protected_paths:
  - "$safe_source"
   - context.md

stale_after_days: 30
preferred_llm_cli: "$preferred_cli"
\`\`\`

## Notes
- This file was initialized by the CLI fast setup.
- The CLI collected: project name, source location, and preferred LLM CLI. It scanned the source location and transposed accepted files (text, native, PDF) into raw/. Images, video, audio, and AGENTS.md control files were skipped.
- After onboarding, the source location remains immutable original storage. Normal source-grounded work starts from raw/.
- During startup, project description and helpful artifact URLs are optional. If absent, the LLM CLI agent records them as not provided, keeps external_sources_allowed at its default \`no\`, and infers working scope from the raw corpus.
- When setup_status reaches workspace_started, the startup workflow has built the master dictionary, generated YAML headers, created detailed maps in maps/, and passed validation.
- This file never grants permission to edit the source location or `raw/`.
CONFIG_EOF

  # ── create CLAUDE.md if preferred CLI is Claude Code ──────────────────────
  local claude_created="no"
  if [[ "$preferred_cli" == "Claude Code" && -f "$Agents" ]]; then
    cp "$Agents" "$Claude"
    claude_created="yes"
  fi

  # ── enable Pilosa CSS snippet in Obsidian ────────────────────────────────
  mkdir -p "$ROOT/.obsidian/snippets"
  cat > "$ROOT/.obsidian/appearance.json" << 'APPEARANCE_EOF'
{
  "cssSnippets": [
    "pilosa"
  ]
}
APPEARANCE_EOF

  # ── success ───────────────────────────────────────────────────────────────
  printf '\n'
  divider
  printf '\n  %s\n\n' "${G}${BOLD}✦ Setup files written${RESET}"
  printf '  %s %s\n' "${DIM}─${RESET}" "${C}${Information}${RESET}"
  printf '  %s %s\n' "${DIM}─${RESET}" "${C}${Config}${RESET}"
  [[ "$claude_created" == "yes" ]] && printf '  %s %s\n' "${DIM}─${RESET}" "${C}${Claude}${RESET}"
  printf '  %s %s\n' "${DIM}─${RESET}" "${C}$ROOT/.obsidian/appearance.json${RESET}"

  printf '\n  %s\n\n' "${BOLD}Next:${RESET}"

  local startup_prompt
  startup_prompt=$(cat <<PROMPT_EOF
This is the Pilosa startup handoff. The user has completed fast CLI setup.

Read these files first, in this order:
1. AGENTS.md
2. system/configuration.md
3. context.md
4. system/startup.md

The setup draft already contains:
- Project name: ${project_title}
- Source location: ${source_path} (already validated, files transposed to raw/ — images, video, audio, and AGENTS.md skipped)
- Preferred LLM CLI: ${preferred_cli}

Optional context not collected by fast setup:
- Project description (if absent, infer from the raw corpus)
- Helpful artifact URLs or file paths (if absent, record none provided)
- External source policy defaults to no; ask only if external URL access is needed or the user requests external sources.

Then execute system/startup.md from Phase 1.2 onwards. Specifically:
- Translate the setup draft into filled information + configuration
- Build the master dictionary by reading the active raw corpus in raw/
- Generate YAML headers for every raw copy using the dictionary
- Account for skipped media as uncovered source media; do not create media pointer records
- Create maps/ and write detailed Obsidian-wikilink maps that help future LLMs choose which raw files to open
- Build maps from repeated themes
- Update workspace_index.md
- Run startup validation, then the full retrieval test suite
- Set setup_status to workspace_started in both information and configuration
- Write the startup report to agent_reports/

Do not re-ask questions the CLI draft already answered. Do not stop after one index. Do not edit the source location or `raw/`.
PROMPT_EOF
  )

  local startup_prompt_preview
  startup_prompt_preview="$(prompt_preview <<< "$startup_prompt")"
  print_box "Pilosa Startup Prompt Preview" <<< "$startup_prompt_preview"

  local launch_command launch_preview handoff_action
  launch_command="$(build_launch_command "$preferred_cli" "$startup_prompt")"
  launch_preview="$(prompt_preview <<< "$launch_command")"
  print_box "Terminal Launch Command Preview" <<< "$launch_preview"

  handoff_action="$(arrow_select "Handoff action" "Copy launch command" "Run launch command now")" || return 1

  if [[ "$handoff_action" == "Run launch command now" ]]; then
    ok "Starting ${preferred_cli} with the startup prompt loaded."
    run_cli_with_prompt "$preferred_cli" "$startup_prompt" || {
      warn "Could not run ${preferred_cli}. Copying the launch command instead."
      if copy_to_clipboard "$launch_command"; then
        ok "Launch command copied to your clipboard."
      else
        warn "No clipboard tool found. Copy the full command from the block below."
        print_box "Terminal Launch Command — full text" <<< "$launch_command"
      fi
    }
  else
    if copy_to_clipboard "$launch_command"; then
      ok "Launch command copied to your clipboard."
      note "Paste it into a terminal to open ${preferred_cli} with the startup prompt loaded."
    else
      warn "No clipboard tool found. Copy the full command from the block below."
      print_box "Terminal Launch Command — full text" <<< "$launch_command"
    fi
  fi
  printf '\n'
  divider
  printf '\n'
}

main "$@"
