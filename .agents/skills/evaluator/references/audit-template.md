# Route Audit Template

```markdown
---
type: route_audit
created: YYYY-MM-DD
updated: YYYY-MM-DD
status: pass | pass_with_findings | blocked
session_id: YYYYMMDD-HHMMSS-route
route: fast_path | non-fast-path
decision: no_edit | edit_recommended
goal_artifact: agent_reports/NN_goal.md
phase_a_terminal_artifact: agent_reports/NN_answer.md | agent_reports/cleanup_report.md | other artifact path
---

# Route Audit: [short title]

## Route Summary
- Prompt: [one-sentence cleaned prompt]
- Route: [fast_path | non-fast-path]
- Goal artifact: [path]
- Frozen chain: [Phase A sequence]
- Verifier outcome: [pass | pass_with_corrections | partial | fail | not_applicable]

## Findings
- What worked:
  - [concrete process success]
- What did not work:
  - [concrete process weakness]

## Signal Review
- Trigger types: [integrity_issue, sequence_issue, ...]
- Metrics used: [short summary of counts or route observations]
- Evidence for the finding: [short grounded rationale]

## Decision
- Verdict: `no_edit` | `edit_recommended`
- Why: [one short paragraph]

## Proposed Evolution
- Target files: [paths or `none`]
- Smallest safe change: [concise implementation target]
- Expected effect on future requests: [concise]

## Validation Notes
- Required next validation: [static checks, targeted dry run, or `none`]
- Current route impact: applies to future requests only
```
