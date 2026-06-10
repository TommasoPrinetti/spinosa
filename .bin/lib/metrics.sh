#!/usr/bin/env bash
# Shared Unicode metric helpers for Spinosa reports and agent session ledgers.

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

spinosa_metrics_header() {
  printf 'date\tsession_id\tagent\troute\toperation\tquery_label\tdirs_seen\tmaps_read\traw_matches\traw_files_read\treports_written\toutput_path\n'
}

spinosa_session_id() {
  if [[ -n "${SPINOSA_SESSION_ID:-}" ]]; then
    printf '%s\n' "$SPINOSA_SESSION_ID"
  else
    date +%Y%m%d-%H%M%S
  fi
}

spinosa_tsv_field() {
  printf '%s' "${1:-}" | tr '\t\r\n' '   '
}

spinosa_metrics_append() {
  local ledger="${1:-}"
  shift || true

  if [[ -z "$ledger" || "$#" -ne 11 ]]; then
    printf 'usage: spinosa_metrics_append LEDGER session_id agent route operation query_label dirs_seen maps_read raw_matches raw_files_read reports_written output_path\n' >&2
    return 2
  fi

  mkdir -p "$(dirname "$ledger")"
  [[ -f "$ledger" ]] || spinosa_metrics_header > "$ledger"

  {
    spinosa_tsv_field "$(date +%Y-%m-%d)"
    for field in "$@"; do
      printf '\t'
      spinosa_tsv_field "$field"
    done
    printf '\n'
  } >> "$ledger"
}

spinosa_metrics_summary() {
  local ledger="${1:-logs/session_metrics.tsv}"
  local summary rows matches files reports agents

  if [[ ! -f "$ledger" ]]; then
    spinosa_metric_box "Agent Metrics" "No session metrics ledger found."
    return 0
  fi

  summary="$(awk -F '\t' '
    NR > 1 {
      rows += 1
      agents[$3] = 1
      matches += ($9 + 0)
      files += ($10 + 0)
      reports += ($11 + 0)
    }
    END {
      for (agent in agents) agent_count += 1
      printf "%d\t%d\t%d\t%d\t%d\n", rows, agent_count, matches, files, reports
    }
  ' "$ledger")"

  IFS=$'\t' read -r rows agents matches files reports <<< "$summary"
  spinosa_metric_box "Agent Metrics" \
    "Sessions  $(spinosa_bar "${rows:-0}" "${rows:-0}" 16)  ${rows:-0} rows" \
    "Agents    $(spinosa_bar "${agents:-0}" "${agents:-0}" 16)  ${agents:-0} seen" \
    "Matches   $(spinosa_bar "${matches:-0}" "${matches:-0}" 16)  ${matches:-0} raw matches" \
    "Files     $(spinosa_bar "${files:-0}" "${files:-0}" 16)  ${files:-0} files read" \
    "Reports   $(spinosa_bar "${reports:-0}" "${reports:-0}" 16)  ${reports:-0} reports"
}
