#!/usr/bin/env bash
# Shared Unicode metric helpers for Spinosa reports and terminal display.

spinosa_bar() {
  local value="${1:-0}" total="${2:-0}" width="${3:-16}"
  local filled empty

  if ! [[ "$value" =~ ^[0-9]+$ && "$total" =~ ^[0-9]+$ && "$width" =~ ^[0-9]+$ ]] || [[ "$total" -le 0 || "$width" -le 0 ]]; then
    printf '%*s' "$width" '' | tr ' ' '?'
    return 0
  fi

  [[ "$value" -gt "$total" ]] && value="$total"
  filled=$(((value * width + total / 2) / total))
  empty=$((width - filled))
  printf '%*s' "$filled" '' | tr ' ' '▓'
  printf '%*s' "$empty" '' | tr ' ' '░'
}

spinosa_sparkchar() {
  case "${1:-0}" in
    0) printf '▁' ;; 1) printf '▂' ;; 2) printf '▃' ;; 3) printf '▄' ;;
    4) printf '▅' ;; 5) printf '▆' ;; 6) printf '▇' ;; 7) printf '█' ;;
    *) printf '▁' ;;
  esac
}

spinosa_sparkline() {
  local values=("$@")
  local min max value index first=1

  [[ "${#values[@]}" -gt 0 ]] || return 0

  for value in "${values[@]}"; do
    [[ "$value" =~ ^-?[0-9]+$ ]] || continue
    if [[ $first -eq 1 ]]; then
      min="$value"
      max="$value"
      first=0
    fi
    [[ "$value" -lt "$min" ]] && min="$value"
    [[ "$value" -gt "$max" ]] && max="$value"
  done

  for value in "${values[@]}"; do
    [[ "$value" =~ ^-?[0-9]+$ ]] || continue
    if [[ "$max" -eq "$min" ]]; then
      if [[ "$max" -gt 0 ]]; then
        index=7
      else
        index=0
      fi
    else
      index=$((((value - min) * 7 + (max - min) / 2) / (max - min)))
    fi
    [[ "$index" -lt 0 ]] && index=0
    [[ "$index" -gt 7 ]] && index=7
    spinosa_sparkchar "$index"
  done
}

spinosa_metric_box() {
  local title="$1"
  shift
  local width="${SPINOSA_METRIC_BOX_WIDTH:-64}"
  local rule line

  rule="$(printf '%*s' "$width" '' | tr ' ' '─')"
  printf '┌─ %s %s┐\n' "$title" "${rule:${#title}+3}"
  for line in "$@"; do
    printf '│ %-*s │\n' "$((width - 1))" "$line"
  done
  printf '└%s┘\n' "$rule"
}

spinosa_metrics_summary() {
  local notepad="${1:-.spinosa/memory/orchestrator-notes.md}"

  if [[ ! -f "$notepad" ]]; then
    spinosa_metric_box "Orchestrator Notes" "No notepad found."
    return 0
  fi

  local lines words
  lines=$(wc -l < "$notepad" | tr -d ' ')
  words=$(wc -w < "$notepad" | tr -d ' ')
  spinosa_metric_box "Orchestrator Notes" \
    "Lines  $(spinosa_bar "${lines:-0}" "${lines:-0}" 16)  ${lines:-0} lines" \
    "Words  $(spinosa_bar "${words:-0}" "${words:-0}" 16)  ${words:-0} words"
}
