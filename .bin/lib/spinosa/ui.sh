# shellcheck shell=bash
# UI, prompts, menus, and progress rendering for spinosa.

divider()   { local w=$((COLS > 4 ? COLS - 2 : 10)); printf '%s\n' "${DIM}$(printf '%.0s─' $(seq 1 "$w"))${RESET}"; }

print_spinosa_banner() {
  local version="${1:-}"
  [[ "${SPINOSA_BANNER_PRINTED:-0}" != "1" ]] || return 0
  if [[ -z "$version" ]]; then
    version="$(framework_version "$FRAMEWORK_ROOT")"
  fi
  [[ -z "$version" || "$version" == "dev" ]] && version="dev"

  printf '\n  %s%s%s\n' "${PG}" "███████╗██████╗ ██╗███╗   ██╗ ██████╗ ███████╗ █████╗ " "${RESET}"
  printf '  %s%s%s\n' "${PG}" "██╔════╝██╔══██╗██║████╗  ██║██╔═══██╗██╔════╝██╔══██╗" "${RESET}"
  printf '  %s%s%s\n' "${PG}" "███████╗██████╔╝██║██╔██╗ ██║██║   ██║███████╗███████║" "${RESET}"
  printf '  %s%s%s\n' "${PG}" "╚════██║██╔═══╝ ██║██║╚██╗██║██║   ██║╚════██║██╔══██║" "${RESET}"
  printf '  %s%s%s\n' "${PG}" "███████║██║     ██║██║ ╚████║╚██████╔╝███████║██║  ██║" "${RESET}"
  printf '  %s%s%s' "${PG}" "╚══════╝╚═╝     ╚═╝╚═╝  ╚═══╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝" "${RESET}"
  printf '   %s%s%s\n' "${PG}" "v${version}" "${RESET}"
  SPINOSA_BANNER_PRINTED=1
}

header()    {
  print_spinosa_banner
  printf '\n%s\n\n' "${BOLD}${C}$1${RESET}"
}

title()     {
  printf '\n  %s%s%s\n\n' "${BOLD}${C}" "$1" "${RESET}"
}

info()      { spinosa_log INFO "$1"; printf '  %s %s\n' "${DIM}→${RESET}" "$1"; }

ok()        { spinosa_log INFO "$1"; printf '  %s %s\n' "${G}✦${RESET}" "$1"; }

warn()      { spinosa_log WARN "$1"; printf '  %s %s\n' "${Y}⚠${RESET}" "$1" >&2; }

note()      { spinosa_log INFO "$1"; printf '  %s↳%s %s\n' "${DIM}" "${RESET}" "$1"; }

tree_row() {
  local label="$1"
  shift || true
  local out="$label" part
  for part in "$@"; do
    [[ -n "$part" ]] && out="${out} ${DIM}|${RESET} ${part}"
  done
  printf '  %s├─%s %s\n' "${DIM}" "${RESET}" "$out"
}

tree_row_last() {
  local label="$1"
  shift || true
  local out="$label" part
  for part in "$@"; do
    [[ -n "$part" ]] && out="${out} ${DIM}|${RESET} ${part}"
  done
  printf '  %s└─%s %s\n' "${DIM}" "${RESET}" "$out"
}

tree_sep() {
  printf '  %s│%s\n' "${DIM}" "${RESET}"
}

if [[ "${SPINOSA_NO_EMOJI:-0}" == "1" ]]; then
  note_wilted() { note "$@"; }
  note_empty()  { note "$@"; }
  note_cactus() { note "$@"; }
else
  note_wilted() { printf '  %s🥀%s %s\n' "${DIM}" "${RESET}" "$1"; }
  note_empty()  { printf '  %s🪾%s %s\n' "${DIM}" "${RESET}" "$1"; }
  note_cactus() { printf '  %s⚠️%s %s\n' "${DIM}" "${RESET}" "$1"; }
fi

die()       { spinosa_log ERROR "$1"; printf '\n  %s %s\n\n' "${R}✗${RESET}" "$1" >&2; exit 1; }

print_step() {
  printf '\n'
  divider
  printf '  %s%s[%s/%s] %s%s\n' "${BOLD}" "${C}" "$1" "$2" "$3" "${RESET}"
  divider
}


read_from_tty() {
  if [[ -t 0 ]]; then
    flush_pending_input
    IFS= read -r "$@"
  elif [[ "${NUMBERED:-0}" = "1" ]]; then
    return 1
  else
    # Try to read from /dev/tty if available, suppress all errors
    { [[ -r /dev/tty ]] && flush_pending_input && IFS= read -r "$@" < /dev/tty; } 2>/dev/null || return 1
  fi
}


flush_pending_input() {
  [[ "${SPINOSA_FLUSH_TTY_INPUT:-1}" == "0" ]] && return 0
  [[ -t 0 ]] || return 0

  # Drain any buffered keystrokes — short timeout, no stty changes.
  # Caller must restore stty to cooked mode before calling this.
  read -t 0 -n 100 2>/dev/null || true
}


spinner_start() {
  local msg="$1"
  SPINNER_PID=""
  [[ -t 2 ]] || return 0
  (
    local frames=("▁" "▃" "▄" "▅" "▆" "▇" "█" "▇" "▆" "▅" "▄" "▃")
    local i=0
    while true; do
      printf '\r\033[2K  %s%s%s %s' "${C}" "${frames[$((i % 12))]}" "${RESET}" "$msg" >&2
      i=$((i + 1))
      sleep 0.1
    done
  ) &
  SPINNER_PID=$!
}


spinner_stop() {
  [[ -n "${SPINNER_PID:-}" ]] || return 0
  kill "$SPINNER_PID" 2>/dev/null || true
  wait "$SPINNER_PID" 2>/dev/null || true
  SPINNER_PID=""
  printf '\r\033[2K\n' >&2
}


prompt_input() {
  local prompt="$1" default="${2:-}" hint="${3:-}" value=""
  value="$(ask "$prompt" "$default" "$hint")"
  echo "$value"
}


prompt_directory() {
  local prompt="$1" default="${2:-}" hint="${3:-}" value=""
  value="$(ask "$prompt" "$default" "$hint")"
  echo "$value"
}


option_spec() {
  local value="$1" label="${2:-$1}" description="${3:-}"
  printf '%s%s%s%s%s' "$value" "$OPTION_SEP" "$label" "$OPTION_SEP" "$description"
}

option_separator() {
  option_spec "__separator__" "" ""
}


option_value() {
  local spec="$1"
  if [[ "$spec" == *"$OPTION_SEP"* ]]; then
    printf '%s' "${spec%%"$OPTION_SEP"*}"
  else
    printf '%s' "$spec"
  fi
}


option_rest() {
  local spec="$1"
  if [[ "$spec" == *"$OPTION_SEP"* ]]; then
    printf '%s' "${spec#*"$OPTION_SEP"}"
  else
    printf ''
  fi
}


option_label() {
  local rest label
  rest="$(option_rest "$1")"
  if [[ "$rest" == *"$OPTION_SEP"* ]]; then
    label="${rest%%"$OPTION_SEP"*}"
    printf '%s' "${label:-$(option_value "$1")}"
  elif [[ -n "$rest" ]]; then
    printf '%s' "$rest"
  else
    printf '%s' "$(option_value "$1")"
  fi
}


option_description() {
  local rest
  rest="$(option_rest "$1")"
  if [[ "$rest" == *"$OPTION_SEP"* ]]; then
    printf '%s' "${rest#*"$OPTION_SEP"}"
  else
    printf ''
  fi
}

option_is_separator() {
  [[ "$(option_value "$1")" == "__separator__" ]]
}


option_display() {
  local spec="$1" selected="${2:-0}" label desc
  label="$(option_label "$spec")"
  desc="$(option_description "$spec")"
  if [[ -n "$desc" ]]; then
    if [[ "$selected" == "1" ]]; then
      printf '%s%s%s %s- %s%s' "${BOLD}" "$label" "${RESET}" "${DIM}" "$desc" "${RESET}"
    else
      printf '%s %s- %s%s' "$label" "${DIM}" "$desc" "${RESET}"
    fi
  elif [[ "$selected" == "1" ]]; then
    printf '%s%s%s' "${BOLD}" "$label" "${RESET}"
  else
    printf '%s' "$label"
  fi
}


prompt_choose() {
  local prompt="$1"
  shift
  local options=("$@")
  arrow_select "$prompt" "${options[@]}"
}


multi_values_contains() {
  local needle="$1"
  shift || true
  local item
  for item in "$@"; do
    [[ "$item" == "$needle" ]] && return 0
  done
  return 1
}


prompt_multi_choose() {
  local prompt="$1"
  shift
  local options=("$@")
  MULTI_CHOOSE_RESULTS=()
  MULTI_CHOOSE_OPTIONS=("${options[@]}")
  MULTI_CHOOSE_SELECTED=()

  local option value
  for option in "${options[@]}"; do
    value="$(option_value "$option")"
    [[ "$value" == "__all__" ]] && continue
    # Skip extensions in the exclude list (pipe-separated, e.g. "mp4|mov|mp3")
    if [[ -n "${MULTI_CHOOSE_EXCLUDE:-}" ]]; then
      ext_in_list "$value" "$MULTI_CHOOSE_EXCLUDE" && continue
    fi
    MULTI_CHOOSE_SELECTED+=("$value")
  done

  multi_arrow_select "$prompt" "${options[@]}"
}


prompt_confirm() {
  local prompt="$1" default="${2:-y}"
  confirm "$prompt" "$default"
}


join_by() {
  local sep="$1"
  shift
  local out="" item
  for item in "$@"; do
    if [[ -z "$out" ]]; then
      out="$item"
    else
      out="${out}${sep}${item}"
    fi
  done
  printf '%s' "$out"
}


ask() {
  local prompt="$1" default="${2:-}" hint="${3:-}"
  local fb="" default_display=""
  if [[ -n "$default" ]]; then
    default_display="$default"
    [[ "$default" == */* ]] && default_display="$(display_path "$default")"
    fb=" ${DIM}(${default_display})${RESET}"
  fi
  [[ -n "$hint" ]] && printf '  %s %s\n' "${DIM}↳${RESET}" "$hint" >&2
  printf '%s' "${BOLD}${prompt}${RESET}${fb}${DIM}: ${RESET}" >&2
  local reply
  if ! read_from_tty reply; then
    # If read_from_tty fails (no tty), try reading from stdin
    IFS= read -r reply || reply=""
  fi
  reply="${reply:-$default}"
  redraw_long_path_reply "$prompt" "$fb" "$reply"
  echo "$reply"
}


confirm() {
  local prompt="$1" default="${2:-y}"
  local hint="Y/n"
  [[ "$default" == "n" ]] && hint="y/N"
  local reply normalized
  trap 'printf "\n  Cancelled.\n" >&2; exit 1' INT
  while true; do
    printf '%s' "${BOLD}${prompt}${RESET} ${DIM}${hint}${RESET}: " >&2
    if ! read_from_tty reply; then
      # If read_from_tty fails (no tty), try reading from stdin
      if ! IFS= read -r reply; then
        # Fail closed for noninteractive automation; destructive callers must pass --yes.
        printf '\n  %s\n' "${R}Cannot read from terminal.${RESET}" >&2
        return 1
      fi
    fi
    reply="${reply:-$default}"
    normalized="$(printf '%s' "$reply" | tr '[:upper:]' '[:lower:]')"
    case "$normalized" in
      y|yes) return 0 ;;
      n|no) return 1 ;;
      *) printf '  %s\n' "${R}Please answer y/yes or n/no.${RESET}" >&2 ;;
    esac
  done
}


reset_terminal() {
  [[ -t 2 ]] || return 0
  printf '\033[?25h' >&2
}


select_menu() {
  local prompt="$1"
  shift
  local options=("$@") selectable_options=()

  printf '%s\n' "${BOLD}${prompt}${RESET}" >&2
  local i option
  for option in "${options[@]}"; do
    if option_is_separator "$option"; then
      printf '\n' >&2
      continue
    fi
    selectable_options+=("$option")
    printf '  %s %s\n' "${DIM}${#selectable_options[@]}.${RESET}" "$(option_display "$option")" >&2
  done

  local choice
  while true; do
    printf '%s' "${DIM}  Enter number [1-${#selectable_options[@]}]: ${RESET}" >&2
	    if ! read_from_tty choice; then
	      # If read_from_tty fails (no tty), try reading from stdin
	      if ! IFS= read -r choice; then
	        printf '\n  %s\n' "${R}Cannot read from terminal.${RESET}" >&2
	        return 1
	      fi
	    fi
    if [[ "$choice" =~ ^[0-9]+$ ]] && (( choice >= 1 && choice <= ${#selectable_options[@]} )); then
      echo "$(option_value "${selectable_options[$((choice-1))]}")"
      return
    fi
    printf '  %s\n' "${R}Invalid choice. Try again.${RESET}" >&2
  done
}


arrow_select() {
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

  flush_pending_input

  local count=${#options[@]}
  local current=0
  local key seq part
  local old_stty old_int_trap old_term_trap
  old_stty="$(stty -g 2>/dev/null)" || { select_menu "$prompt" "${options[@]}"; return; }
  old_int_trap="$(trap -p INT || true)"
  old_term_trap="$(trap -p TERM || true)"

  first_selectable_index() {
    local idx
    for idx in "${!options[@]}"; do
      option_is_separator "${options[$idx]}" || { printf '%s' "$idx"; return 0; }
    done
    return 1
  }

  next_selectable_index() {
    local start step idx
    start="$1"
    step="$2"
    idx="$start"
    local visited=0
    while (( visited < count )); do
      idx=$(( (idx + step + count) % count ))
      if ! option_is_separator "${options[$idx]}"; then
        printf '%s' "$idx"
        return 0
      fi
      visited=$((visited + 1))
    done
    return 1
  }

  current="$(first_selectable_index)" || { select_menu "$prompt" "${options[@]}"; return; }

  render_arrow_options() {
    local i
    for i in "${!options[@]}"; do
      if option_is_separator "${options[$i]}"; then
        printf '\n' >&2
      elif (( i == current )); then
        printf '\r\033[2K  %s›%s %s\n' "${C}" "${RESET}" "$(option_display "${options[$i]}" 1)" >&2
      else
        printf '\r\033[2K    %s\n' "$(option_display "${options[$i]}")" >&2
      fi
    done
  }

  restore_arrow_terminal() {
    stty "$old_stty" 2>/dev/null || true
    printf '\033[?25h' >&2
  }

  restore_arrow_traps() {
    if [[ -n "$old_int_trap" ]]; then eval "$old_int_trap"; else trap - INT; fi
    if [[ -n "$old_term_trap" ]]; then eval "$old_term_trap"; else trap - TERM; fi
  }

  cleanup_arrow() {
    restore_arrow_terminal
    flush_pending_input
    restore_arrow_traps
  }

  printf '\n  %s\n' "${BOLD}${prompt}${RESET}" >&2
  printf '  %s\n' "${DIM}↑/↓ to move, Enter to confirm, Esc/q to cancel${RESET}" >&2
  render_arrow_options

  if ! stty raw -echo 2>/dev/null; then
    printf '\033[%dF' "$count" >&2
    select_menu "$prompt" "${options[@]}"
    return
  fi
  printf '\033[?25l' >&2
  trap 'restore_arrow_terminal; flush_pending_input; printf "\n  Cancelled.\n" >&2; exit 130' INT TERM

  while true; do
    IFS= read -r -n 1 -s key 2>/dev/null || { cleanup_arrow; return 1; }
    case "$key" in
      $'\x1b')
        seq=""
        while IFS= read -r -n 1 -s -t 1 part 2>/dev/null; do
          seq+="$part"
          [[ ${#seq} -ge 2 ]] && break
        done
        if [[ -z "$seq" ]]; then
          # bare Esc → cancel
          cleanup_arrow
          printf '\n  Cancelled.\n' >&2
          return 1
        fi
        case "$seq" in
          '[A'|'OA') current="$(next_selectable_index "$current" -1)" || continue ;;
          '[B'|'OB') current="$(next_selectable_index "$current" 1)" || continue ;;
          *) continue ;;
        esac
        printf '\033[%dF' "$count" >&2
        render_arrow_options
        ;;
      ''|$'\r'|$'\n')
        cleanup_arrow
        echo "$(option_value "${options[$current]}")"
        return
        ;;
      q|Q)
        cleanup_arrow
        printf '\n  Cancelled.\n' >&2
        return 1
        ;;
    esac
  done
}


multi_option_is_selected() {
  local value="$1"
  if [[ "$value" == "__all__" ]]; then
    local option regular_value
    for option in "${MULTI_CHOOSE_OPTIONS[@]}"; do
      regular_value="$(option_value "$option")"
      [[ "$regular_value" == "__all__" ]] && continue
      multi_values_contains "$regular_value" "${MULTI_CHOOSE_SELECTED[@]-}" || return 1
    done
    return 0
  fi
  multi_values_contains "$value" "${MULTI_CHOOSE_SELECTED[@]-}"
}


toggle_multi_option() {
  local value="$1"
  local option regular_value updated=()
  if [[ "$value" == "__all__" ]]; then
    if multi_option_is_selected "__all__"; then
      MULTI_CHOOSE_SELECTED=()
    else
      MULTI_CHOOSE_SELECTED=()
      for option in "${MULTI_CHOOSE_OPTIONS[@]}"; do
        regular_value="$(option_value "$option")"
        [[ "$regular_value" == "__all__" ]] && continue
        MULTI_CHOOSE_SELECTED+=("$regular_value")
      done
    fi
    return
  fi

  if multi_values_contains "$value" "${MULTI_CHOOSE_SELECTED[@]-}"; then
    for regular_value in "${MULTI_CHOOSE_SELECTED[@]-}"; do
      [[ "$regular_value" == "$value" ]] || updated+=("$regular_value")
    done
    MULTI_CHOOSE_SELECTED=()
    [[ ${#updated[@]} -eq 0 ]] || MULTI_CHOOSE_SELECTED=("${updated[@]}")
  else
    MULTI_CHOOSE_SELECTED+=("$value")
  fi
}


render_multi_option_line() {
  local option="$1" selected="${2:-0}" prefix="${3:-    }" current="${4:-0}"
  local marker="○"
  [[ "$selected" == "1" ]] && marker="●"
  printf '\r\033[2K%s%s %s\n' "$prefix" "$marker" "$(option_display "$option" "$current")" >&2
}


multi_select_menu() {
  local prompt="$1"
  shift
  local options=("$@")
  local choice continue_index=$(( ${#options[@]} + 1 )) cancel_index=$(( ${#options[@]} + 2 ))

  while true; do
    printf '%s\n' "${BOLD}${prompt}${RESET}" >&2
    printf '  %s\n' "${DIM}Space to toggle, Enter to proceed (Esc to cancel)${RESET}" >&2
    local i option value
    for i in "${!options[@]}"; do
      option="${options[$i]}"
      value="$(option_value "$option")"
      printf '  %s ' "${DIM}$((i+1)).${RESET}" >&2
      if multi_option_is_selected "$value"; then
        render_multi_option_line "$option" 1 "" 0
      else
        render_multi_option_line "$option" 0 "" 0
      fi
    done
    printf '  %s %s\n' "${DIM}${continue_index}.${RESET}" "Proceed with selection" >&2
    printf '  %s %s\n' "${DIM}${cancel_index}.${RESET}" "Cancel" >&2
    printf '%s' "${DIM}  Enter number to toggle or continue: ${RESET}" >&2
	    if ! read_from_tty choice; then
	      if ! IFS= read -r choice; then
	        printf '\n  %s\n\n' "${R}Cannot read from terminal.${RESET}" >&2
	        return 1
	      fi
	    fi
    if [[ "$choice" =~ ^[0-9]+$ ]]; then
      if (( choice >= 1 && choice <= ${#options[@]} )); then
        toggle_multi_option "$(option_value "${options[$((choice-1))]}")"
        printf '\n' >&2
        continue
      fi
      if (( choice == continue_index )); then
        MULTI_CHOOSE_RESULTS=()
        local selected_value
        for selected_value in "${MULTI_CHOOSE_SELECTED[@]-}"; do
          [[ -n "$selected_value" ]] && MULTI_CHOOSE_RESULTS+=("$selected_value")
        done
        return 0
      fi
      if (( choice == cancel_index )); then
        return 1
      fi
    fi
    printf '  %s\n\n' "${R}Invalid choice. Try again.${RESET}" >&2
  done
}


multi_arrow_select() {
  local prompt="$1"
  shift
  local options=("$@")

  if [[ "${NUMBERED:-0}" == "1" ]] || [[ ! -t 0 ]]; then
    multi_select_menu "$prompt" "${options[@]}"
    return
  fi

  if ! command -v stty >/dev/null 2>&1; then
    multi_select_menu "$prompt" "${options[@]}"
    return
  fi

  flush_pending_input

  local total_rows=$(( ${#options[@]} + 2 ))
  local continue_row=${#options[@]}
  local cancel_row=$(( ${#options[@]} + 1 ))
  local current="$continue_row"
  local key seq part
  local term_lines page_capacity page_first=0 visible_rows=0
  local old_stty old_int_trap old_term_trap
  old_stty="$(stty -g 2>/dev/null)" || { multi_select_menu "$prompt" "${options[@]}"; return; }
  old_int_trap="$(trap -p INT || true)"
  old_term_trap="$(trap -p TERM || true)"

  render_multi_arrow_rows() {
    local i option value prefix selected current_flag visible_end remaining
    visible_end=$(( page_first + page_capacity ))
    (( visible_end > ${#options[@]} )) && visible_end=${#options[@]}
    visible_rows=0

    if (( page_first > 0 )); then
      printf '  %s↑ %s more%s\n' "${DIM}" "$page_first" "${RESET}" >&2
      visible_rows=$((visible_rows + 1))
    fi

    for ((i = page_first; i < visible_end; i++)); do
      prefix="    "
      (( i == current )) && prefix="  ${C}›${RESET} "
      option="${options[$i]}"
      value="$(option_value "$option")"
      selected=0
      multi_option_is_selected "$value" && selected=1
      current_flag=0
      (( i == current )) && current_flag=1
      render_multi_option_line "$option" "$selected" "$prefix" "$current_flag"
      visible_rows=$((visible_rows + 1))
    done

    remaining=$(( ${#options[@]} - visible_end ))
    if (( remaining > 0 )); then
      printf '  %s↓ %s more%s\n' "${DIM}" "$remaining" "${RESET}" >&2
      visible_rows=$((visible_rows + 1))
    fi

    prefix="    "
    (( current == continue_row )) && prefix="  ${C}›${RESET} "
    printf '\r\033[2K%s%sProceed with selection%s\n' "$prefix" "${BOLD}" "${RESET}" >&2
    visible_rows=$((visible_rows + 1))

    prefix="    "
    (( current == cancel_row )) && prefix="  ${C}›${RESET} "
    printf '\r\033[2K%sCancel\n' "$prefix" >&2
    visible_rows=$((visible_rows + 1))
  }

  restore_multi_arrow_terminal() {
    stty "$old_stty" 2>/dev/null || true
    printf '\033[?25h' >&2
  }

  restore_multi_arrow_traps() {
    if [[ -n "$old_int_trap" ]]; then eval "$old_int_trap"; else trap - INT; fi
    if [[ -n "$old_term_trap" ]]; then eval "$old_term_trap"; else trap - TERM; fi
  }

  cleanup_multi_arrow() {
    restore_multi_arrow_terminal
    flush_pending_input
    restore_multi_arrow_traps
  }

  finish_multi_arrow() {
    MULTI_CHOOSE_RESULTS=()
    local selected_value
    for selected_value in "${MULTI_CHOOSE_SELECTED[@]-}"; do
      [[ -n "$selected_value" ]] && MULTI_CHOOSE_RESULTS+=("$selected_value")
    done
  }

  term_lines="$(tput lines 2>/dev/null || echo 24)"
  page_capacity=$(( term_lines - 6 ))
  (( page_capacity < 1 )) && page_capacity=1

  printf '\n  %s\n' "${BOLD}${prompt}${RESET}" >&2
  printf '  %s\n' "${DIM}↑/↓ to move, Space to toggle, Enter to proceed (continue), Esc/q to cancel${RESET}" >&2
  render_multi_arrow_rows

  if ! stty raw -echo 2>/dev/null; then
    printf '\033[%dF' "$visible_rows" >&2
    multi_select_menu "$prompt" "${options[@]}"
    return
  fi
  printf '\033[?25l' >&2
  trap 'restore_multi_arrow_terminal; flush_pending_input; printf "\n  Cancelled.\n" >&2; exit 130' INT TERM

  while true; do
    IFS= read -r -n 1 -s key 2>/dev/null || { cleanup_multi_arrow; return 1; }
    case "$key" in
      $'\x1b')
        seq=""
        while IFS= read -r -n 1 -s -t 1 part 2>/dev/null; do
          seq+="$part"
          [[ ${#seq} -ge 2 ]] && break
        done
        if [[ -z "$seq" ]]; then
          # bare Esc → cancel
          cleanup_multi_arrow
          printf '\n  Cancelled.\n' >&2
          return 1
        fi
        case "$seq" in
          '[A'|'OA')
            current=$(( (current + total_rows - 1) % total_rows ))
            (( current < ${#options[@]} )) && page_first=$(( current / page_capacity * page_capacity ))
            ;;
          '[B'|'OB')
            current=$(( (current + 1) % total_rows ))
            (( current < ${#options[@]} )) && page_first=$(( current / page_capacity * page_capacity ))
            ;;
          *) continue ;;
        esac
        printf '\033[%dF' "$visible_rows" >&2
        render_multi_arrow_rows
        ;;
      ' ')
        if (( current < ${#options[@]} )); then
          toggle_multi_option "$(option_value "${options[$current]}")"
          printf '\033[%dF' "$visible_rows" >&2
          render_multi_arrow_rows
        fi
        ;;
      ''|$'\r'|$'\n')
        if (( current == continue_row )); then
          cleanup_multi_arrow
          printf '\n' >&2
          ok "Selection confirmed." >&2
          finish_multi_arrow
          return 0
        elif (( current == cancel_row )); then
          cleanup_multi_arrow
          printf '\n  Cancelled.\n' >&2
          return 1
        fi
        ;;
      q|Q)
        cleanup_multi_arrow
        printf '\n  Cancelled.\n' >&2
        return 1
        ;;
    esac
  done
}


truncate_display_path() {
  local value="$1" max_len="$2"
  local name stripped first prefix candidate available
  if (( ${#value} <= max_len )); then
    printf '%s\n' "$value"
    return
  fi

  if [[ "$value" != */* ]]; then
    if (( max_len <= 3 )); then
      printf '%.*s\n' "$max_len" "$value"
    else
      printf '...%s\n' "${value:$((${#value} - max_len + 3))}"
    fi
    return
  fi

  name="$(basename "$value")"
  if [[ "$value" == /* ]]; then
    stripped="${value#/}"
    first="${stripped%%/*}"
    prefix="/$first"
  else
    first="${value%%/*}"
    prefix="$first"
  fi

  candidate="${prefix}/.../${name}"
  if (( ${#candidate} <= max_len )); then
    printf '%s\n' "$candidate"
    return
  fi

  available=$((max_len - ${#prefix} - 5))
  if (( available >= 6 )); then
    printf '%s/.../%s\n' "$prefix" "${name:$((${#name} - available))}"
  elif (( max_len <= 3 )); then
    printf '%.*s\n' "$max_len" "$value"
  else
    printf '...%s\n' "${value:$((${#value} - max_len + 3))}"
  fi
}


display_path() {
  local value="$1" max_len="${2:-}"
  if [[ -z "$max_len" ]]; then
    max_len=$((COLS > 110 ? 92 : (COLS > 72 ? COLS - 24 : 48)))
  fi
  truncate_display_path "$value" "$max_len"
}


redraw_long_path_reply() {
  local prompt="$1" fb="$2" reply="$3" display
  [[ -t 0 && -t 2 ]] || return 0
  [[ "$reply" == */* ]] || return 0
  display="$(display_path "$reply")"
  [[ "$display" != "$reply" ]] || return 0
  printf '\033[1A\r\033[2K%s%s\n' "${BOLD}${prompt}${RESET}${fb}${DIM}: ${RESET}" "$display" >&2
}


plural_count() {
  local count="$1" singular="$2" plural="${3:-$2s}"
  if [[ "$count" -eq 1 ]]; then
    printf '1 %s' "$singular"
  else
    printf '%d %s' "$count" "$plural"
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


spinner_frame() {
  local index="$1"
  local frames=("▁" "▃" "▅" "▇" "█" "▇" "▅" "▃")
  printf '%s' "${frames[$((index % ${#frames[@]}))]}"
}


file_type_color() {
  local kind="$1"
  case "$kind" in
    markdown) printf '%s' "${G}" ;;
    markitdown) printf '%s' "${BOLD}${G}" ;;
    native) printf '%s' "${C}" ;;
    pdf) printf '%s' "${M}" ;;
    image) printf '%s' "${Y}" ;;
    video) printf '%s' "${B}" ;;
    audio) printf '%s' "${R}" ;;
    unknown) printf '%s' "${BOLD}${R}" ;;
    ignored) printf '%s' "${DIM}" ;;
    *) printf '%s' "${DIM}" ;;
  esac
}


file_type_label() {
  local kind="$1" label="$2"
  printf '%s%s%s' "$(file_type_color "$kind")" "$label" "${RESET}"
}


render_progress_line() {
  local line="$1"
  if [[ -t 2 && "${SPINOSA_PROGRESS_NEWLINES:-0}" != "1" ]]; then
    printf '\r\033[2K%s' "$line" >&2
  else
    printf '%s\n' "$line" >&2
  fi
}

render_progress_line_standalone() {
  local line="$1"
  if [[ -t 2 && "${SPINOSA_PROGRESS_NEWLINES:-0}" != "1" ]]; then
    printf '\033[1A\r\033[2K%s\n' "$line" >&2
  else
    printf '%s\n' "$line" >&2
  fi
}


clear_progress_line() {
  SPINOSA_ACTIVE_PROGRESS_KIND=""
  SPINOSA_ACTIVE_PROGRESS_INDEX=""
  SPINOSA_ACTIVE_PROGRESS_TOTAL=""
  SPINOSA_ACTIVE_PROGRESS_PATH=""
  SPINOSA_ACTIVE_PROGRESS_ACTION=""
  SPINOSA_ACTIVE_PROGRESS_COPIED=""
  SPINOSA_ACTIVE_PROGRESS_SKIPPED=""
  [[ -t 2 ]] && printf '\r\033[2K' >&2 || true
}


render_update_manifest_progress() {
  local index="$1" total="$2" path="$3" action="${4:-syncing}" spin_seed="${5:-$1}"
  local frame ratio label label_width fixed
  SPINOSA_ACTIVE_PROGRESS_KIND="update"
  SPINOSA_ACTIVE_PROGRESS_INDEX="$index"
  SPINOSA_ACTIVE_PROGRESS_TOTAL="$total"
  SPINOSA_ACTIVE_PROGRESS_PATH="$path"
  SPINOSA_ACTIVE_PROGRESS_ACTION="$action"
  SPINOSA_ACTIVE_PROGRESS_COPIED=""
  SPINOSA_ACTIVE_PROGRESS_SKIPPED=""
  frame="$(spinner_frame "$spin_seed")"
  ratio="${index}/${total}"
  fixed=$((10 + 1 + ${#action} + 1 + ${#ratio} + 3))
  label_width=$((COLS - fixed))
  (( label_width < 12 )) && label_width=12
  label="$(truncate_display_path "$path" "$label_width")"
  render_progress_line "  ${C}${frame}${RESET} ${action} ${ratio} ${DIM}—${RESET} ${label}"
}

render_status_progress() {
  local action="$1" path="${2:-}" spin_seed="${3:-0}"
  local frame label label_width fixed
  SPINOSA_ACTIVE_PROGRESS_KIND="status"
  SPINOSA_ACTIVE_PROGRESS_INDEX=""
  SPINOSA_ACTIVE_PROGRESS_TOTAL=""
  SPINOSA_ACTIVE_PROGRESS_PATH="$path"
  SPINOSA_ACTIVE_PROGRESS_ACTION="$action"
  SPINOSA_ACTIVE_PROGRESS_COPIED=""
  SPINOSA_ACTIVE_PROGRESS_SKIPPED=""
  frame="$(spinner_frame "$spin_seed")"
  fixed=$((10 + 1 + ${#action} + 3))
  label_width=$((COLS - fixed))
  (( label_width < 12 )) && label_width=12
  label="$(truncate_display_path "${path:-working...}" "$label_width")"
  render_progress_line "  ${C}${frame}${RESET} ${action} ${DIM}—${RESET} ${label}"
}

render_step_progress() {
  local processed="$1" total="$2" current_label="${3:-}" action="${4:-working}" spin_seed="${5:-$1}"
  local frame ratio fixed width label_width filled=0 bar="" i label
  SPINOSA_ACTIVE_PROGRESS_KIND="step"
  SPINOSA_ACTIVE_PROGRESS_INDEX="$processed"
  SPINOSA_ACTIVE_PROGRESS_TOTAL="$total"
  SPINOSA_ACTIVE_PROGRESS_PATH="$current_label"
  SPINOSA_ACTIVE_PROGRESS_ACTION="$action"
  SPINOSA_ACTIVE_PROGRESS_COPIED=""
  SPINOSA_ACTIVE_PROGRESS_SKIPPED=""
  frame="$(spinner_frame "$spin_seed")"
  ratio="${processed}/${total}"
  width=$((COLS > 100 ? 20 : 12))
  fixed=$((10 + 1 + ${#action} + 1 + ${#ratio} + 3))
  label_width=$((COLS - fixed - width - 1))
  (( label_width < 12 )) && label_width=12
  if (( total > 0 )); then
    filled=$(( processed * width / total ))
  fi
  for ((i = 0; i < width; i++)); do
    if (( i < filled )); then
      bar="${bar}█"
    else
      bar="${bar}░"
    fi
  done
  label="$(truncate_display_path "${current_label:-working...}" "$label_width")"
  render_progress_line "  ${C}${frame}${RESET} ${action} ${ratio} [${bar}] ${DIM}—${RESET} ${label}"
}


render_active_update_progress() {
  local spin_seed="${1:-0}"
  [[ -n "${SPINOSA_ACTIVE_PROGRESS_KIND:-}" ]] || return 0
  case "${SPINOSA_ACTIVE_PROGRESS_KIND}" in
    copy)
      render_copy_progress \
        "$SPINOSA_ACTIVE_PROGRESS_INDEX" \
        "$SPINOSA_ACTIVE_PROGRESS_TOTAL" \
        "${SPINOSA_ACTIVE_PROGRESS_COPIED:-0}" \
        "${SPINOSA_ACTIVE_PROGRESS_SKIPPED:-0}" \
        "$SPINOSA_ACTIVE_PROGRESS_PATH" \
        "$SPINOSA_ACTIVE_PROGRESS_ACTION" \
        "$spin_seed"
      ;;
    update)
      render_update_manifest_progress \
        "$SPINOSA_ACTIVE_PROGRESS_INDEX" \
        "$SPINOSA_ACTIVE_PROGRESS_TOTAL" \
        "$SPINOSA_ACTIVE_PROGRESS_PATH" \
        "$SPINOSA_ACTIVE_PROGRESS_ACTION" \
        "$spin_seed"
      ;;
    step)
      render_step_progress \
        "$SPINOSA_ACTIVE_PROGRESS_INDEX" \
        "$SPINOSA_ACTIVE_PROGRESS_TOTAL" \
        "$SPINOSA_ACTIVE_PROGRESS_PATH" \
        "$SPINOSA_ACTIVE_PROGRESS_ACTION" \
        "$spin_seed"
      ;;
    *)
      render_status_progress \
        "$SPINOSA_ACTIVE_PROGRESS_ACTION" \
        "$SPINOSA_ACTIVE_PROGRESS_PATH" \
        "$spin_seed"
      ;;
  esac
}


render_copy_progress() {
  local processed="$1" total="$2" copied="$3" skipped="$4" current_file="${5:-}" action="${6:-copying}" spin_seed="${7:-$1}"
  local frame ratio counts fixed width file_width filled=0 bar="" i
  SPINOSA_ACTIVE_PROGRESS_KIND="copy"
  SPINOSA_ACTIVE_PROGRESS_INDEX="$processed"
  SPINOSA_ACTIVE_PROGRESS_TOTAL="$total"
  SPINOSA_ACTIVE_PROGRESS_PATH="$current_file"
  SPINOSA_ACTIVE_PROGRESS_ACTION="$action"
  SPINOSA_ACTIVE_PROGRESS_COPIED="$copied"
  SPINOSA_ACTIVE_PROGRESS_SKIPPED="$skipped"
  frame="$(spinner_frame "$spin_seed")"
  ratio="${processed}/${total}"
  counts="(${copied} copied, ${skipped} skipped)"
  width=$((COLS > 100 ? 20 : 12))
  fixed=$((10 + 1 + ${#action} + ${#ratio} + ${#counts}))
  file_width=$((COLS - fixed - width - 1))
  if (( file_width < 12 )); then
    width=8
    file_width=$((COLS - fixed - width - 1))
  fi
  (( file_width < 8 )) && file_width=8
  [[ "$total" -gt 0 ]] && filled=$((processed * width / total))
  for ((i = 0; i < width; i++)); do
    if (( i < filled )); then bar+="█"; else bar+="░"; fi
  done
  current_file="$(truncate_display_path "$current_file" "$file_width")"
  render_progress_line "  ${C}${frame}${RESET} ${C}[${bar}]${RESET} ${action} ${ratio} ${current_file} ${counts}"
}


converter_progress_ext_suffix() {
  local current_file="$1" file_ext="${2:-}"
  local base_name base_ext
  [[ -n "$file_ext" ]] || return 0
  file_ext="${file_ext# \[\.}"
  file_ext="${file_ext%\]}"
  file_ext="${file_ext#.}"
  [[ -n "$file_ext" ]] || return 0
  base_name="$(basename "$current_file")"
  base_ext="${base_name##*.}"
  [[ "$base_ext" == "$file_ext" ]] && return 0
  printf '%s.%s%s' "${DIM}" "$file_ext" "${RESET}"
}


render_converter_progress() {
  local engine="$1" index="$2" total="$3" converted="$4" skipped="$5"
  local current_file="${6:-}" page_info="${7:-}" spin_seed="${8:-$index}"
  local elapsed_sec="${9:-0}" color="${10:-$G}" file_ext="${11:-}"
  local frame ratio counts bar="" width filled=0 i label label_width fixed
  local page_suffix="" elapsed_suffix="" ext_suffix="" engine_part=""

  frame="$(spinner_frame "$spin_seed")"
  ratio="${index}/${total}"
  counts="${DIM}(${converted} ok, ${skipped} skip)${RESET}"
  width=$((COLS > 100 ? 16 : 10))

  [[ -n "$page_info" ]] && page_suffix=" ${DIM}p.${page_info}${RESET}"
  if [[ "$elapsed_sec" -gt 0 ]]; then
    elapsed_suffix=" ${DIM}· ${elapsed_sec}s${RESET}"
  fi
  ext_suffix="$(converter_progress_ext_suffix "$current_file" "$file_ext")"
  [[ -n "$ext_suffix" ]] && ext_suffix=" ${ext_suffix}"

  if [[ -n "$engine" ]]; then
    engine_part="${color}${engine}${RESET} "
  fi

  [[ "$total" -gt 0 ]] && filled=$((index * width / total))
  for ((i = 0; i < width; i++)); do
    if (( i < filled )); then bar+="█"; else bar+="░"; fi
  done

  fixed=$((12 + ${#engine} + width + 6 + ${#ratio} + 24))
  label_width=$((COLS - fixed))
  if (( label_width < 14 )); then
    width=8
    fixed=$((12 + ${#engine} + width + 6 + ${#ratio} + 24))
    label_width=$((COLS - fixed))
  fi
  (( label_width < 10 )) && label_width=10
  label="$(truncate_display_path "$current_file" "$label_width")"

  render_progress_line "  ${color}${frame}${RESET} ${engine_part}${color}[${bar}]${RESET} ${ratio} ${label}${ext_suffix}${page_suffix}${elapsed_suffix} ${counts}"
}


render_ocr_progress() {
  render_converter_progress "" "$1" "$2" "$3" "$4" "${5:-}" "${6:-}" "${7:-$1}" 0 "${M}" "${8:-}"
}


render_converter_wait() {
  local elapsed="${7:-0}"
  render_converter_progress "$1" "$2" "$3" "$4" "$5" "${6:-}" "" "$elapsed" "$elapsed" "${8:-$G}" "${9:-}"
}

# ── Cloud-aware file copy ─────────────────────────────────────────
# Retries on transient errors (cloud timeout, network mount glitch)

confirm_action() {
  local prompt="$1" default="${2:-y}"
  prompt_confirm "$prompt" "$default"
}


print_path_list() {
  local title="$1"
  shift
  local count="$#" shown=0 path remaining
  [[ "$count" -gt 0 ]] || return 0

  info "${title}: ${count}"
  for path in "$@"; do
    shown=$((shown + 1))
    if [[ "$shown" -gt 8 ]]; then
      remaining=$((count - 8))
      note "... ${remaining} more"
      break
    fi
    note "$path"
  done
}
