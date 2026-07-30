---
name: agent-interception
description: Discover, parse, and analyze agent session logs from OpenCode and Codex CLI. Produces a structured Markdown evidence report with file reads (coverage depth), operation types, search keywords, and tool call timelines. Use when asked to collect evidence, audit agent behavior, investigate what happened in a session, or extract tool traces from past conversations.
---

# Agent Interception

Collect evidence of agent behavior from OpenCode and Codex CLI sessions. Given a session reference or date range, discovers available logs, extracts normalized tool-call events, and produces a structured evidence report.

## When to use

Triggers: "collect evidence from agent conversations", "show me what the agent did", "audit this session", "what files did the agent read", "analyze agent behavior", "investigate session", "forensics for agent session", "extract tool traces".

## Operating rules

- This skill inspects logs already on disk. It does not install live hooks or plugins unless `--setup` is passed.
- Always check `~/.codex/sessions/` and `spinosa export` availability before picking a source path.
- Runtime-detection order: OpenCode export (if available) → Codex rollout files → Spinosa session metrics.
- Normalize tool names to the unified schema (OpenCode tool names are canonical; Codex `exec_command` → `bash`).
- Label all coverage estimates as heuristic. Never claim exact % without deterministic evidence.
- Tag every finding with source runtime (`opencode` / `codex`) and confidence (`exact` / `heuristic`).

## Workflow

### 1. Identify target sessions

Ask or derive the target:
- "what happened in the last session" → pick the most recent log
- "evidence from yesterday's sessions" → filter by date
- "analyze session X" → use explicit session ID or rollout path
- "what happened across this project" → filter Codex rollouts by `cwd` field (`session_meta` record)

### 2. Discover logs

Open `references/source-discovery.md` for log locations and discovery commands for each runtime.

For Codex rollouts:
```
~/.codex/sessions/YYYY/MM/DD/rollout-<ISO8601>-<UUID>.jsonl
```

For OpenCode exports:
```bash
spinosa export <session_id> 2>/dev/null
```

### 3. Extract normalized events

For Codex JSONL rollouts, use `scripts/extract-codex.sh`:
```bash
bash ~/.agents/skills/agent-interception/scripts/extract-codex.sh \
  ~/.codex/sessions/2026/06/26/rollout-*.jsonl \
  > /tmp/agent-events.jsonl
```

For OpenCode, use `scripts/extract-opencode.sh`:
```bash
spinosa export <session_id> 2>/dev/null \
  | bash ~/.agents/skills/agent-interception/scripts/extract-opencode.sh \
  > /tmp/agent-events.jsonl
```

Extraction produces JSONL with the unified schema (see `references/log-parsing.md`).

### 4. Analyze events

Run `scripts/analyze-events.sh` on the normalized JSONL:
```bash
bash ~/.agents/skills/agent-interception/scripts/analyze-events.sh \
  /tmp/agent-events.jsonl \
  > /tmp/agent-analysis.json
```

The analysis JSON contains:
- `summary` — totals by operation type
- `files` — file access list with coverage estimates
- `search_keywords` — grep/glob terms with hit counts
- `timeline` — chronological tool call sequence
- `session_info` — runtime, model, cwd, estimated cost

### 5. Build evidence report

Open `references/evidence-report-template.md` and populate each section from the analysis JSON.

If the analysis is small (<50 events), build the report inline. For larger sessions, summarize top-K entries per section and note tail counts.

### 6. Deliver

Write the report to `agent_reports/evidence-<session_id>.md` (or a path of the user's choice). State:
- Which logs were inspected (paths)
- Which runtime
- Any gaps (incomplete data, unparseable lines, missing outputs)

## References

- `references/source-discovery.md` — Log locations and discovery for each runtime
- `references/log-parsing.md` — JSONL structures, jq extraction patterns, unified schema
- `references/file-read-analysis.md` — File read detection + coverage heuristics
- `references/operation-classification.md` — Tool-to-category mapping table
- `references/evidence-report-template.md` — Markdown report template
