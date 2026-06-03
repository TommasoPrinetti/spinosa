---
type: zone_configuration
agent: startup_agent
created: 2026-06-03
updated: 2026-06-03
setup_status: zone_started
---

# Zone Configuration

Agents read this before major work.

```yaml
zone_type: research_framework
research_mode: evolving_complex_corpus
root_vault_path: "/Users/tommasoprinetti/Library/CloudStorage/GoogleDrive-tommaso.prinetti@sciencespo.fr/.shortcut-targets-by-id/1P14RD4yjJ7e6dP5xt71IVDEtfZiQuukc/EL2MP/EVOLUTION - ROOTVAULT"
root_vault_mode: protected_append_only

source_policy: internal_first
active_corpus_path: raw/
active_corpus_policy: raw_zone_first_after_onboarding
external_sources_allowed: no
external_logs:
  - 03_logs/external_queries.md
  - 03_logs/source_intake_log.md

claim_standard: source_link_required
l2_policy: checker_required

protected_paths:
  - "/Users/tommasoprinetti/Library/CloudStorage/GoogleDrive-tommaso.prinetti@sciencespo.fr/.shortcut-targets-by-id/1P14RD4yjJ7e6dP5xt71IVDEtfZiQuukc/EL2MP/EVOLUTION - ROOTVAULT"
  - INFORMATIONS.md

stale_after_days: 30
preferred_llm_cli: "OpenCode"
```

## Notes
- Startup translated the CLI setup draft and inferred working scope from the active raw corpus.
- The Root Vault remains immutable original storage; normal source-grounded work starts from raw/.
- External source policy stays `no` until the researcher explicitly requests external intake.
- `raw/INDEX.md` remains a source document and does not override the live corpus coverage calculated in `zone_index.md`.
- When setup_status is `zone_started`, the dictionary, raw copy headers, navigation maps, concept maps, and retrieval tests have been completed for the current corpus snapshot.
