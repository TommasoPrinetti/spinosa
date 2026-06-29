#!/usr/bin/env bash
# Extract normalized tool events from OpenCode export JSON (stdin).
# Usage: opencode export <session_id> | extract-opencode.sh
#
# Handles OpenCode >=1.17.x export format:
#   { info: {...}, messages: [{ info: {role, agent, model, ...}, parts: [...] }] }
# Each tool part has: type="tool", tool=<name>, callID=<id>, state={status, input, output}
# Step-finish parts contain token usage and cost.
set -euo pipefail

jq -c '
  # Extract session-level metadata from .info
  .info as $session_info |
  .messages[] |
  # Extract per-message agent identity
  .info as $msg_info |
  .parts[] |
  if .type == "tool" then
    # Tool call with embedded state
    (.state // {}) as $st |
    {
      timestamp: (if $st.time then ($st.time.start / 1000 | strftime("%Y-%m-%dT%H:%M:%SZ")) else now end),
      runtime: "opencode",
      session_id: ($session_info.id // "exported"),
      call_id: .callID,
      event: (if $st.status == "error" then "tool.error" else "tool.complete" end),
      tool: .tool,
      tool_raw: .tool,
      args: ($st.input // null),
      output: ($st.output // null),
      cwd: ($session_info.directory // ""),
      model: (if $session_info.model then ($session_info.model | if type == "object" then (.id // .modelID // "") else . end) else "" end),
      agent: ($msg_info.agent // ""),
      status: ($st.status // ""),
      message_role: ($msg_info.role // "")
    }
  elif .type == "step-finish" then
    {
      timestamp: now,
      runtime: "opencode",
      session_id: ($session_info.id // "exported"),
      call_id: null,
      event: "step.finish",
      tool: null,
      tool_raw: null,
      args: null,
      output: null,
      cwd: ($session_info.directory // ""),
      model: (if $session_info.model then ($session_info.model | if type == "object" then (.id // .modelID // "") else . end) else "" end),
      agent: ($msg_info.agent // ""),
      message_role: ($msg_info.role // ""),
      tokens: .tokens,
      cost: .cost,
      reason: .reason
    }
  else empty end
'
