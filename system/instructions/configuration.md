---
type: configuration
agent: setup_cli
description:
  - Operating profile for the current Pilosa project or framework template.
  - Agents read this first to learn source policy, protected paths, and setup status.
created: 2026-05-26
updated: 2026-06-03
setup_status: cli_started
---

# Configuration

Agents read this before major work.

```yaml
zone_type: research_framework
research_mode: evolving_complex_corpus
root_vault_path: "[path]"
root_vault_mode: protected_append_only

source_policy: internal_first
active_corpus_path: raw/
active_corpus_policy: raw_zone_first_after_onboarding
external_sources_allowed: no

claim_standard: source_link_required
l2_policy: verifier_required

protected_paths:
  - "[path]"
  - context.md

stale_after_days: 30
preferred_llm_cli: "[cli]"
```

## Notes

- This is a framework template. `bash .bin/onboard.sh` fills project-specific values.
- Root Vault files remain immutable original storage. Normal source-grounded work starts from `raw/` after onboarding.
- External source policy stays `no` until the researcher explicitly requests external intake.
- When setup_status reaches `zone_started`, the startup workflow has built the master dictionary, generated YAML headers, created detailed maps in `maps/`, and passed validation.
- This file never grants permission to edit the Root Vault.
