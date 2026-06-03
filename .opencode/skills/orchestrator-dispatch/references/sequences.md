# Default Sequences

Default shapes are guidance. You may deviate at runtime. Every non-fast-path response is a sequence (length >= 1).

Zone startup is a one-time operation handled by the orchestrator reading `00_system/instructions/STARTUP.md` directly — not through a skill injection.

| Class | Default Sequence | Skill to inject |
|---|---|---|
| `fast_path` | (none — answer directly) | — |
| `clarify_search` | skip (or Navigator if term disambiguation needed) | `source-intake` (if needed) |
| `find_material` | Navigator → Checker | `source-intake` → `claim-verification` |
| `evidence_answer` | Navigator → Packer → Checker | `source-intake` → `report-writing` → `claim-verification` |
| `synthesis_report` | Navigator ×N → Packer → Checker | `source-intake` ×N → `report-writing` → `claim-verification` |
| `verification` | Checker | `claim-verification` |
| `index_maintenance` | Navigator (if search) → Checker | `source-intake` → `claim-verification` |
| `cleanup` | Cleaner | `zone-cleanup` |
