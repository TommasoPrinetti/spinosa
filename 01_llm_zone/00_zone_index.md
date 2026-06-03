---
type: zone_index
role: zone_master_index
purpose: [map the whole LLM Zone and point to the main retrieval layers]
scope: [all of 01_llm_zone]
connects_to:
  - 01_llm_zone/00_dictionary.md
  - 01_llm_zone/01_metadata/HEADER_TEMPLATE.md
  - 01_llm_zone/maps/00_map_overview.md
evidence_type: processed
evidence_level: L1
generated_by: startup_agent
generated_at: 2026-06-03
processing_status: machine_generated
created: 2026-06-03
updated: 2026-06-03
---

# LLM Zone — Master Index

## Structure

```
01_llm_zone/
  00_zone_index.md
  00_dictionary.md
  01_metadata/
  maps/
  raw/
```

## Central Maps

- Entry point: [[maps/00_map_overview]]
- Repository reference: [[maps/01_repo_reference_map]]
- Participant index: [[maps/06_participant_index_map]]
- Unresolved metadata: [[maps/07_unresolved_metadata_map]]
- Exercise maps: 17 generated (`20_ex_0_pre_sessions_interviews_map.md, 21_ex_1_draw_it_like_you_see_it_map.md, 22_ex_10_the_art_of_the_prompt_map.md, 23_ex_11_tracking_shifts_map.md...`)
- Concept maps: 6 generated

## Source Coverage

| Source type | Count | Last updated |
|---|---:|---|
| Markdown raw copies | 928 | 2026-06-03 |
| JSON diarization sidecars | 32 | 2026-06-03 |
| Processing logs | 1 | 2026-06-03 |
| Total copied text files | 961 | 2026-06-03 |

## Pointer Record Coverage

| Media type | Pointer records | Processing status |
|---|---:|---|
| image | 1104 | pointer_only_pending |
| video | 52 | pointer_only_pending |
| audio | 84 | pointer_only_pending |
| pdf | 0 | pointer_only_pending |
| unknown | 1 | pointer_only_pending |

## Dictionary Status

| Category | Count | Last updated |
|---|---:|---|
| Canonical names | 50 | 2026-06-03 |
| Canonical places | 4 | 2026-06-03 |
| Canonical organizations | 7 | 2026-06-03 |
| Canonical concepts | 6 | 2026-06-03 |
| Domain terms | 8 | 2026-06-03 |

## Active Concept Maps

| Concept | Raw copies | Tags | Map quality | Last updated |
|---|---:|---|---|---|
| LLM Representation and Relationships | 631 | llm, ai, chatgpt | machine_generated | 2026-06-03 |
| Prompting and Instruction Design | 314 | prompt, instruction, writing instructions | machine_generated | 2026-06-03 |
| Evaluation, Judgment, and Evidence | 364 | judgment, evidence, fairness | machine_generated | 2026-06-03 |
| Control, Alignment, and Obstacles | 160 | control, alignment, obstacle | machine_generated | 2026-06-03 |
| Vademecum Reflection and Exemplary Work | 376 | vademecum, example, path | machine_generated | 2026-06-03 |
| Tasks, Conversations, and Comparative Practice | 626 | task, conversation | machine_generated | 2026-06-03 |

## Non-Text Files in Root Vault

Files that cannot be copied remain pointer-only and are retrieved through source pointer records and the exercise maps.

| File type | Count | Notes |
|---|---:|---|
| scan images | 1104 | includes worksheet scans and session photographs |
| audio | 84 | pointer-only until ASR or transcript refresh |
| video | 52 | pointer-only until transcript or annotation pass |
| unknown | 1 | includes backup / unsupported files retained as pointers |

## Coverage Status

- Files with valid raw markdown headers: 928
- Central maps created: 27
- Concept maps created: 6
- Unresolved dates: 854
- Unresolved people or identities: 2
- Known gaps: non-markdown JSON sidecars remain unheadered but are linked in exercise maps; raw/INDEX.md is a legacy source document and not a live coverage ledger.
