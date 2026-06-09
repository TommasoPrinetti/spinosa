---
type: request_log
role: request_routing_log
scope: framework_and_research_requests
purpose: record user prompts and the file or route outcome
description:
  - Append-only routing log for user prompts and traceability summaries.
  - Agents update this with route, status, and output after each orchestrated request
connects_to:
  - AGENTS.md
  - agent_reports/
created: 2026-05-26
updated: 2026-05-26
---
# User Requests

Short routing log for user prompts. Log the request before deciding whether to answer directly or route through sub-agents.

| Date       | Request summary                     | Route     | Status | Output                                 |
| ---------- | ----------------------------------- | --------- | ------ | -------------------------------------- |

| 2026-06-05 | Thoroughly audit the Pilosa framework structure (YAML frontmatter, links, content, missing AGENTS.md, framework-files.tsv) | verification | done | audit report at agent_reports/01_framework_audit_report.md — 14 issues found across 27 files |
| 2026-06-07 | Test RapidOCR on test vault, replace Florence-2 | fast_path | done | RapidOCR implemented and tested on images and PDFs |
| 2026-06-08 | Cross-platform audit of all shell scripts for macOS/Linux/Windows compatibility | evidence_answer | done | report returned with verifier pass |
| 2026-06-09 | Review /Font grep heuristic for PDF text vs scanned classification | verification | done | report at agent_reports/03_pdf_heuristic_review.md — ADEQUATE WITH MITIGATIONS, tiered pipeline recommended |
| 2026-06-09 | Critical review of MarkItDown integration plan for .bin/pilosa (signal handlers, counters, race conditions, scope) | fast_path | done | report at agent_reports/markitdown-integration-review.md — 5 issues found, 2 HIGH severity |
