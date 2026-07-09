#!/usr/bin/env bash
# Extract normalized tool events from Codex CLI JSONL rollout files.
# Usage: extract-codex.sh <rollout1.jsonl> [rollout2.jsonl ...]
#
# Reads session_meta for cwd/model, pairs function_call + function_call_output
# by call_id, and outputs normalized JSONL per the unified event schema.
set -euo pipefail

ROLLOUTS=("$@")
if [ ${#ROLLOUTS[@]} -eq 0 ]; then
  echo "Usage: extract-codex.sh <rollout1.jsonl> [rollout2.jsonl ...]" >&2
  exit 1
fi

for ROLLOUT in "${ROLLOUTS[@]}"; do
  if [ ! -f "$ROLLOUT" ]; then
    echo "File not found: $ROLLOUT" >&2
    continue
  fi

  # Extract session id from rollout filename
  SESSION_ID=$(basename "$ROLLOUT" | sed 's/rollout-//;s/\.jsonl//')

  # Extract cwd and model from session_meta record
  META_CWD=$(jq -r 'select(.type == "session_meta") | .payload.cwd // ""' "$ROLLOUT" 2>/dev/null | head -1)
  META_MODEL=$(jq -r 'select(.type == "session_meta") | .payload.model_provider // ""' "$ROLLOUT" 2>/dev/null | head -1)

  # First pass: collect all response_items and group by call_id
  # Emit paired call+result events
  jq -c -s --arg sid "$SESSION_ID" --arg cwd "$META_CWD" --arg model "$META_MODEL" '
    [ .[] | select(.type == "response_item") ] |
    group_by(.payload.call_id) |
    .[] |
    if length == 2 and
       (.[0].payload.type == "function_call" and .[1].payload.type == "function_call_output") then
      # Normalize tool name
      ((if .[0].payload.name == "exec_command" then "bash"
        elif .[0].payload.name == "spawn_agent" then "task"
        elif .[0].payload.name == "wait_agent" then "task"
        elif .[0].payload.name == "close_agent" then "task"
        elif .[0].payload.name == "create_goal" then "goal"
        else .[0].payload.name end)) as $tool |
      # Normalize args (handle double-encoded JSON for exec_command)
      ((if .[0].payload.name == "exec_command" then
          (.[0].payload.arguments | fromjson)
        else
          (.[0].payload.arguments | if type == "string" then fromjson else . end)
        end)) as $args |
      {
        timestamp: .[0].timestamp,
        runtime: "codex",
        session_id: $sid,
        call_id: .[0].payload.call_id,
        event: "tool.complete",
        tool: $tool,
        tool_raw: .[0].payload.name,
        args: $args,
        output: .[1].payload.output,
        cwd: ($cwd // ""),
        model: ($model // "")
      }
    elif length == 1 and .[0].payload.type == "function_call" then
      ((if .[0].payload.name == "exec_command" then "bash"
        elif .[0].payload.name == "spawn_agent" then "task"
        elif .[0].payload.name == "wait_agent" then "task"
        elif .[0].payload.name == "close_agent" then "task"
        elif .[0].payload.name == "create_goal" then "goal"
        else .[0].payload.name end)) as $tool |
      ((if .[0].payload.name == "exec_command" then
          (.[0].payload.arguments | fromjson)
        else
          (.[0].payload.arguments | if type == "string" then fromjson else . end)
        end)) as $args |
      {
        timestamp: .[0].timestamp,
        runtime: "codex",
        session_id: $sid,
        call_id: .[0].payload.call_id,
        event: "tool.call",
        tool: $tool,
        tool_raw: .[0].payload.name,
        args: $args,
        output: null,
        cwd: ($cwd // ""),
        model: ($model // "")
      }
    elif length == 1 and .[0].payload.type == "function_call_output" then
      {
        timestamp: .[0].timestamp,
        runtime: "codex",
        session_id: $sid,
        call_id: .[0].payload.call_id,
        event: "tool.result",
        tool: null,
        tool_raw: null,
        args: null,
        output: .[0].payload.output,
        cwd: ($cwd // ""),
        model: ($model // "")
      }
    else empty end
  ' "$ROLLOUT"
done
