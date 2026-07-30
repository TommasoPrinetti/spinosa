---
description: Log locations and discovery commands for OpenCode and Codex CLI session logs.
---

# Source Discovery

## OpenCode

### Live session export

```bash
# Export a specific session as JSON
spinosa export <session_id> 2>/dev/null

# Find session IDs from the local database
sqlite3 ~/.local/share/opencode/opencode.db \
  "SELECT id, time_created, directory, title, agent, model
   FROM session ORDER BY time_created DESC LIMIT 10;"

# Redirect to file
spinosa export <session_id> > session-export.json
```

### Plugin capture logs

If the OpenCode capture plugin is installed (`.opencode/plugins/`), events are written to:
```
.spinosa/logs/tool-events.jsonl
.spinosa/logs/step-events.jsonl
```

---

## Codex CLI

### Rollout log location

```
~/.codex/sessions/YYYY/MM/DD/rollout-<ISO8601>-<UUID>.jsonl
```

### Discovery by date

```bash
# All sessions on a specific date
ls ~/.codex/sessions/2026/06/26/*.jsonl

# Sessions in a date range
find ~/.codex/sessions/2026/06/ -name '*.jsonl'

# Most recent session
ls -t ~/.codex/sessions/2026/**/**/*.jsonl | head -1

# Count sessions
find ~/.codex/sessions/ -name '*.jsonl' | wc -l
```

### Discovery by project (cwd)

Each rollout begins with a `session_meta` record containing `payload.cwd`. Filter by project:

```bash
# Find sessions from a specific project
grep -rl '"cwd":"/path/to/workspace"' \
  ~/.codex/sessions/2026/**/**/*.jsonl | head -5
```

### Discovery by model

```bash
# Find sessions using a specific model
grep -rl '"model":"o4-mini"' ~/.codex/sessions/2026/**/**/*.jsonl | head -5
```

---

## Spinosa metrics

The existing Spinosa session metrics may contain summary-level evidence:

```
.logs/session_metrics.tsv              # Legacy workspace location (pre-v0.7.6)
.spinosa/archive/session_metrics_*.tsv  # Archived after memory migration
```

Columns include: `date`, `session_id`, `agent`, `route`, `operation`, `query_label`, `dirs_seen`, `maps_read`, `raw_matches`, `raw_files_read`, `reports_written`, `output_path`.

This is useful for mapping session IDs to agent names and operations, but does not contain per-tool-call detail.

---

## Priority order

| When | Check first | Fallback |
|------|-------------|----------|
| Spinosa project | `.logs/session_metrics.tsv` or `.spinosa/archive/session_metrics_*.tsv`, then Codex rollouts | OpenCode export |
| Recent session | `ls -t ~/.codex/sessions/**/**/*.jsonl \| head -1` | `spinosa export` |
| Date-specific | Codex `~/.codex/sessions/YYYY/MM/DD/` | `spinosa export <session_id>` |
| Generic / unknown | Ask user for session ID or date range | Scan Codex rollouts by recency |
