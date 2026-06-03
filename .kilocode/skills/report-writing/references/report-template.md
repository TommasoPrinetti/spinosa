# Report Template

Write ONE clean report in `05_agent_reports/` using this structure:

```markdown
---
type: report
created: YYYY-MM-DD
updated: YYYY-MM-DD
status: draft
---

# [Report Title]

## Answer
[Short direct answer to the original request]

## Evidence
[Quotes and source references using verbatim format]

## Analysis
[Interpretation, patterns, connections]

## Limitations
[Gaps, uncertainties, what was not checked]
```

Rules:
- Answer the original request, not a broader invented task.
- Use only material supplied by Searcher or already in context.
- Separate completed, partial, and unresolved items if any branch failed.
- Keep concise unless the user asked for depth.
- Verifier will verify and correct in-place — do not mark claims verified yourself.
