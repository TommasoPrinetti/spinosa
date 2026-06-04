---
type: request_log
role: request_routing_log
purpose: record user prompts and the file or route outcome
description:
  - Append-only routing log for user prompts and traceability summaries.
  - Agents update this with route, status, and output after each orchestrated request.
scope: framework_and_research_requests
connects_to:
  - AGENTS.md
  - agent_reports/
created: 2026-05-26
updated: 2026-05-26
---

# User Requests

Short routing log for user prompts. Log the request before deciding whether to answer directly or route through sub-agents.

| Date | Request summary | Route | Status | Output |
|---|---|---|---|---|
