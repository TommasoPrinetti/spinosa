---
description: JSONL structures for OpenCode exports and Codex rollout logs, jq extraction patterns, and the unified event schema.
---

# Log Parsing

## Unified Event Schema

All events are normalized to this shape:

```json
{
  "timestamp": "2026-06-26T10:15:32.134Z",
  "runtime": "codex",
  "session_id": "019cb46d-...",
  "call_id": "call_abc123",
  "turn_id": "turn-1",
  "event": "tool.call",
  "tool": "bash",
  "tool_raw": "exec_command",
  "args": { "command": "ls -la" },
  "output": null,
  "cwd": "/path/to/project",
  "model": "o4-mini",
  "files_accessed": ["/path/to/project"],
  "file_operation": "list",
  "tokens_input": null,
  "tokens_output": null
}
```

For `tool.result` events, `output` is populated and `event` becomes `"tool.result"`.

---

## Codex JSONL Rollout

### Record types

| `type` | Contains |
|--------|----------|
| `session_meta` | Session identity, model provider, CLI version, cwd, git info |
| `turn_context` | Per-turn model + approval mode |
| `response_item` | Messages, tool calls (`function_call`), tool outputs (`function_call_output`) |
| `event_msg` | Token counts, task start/end, agent reasoning |
| `input_item` | User prompts |
| `config_snapshot` | Permission profile, sandbox settings |

### Extracting tool calls

Tool calls are `response_item` records with `payload.type == "function_call"`:

```bash
# Extract all calls as normalized events
jq -c '
  select(.type == "response_item" and .payload.type == "function_call")
  | {
    timestamp,
    runtime: "codex",
    session_id: (input_filename | capture("rollout-(?<id>[^.]+)") | .id // "unknown"),
    call_id: .payload.call_id,
    event: "tool.call",
    tool: (if .payload.name == "exec_command" then "bash"
           elif .payload.name == "spawn_agent" then "task"
           elif .payload.name == "wait_agent" then "task"
           elif .payload.name == "close_agent" then "task"
           else .payload.name end),
    tool_raw: .payload.name,
    args: (if .payload.name == "exec_command" then
             (.payload.arguments | fromjson)
           else
             (.payload.arguments | if type == "string" then fromjson else . end)
           end),
    output: null,
    turn_id: null
  }
' rollout-*.jsonl
```

**Important**: `arguments` is a JSON-encoded string for `exec_command`. Double-parse required.

### Extracting tool outputs

`response_item` with `payload.type == "function_call_output"`:

```bash
# Extract outputs
jq -c '
  select(.type == "response_item" and .payload.type == "function_call_output")
  | {
    timestamp,
    runtime: "codex",
    session_id: "unknown",
    call_id: .payload.call_id,
    event: "tool.result",
    tool: null,
    tool_raw: null,
    args: null,
    output: .payload.output,
    turn_id: null
  }
' rollout-*.jsonl
```

### Pairing calls with outputs

Calls and outputs share `call_id`. Use the script `scripts/extract-codex.sh` for paired extraction, or jq in two-pass:

```bash
# Full timeline (pairs by call_id, drops orphans)
jq -s -c '
  [ .[] | select(.type == "response_item") ] |
  group_by(.payload.call_id) |
  .[] |
  select(length == 2) |
  {
    timestamp: .[0].timestamp,
    runtime: "codex",
    call_id: .[0].payload.call_id,
    event: "tool.complete",
    tool: (if .[0].payload.name == "exec_command" then "bash"
           elif .[0].payload.name == "spawn_agent" then "task"
           else .[0].payload.name end),
    args: (.[0].payload.arguments | fromjson),
    output: .[1].payload.output
  }
' rollout-*.jsonl
```

### Extracting token counts

`event_msg` records with `payload.event == "tool_action_done"` contain usage info:

```bash
jq -c 'select(.type == "event_msg" and .payload.event == "tool_action_done") |
  { timestamp, tokens_input: .payload.input_tokens, tokens_output: .payload.output_tokens }'
```

---

## OpenCode Export JSON

### Structure (OpenCode >=1.17.x)

OpenCode exports produce a JSON object:

```json
{
  "info": {
    "id": "ses_...",
    "slug": "...",
    "directory": "/path/to/project",
    "title": "...",
    "agent": "build",
    "model": {"id": "deepseek-v4-flash-free", "providerID": "opencode", ...},
    "version": "1.17.11",
    "cost": 0,
    "tokens": {"input": 245746, "output": 40684, ...}
  },
  "messages": [
    {
      "info": {"role": "user|assistant", "agent": "plan|build", "model": {...}, "id": "msg_..."},
      "parts": [
        {"type": "tool", "tool": "read", "callID": "call_00_...", "state": {"status": "completed", "input": {...}, "output": "..."}},
        {"type": "step-finish", "tokens": {...}, "cost": 0, "reason": "tool-calls"}
      ]
    }
  ]
}
```

### Part types

| Part type | Purpose |
|-----------|---------|
| `tool` | Tool call with embedded state (input + output combined) |
| `text` | Text content (user prompts, assistant messages) |
| `reasoning` | Model reasoning traces |
| `step-start` | Step lifecycle start |
| `step-finish` | Step lifecycle end with token counts and cost |
| `tool` parts have: `tool` (name), `callID`, `state` (`status`, `input`, `output`, `metadata`, `time`) |

### Extract tool events

Use `scripts/extract-opencode.sh` (recommended), or manually:

```bash
# Extract all tool calls with their results
jq -c '
  .info as $info |
  .messages[] |
  .parts[] |
  select(.type == "tool") |
  .state as $st |
  {
    timestamp: (if $st.time then ($st.time.start / 1000 | strftime("%Y-%m-%dT%H:%M:%SZ")) else now end),
    runtime: "opencode",
    session_id: $info.id,
    call_id: .callID,
    event: (if $st.status == "error" then "tool.error" else "tool.complete" end),
    tool: .tool,
    args: $st.input,
    output: $st.output,
    model: $info.model.id
  }
' session-export.json
```

### Extract token usage

```bash
# Extract step-finish parts for token/cost data
jq -c '
  .messages[] |
  .parts[] |
  select(.type == "step-finish") |
  {tokens: .tokens, cost: .cost, reason: .reason}
' session-export.json
```

---

## Spinosa metrics TSV

Legacy per-agent summaries may live in `.logs/session_metrics.tsv` (post-v0.7.6) or `.spinosa/archive/session_metrics_*.tsv` (pre-memory migration). Parse with:

```bash
# Extract agent operations for a session (try .logs first, then archive)
metrics=".logs/session_metrics.tsv"
[[ -f "$metrics" ]] || metrics="$(ls -t .spinosa/archive/session_metrics_*.tsv 2>/dev/null | head -1)"
awk -F'\t' -v session="20260626-113623" '$2 ~ session' "$metrics"
```
