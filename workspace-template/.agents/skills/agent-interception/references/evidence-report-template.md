---
description: Template for the Markdown evidence report produced by the agent-interception skill.
---

# Evidence Report Template

Populate each section from the analysis JSON produced by `scripts/analyze-events.sh`.

---

```markdown
# Agent Behavior Evidence Report

**Session:** {session_id}
**Runtime:** {runtime}
**Date:** {date}
**Log source:** {paths to logs inspected}
**Generated:** {report generation timestamp}

---

## Summary

| Metric | Value |
|--------|-------|
| Total tool calls | {total_events} |
| Files read | {unique_files_read} |
| Files written/edited | {unique_files_written} |
| Searches performed | {search_count} |
| Commands executed | {command_count} |
| Estimated input tokens | {tokens_input} |
| Estimated output tokens | {tokens_output} |
| Estimated cost | {cost_estimate} |

---

## Files Read (by coverage depth)

{files_table}

### Legend
- **Coverage**: Estimated portion of the file the agent read (heuristic based on command type)
- **Ops**: Which operations touched the file (read, grep, head, cat...)
- **Est tokens**: Approximate tokens read (file_bytes / 4 × coverage_factor)

---

## Search Keywords

| Term | Tool | Matches found |
|------|------|---------------|
{search_rows}

---

## Operations by Type

### Reads ({read_count})
{read_details}

### Searches ({search_count})
{search_details}

### Edits ({edit_count})
{edit_details}

### Other Commands ({command_count})
{command_details}

---

## Timeline (key events)

```
{timeline_rows}
```

---

## Agent Context

- **Model(s) used**: {models}
- **Working directory**: {cwd}
- **Sub-agents spawned**: {sub_agent_count}
- **Turn count**: {turn_count}

---

## Gaps & Limitations

- {gap_1}
- {gap_2}

_Report produced by agent-interception skill (heuristic analysis — coverage estimates are approximate)._
```

---

## file_table row format

```
| {path} | {coverage_pct}% | {ops_summary} | {est_tokens} |
```

## search_rows format

```
| `{term}` | {tool} | {hit_count} |
```

## timeline_rows format (top 30-50)

```
[{time}] [{op_type}] {summary}
```

Example:
```
[10:15:32] [read] src/main.ts (full)
[10:15:35] [search] grep "TODO" src/
[10:15:40] [command] npm run build
[10:16:01] [edit] src/App.tsx (add route handler)
```
