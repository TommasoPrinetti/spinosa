---
type: project_configuration
agent: startup
scope: project_configuration
description:
  - Operating profile for the current Pilosa project or framework template.
  - Agents read this first to learn source policy, protected paths, and setup status.
created: 2026-06-03
updated: 2026-06-04
setup_status: not_started
---

# Configuration

Agents read this before major work.

```yaml
workspace_type: research_framework
research_mode: evolving_complex_corpus
source_location: "[filled by CLI onboarding]"
source_mode: protected_append_only

source_policy: internal_first
active_corpus_path: raw/
active_corpus_policy: raw_first_after_onboarding
external_sources_allowed: no

claim_standard: source_link_required
l2_policy: verifier_required

protected_paths:
  - "[source_location from above]"
  - context.md

stale_after_days: 30
preferred_llm_cli: "[filled by CLI onboarding]"
```

## Notes
- This file is initialized by the CLI fast setup and completed by startup.
- The CLI collects: project name, source location, and preferred LLM CLI. It scans the source location and transposes accepted files (text, native, PDF) into raw/. Images, video, audio, and AGENTS.md control files are skipped.
- After onboarding, the source location remains immutable original storage. Normal source-grounded work starts from raw/.
- During startup, project description and helpful artifact URLs are optional. If absent, the LLM CLI agent records them as not provided, keeps external_sources_allowed at its default `no`, and infers working scope from the raw corpus.
- When setup_status reaches workspace_started, the startup workflow has built the master dictionary, created multi-level navigation maps in maps/, and passed validation.
- This file never grants permission to edit the source location or `raw/`.
