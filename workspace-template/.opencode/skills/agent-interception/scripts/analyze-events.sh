#!/usr/bin/env bash
# Analyze normalized agent events JSONL and produce structured analysis JSON.
# Usage: analyze-events.sh <events.jsonl> > analysis.json
#
# Uses multiple simpler jq passes piped together for robustness.
set -euo pipefail

EVENTS_FILE="${1:-}"
if [ -z "$EVENTS_FILE" ] || [ ! -f "$EVENTS_FILE" ]; then
  echo "Usage: analyze-events.sh <events.jsonl>" >&2
  exit 1
fi

# Get command string from args (handles Codex "cmd" and OpenCode "command")
CMD_EXPR='(.args | if has("cmd") then .cmd elif has("command") then .command else "" end)'

# === Session info ===
SESSION_INFO=$(jq -s -c '
  {
    session_id: (first(.[] | select(.session_id != null and .session_id != "") | .session_id) // "unknown"),
    runtime: (first(.[] | select(.runtime != null and .runtime != "") | .runtime) // "unknown"),
    models: ([.[] | select(.model != null and .model != "") | .model] | unique | join(", ")),
    cwds: ([.[] | select(.cwd != null and .cwd != "") | .cwd] | unique),
    agents: ([.[] | select(.agent != null and .agent != "") | .agent] | unique | join(", "))
  }
' "$EVENTS_FILE" 2>/dev/null)
# Ensure valid JSON — fallback to null if empty
if [ -z "$SESSION_INFO" ] || [ "$SESSION_INFO" = "null" ]; then
  SESSION_INFO='{"session_id":"unknown","runtime":"unknown","models":"","cwds":[]}'
fi

# === Summary ===
SUMMARY=$(jq -s -c --arg cmd "$CMD_EXPR" '
  def get_cmd: '"$CMD_EXPR"';
  [ .[] | select(.event == "tool.complete" or .event == "tool.call") ] as $calls |
  [ .[] | select(.event == "tool.result") ] as $results |
  {
    total_events: length,
    tool_calls: ($calls | length),
    tool_results: ($results | length),
    unique_tools: ([$calls[] | .tool] | unique | sort),
      unique_files_accessed: (
      [$calls[] |
        if .tool == "read" or .tool == "edit" or .tool == "write" then
          ((.args | if has("filePath") then .filePath elif has("file_path") then .file_path else null end) // empty)
        elif .tool == "bash" then
          (get_cmd | capture("^\\s*(?:cat|bat|nl|wc|file|stat|head|tail)\\s+(?:-[^\\s]+\\s+)*(?<path>/[^\\s;|&]+)")? // null) as $pread |
          (get_cmd | capture("^\\s*sed\\s+(?:-[^\\s]+\\s+)*\\S+\\s+(?<path>/[^\\s;|&]+)")? // null) as $sed |
          if $pread then $pread.path elif $sed then $sed.path else empty end
        else empty end
      ] | unique | length
    ),
    search_count: (
      [$calls[] |
        if .tool == "grep" or .tool == "search" then true
        elif .tool == "bash" then (get_cmd | test("^\\s*(grep|rg|ag|ack)\\s"))
        else false end
      ] | map(select(.)) | length
    ),
    edit_count: (
      [$calls[] |
        if .tool == "edit" or .tool == "write" then true
        elif .tool == "bash" then (get_cmd | test("^\\s*(sed\\s+-i|patch|echo\\s+.*>|printf\\s+.*>)"))
        else false end
      ] | map(select(.)) | length
    )
  }
' "$EVENTS_FILE" 2>/dev/null || echo '{"error":"summary failed"}')

# === Files ===
FILES=$(jq -s -c --arg cmd "$CMD_EXPR" '
  def get_cmd: '"$CMD_EXPR"';
  [ .[] | select(.event == "tool.complete" or .event == "tool.call") |
    if .tool == "read" then
      ((.args | if has("filePath") then .filePath elif has("file_path") then .file_path else null end) // null) as $fp |
      if $fp then { file: $fp, op: "read", coverage: "full" } else empty end
    elif .tool == "edit" then
      ((.args | if has("filePath") then .filePath elif has("file_path") then .file_path else null end) // null) as $fp |
      if $fp then { file: $fp, op: "edit", coverage: "full" } else empty end
    elif .tool == "bash" then
      get_cmd as $c |
      if $c == "" then empty
      else
        ($c | capture("^\\s*(?:cat|bat|nl|wc|file|stat)\\s+(?:-[^\\s]+\\s+)*(?<path>/[^\\s;|&]+)")? // null) as $full |
        ($c | capture("^\\s*(?:head|tail)\\s+(?:-[^\\s]+\\s+)*(?<path>/[^\\s;|&]+)")? // null) as $part |
        ($c | capture("^\\s*(?:sed)\\s+(?:-[^\\s]+\\s+)*\\S+\\s+(?<path>/[^\\s;|&]+)")? // null) as $sed |
        ($c | capture("^\\s*(?:grep|rg|ag|ack)\\s+(?:-[^\\s]+\\s+)*(?:\"[^\"]*\"|\\S+)\\s+(?<path>/[^\\s;|&]+)")? // null) as $search |
        if $full then { file: $full.path, op: "read", coverage: "full" }
        elif $part then { file: $part.path, op: "read", coverage: "partial" }
        elif $sed then { file: $sed.path, op: "read", coverage: "partial" }
        elif $search then { file: $search.path, op: "search", coverage: "partial" }
        else empty end
      end
    else empty end
  ] |
  group_by(.file) |
  map({
    file: .[0].file,
    ops: ([.[] | .op] | unique | join(", ")),
    coverage: (
      if ([.[] | .coverage] | index("full")) then "full"
      elif ([.[] | .coverage] | index("partial")) then "partial"
      else "unknown" end
    ),
    access_count: length
  }) |
  sort_by(.file)
' "$EVENTS_FILE" 2>/dev/null || echo '[]')

# === Search keywords ===
SEARCH_KEYWORDS=$(jq -s -c --arg cmd "$CMD_EXPR" '
  def get_cmd: '"$CMD_EXPR"';
  [ .[] | select(.event == "tool.complete" or .event == "tool.call") |
    if .tool == "bash" then
      get_cmd |
      capture("^\\s*(?:grep|rg|ag|ack)\\s+(?:-[^\\s]+\\s+)*(?<pattern>(?:\"[^\"]*\")|\\S+)")? |
      { term: .pattern, tool: "bash(grep)" }
    elif .tool == "grep" then
      { term: (.args.pattern // .args.query // "unknown"), tool: "grep" }
    elif .tool == "glob" then
      { term: (.args.pattern // .args.query // "unknown"), tool: "glob" }
    else empty end
  ] |
  group_by(.term) |
  map({
    term: .[0].term,
    tool: ([.[] | .tool] | unique | join(", ")),
    count: length
  }) |
  sort_by(-.count)
' "$EVENTS_FILE" 2>/dev/null || echo '[]')

# === Timeline ===
TIMELINE=$(jq -s -c --arg cmd "$CMD_EXPR" '
  def get_cmd: '"$CMD_EXPR"';
  [ .[] | select(.event == "tool.complete" or .event == "tool.call") |
    {
      time: .timestamp,
      tool: (.tool // "?"),
      summary: (
        if .tool == "bash" then get_cmd[0:120]
        elif .tool == "read" then "read " + ((.args | if has("filePath") then .filePath else "?" end))
        elif .tool == "edit" then "edit " + ((.args | if has("filePath") then .filePath else "?" end))
        elif .tool == "grep" or .tool == "glob" then .tool + " " + (.args.pattern // .args.query // get_cmd // "")
        elif .tool == "task" then "sub-agent(" + (((.args.target // (.args.targets // [null]) | if type == "array" then .[0] else . end) // "")[0:30]) + ")"
        elif .tool == "goal" then "goal: " + ((.args.objective // "")[0:80])
        else .tool + " " + ([.args | to_entries[] | "\(.key)=\(.value)"][0:1] | join("; "))[0:80]
        end
      )
    }
  ] | sort_by(.time)
' "$EVENTS_FILE" 2>/dev/null || echo '[]')

# === Guard: convert empty strings to valid JSON nulls/empty arrays ===
[ -z "$SESSION_INFO" ] && SESSION_INFO='{"session_id":"unknown","runtime":"unknown","models":"","cwds":[]}'
[ -z "$SUMMARY" ] && SUMMARY='{"total_events":0,"tool_calls":0,"tool_results":0,"unique_tools":[],"unique_files_accessed":0,"search_count":0,"edit_count":0}'
[ -z "$FILES" ] && FILES='[]'
[ -z "$SEARCH_KEYWORDS" ] && SEARCH_KEYWORDS='[]'
[ -z "$TIMELINE" ] && TIMELINE='[]'

# === Assemble final JSON ===
jq -n -c \
  --arg source_file "$EVENTS_FILE" \
  --argjson session_info "$SESSION_INFO" \
  --argjson summary "$SUMMARY" \
  --argjson files "$FILES" \
  --argjson search_keywords "$SEARCH_KEYWORDS" \
  --argjson timeline "$TIMELINE" \
  '{
    source_file: $source_file,
    analyzed_at: (now | strftime("%Y-%m-%dT%H:%M:%SZ")),
    session_info: $session_info,
    summary: $summary,
    files: $files,
    search_keywords: $search_keywords,
    timeline: $timeline,
    event_count: ($summary.total_events // 0)
  }'
