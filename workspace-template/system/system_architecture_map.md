---
type: system_architecture_map
role: framework_map
purpose:
  - show how the orchestrator
  - sub-agents
  - file layers
  - and evidence pipeline connect
description: Architecture map for Spinosa's orchestration, evidence, and output layers.
scope:
  - repo-wide architecture
connects_to:
  - AGENTS.md
  - docs/diagrams.md
  - .agents/agents/
  - system/dictionary.md
  - system/workspace_index.md
created: 2026-05-26
updated: 2026-06-28
status: active
---

# System Architecture Map

> **Full Mermaid diagrams live in [`docs/diagrams.md`](../docs/diagrams.md) — 9 diagrams with GitHub-native rendering.**
> This file is the ASCII/agent reference. See `docs/diagrams.md` for the external-facing versions.

## Core Architecture

Spinosa is a two-layer research framework with a CLI onboarding layer, an agent orchestration layer, and a persistent file-based memory.

```txt
CLI onboarding (spinosa new)
  scans, classifies, converts, imports
  writes system/context.md + system/configuration.md
        |
        v
Workspace (system/, raw/, maps/, agent_reports/)
  indexed corpus with YAML headers, dictionary, navigation maps
        |
        | orchestrator reads user prompt
        | routes to sub-agent chain
        | every chain ends with verifier + evaluator
        v
Answer report (agent_reports/NN_*.md)
  checked against raw/ before finalization
```

## Orchestrator Loop

```txt
1. Log          — Read .spinosa/memory/orchestrator-notes.md
2. Route split  — fast_path (direct) or non-fast-path (orchestrated)
3. Frame        — Write goal artifact agent_reports/g_{session_id}.md
4. Loop:
   a. Dispatch sub-agent with goal + prior artifact paths
   b. Inspect output against gate
   c. Decide: continue / retry / re-route / abort
   d. Loop back to 4a
5. Close:
   a. spinosa-verifier — factual gate (mandatory)
   b. spinosa-evaluator — process gate (mandatory after verifier)
   c. spinosa-evolver — framework fix (only if evaluator recommends)
   d. Deliver — update orchestrator-notes.md
6. Periodic — spinosa-overseer every 5 routes (coverage audit)
```

## Sub-Agent Pipeline

| Agent               | Role                  | Produces                                    |
|---------------------|-----------------------|---------------------------------------------|
| spinosa-searcher    | Evidence retrieval    | evidence_packet_{session_id}.md             |
| spinosa-mapper      | Startup indexing      | extraction_{batch_id}.md, maps/, dictionary |
| spinosa-serendippo  | Hidden connections    | serendipity_{session_id}.md                 |
| spinosa-analyst     | Contextual analysis   | analysis_{session_id}.md                  |
| spinosa-writer      | Report synthesis      | NN_descriptive-name.md                      |
| spinosa-verifier    | Claim verification    | in-place on `NN_*.md` (status + corrections) |
| spinosa-evaluator   | Route audit           | e_{session_id}.md                           |
| spinosa-evolver     | Framework evolution   | changed files summary                       |
| spinosa-janitor     | Hygiene audit         | cleanup artifact                            |
| spinosa-overseer    | Coverage audit        | c_{session_id}.md + Orchestrator Advisories |

## File Layers

```txt
Framework (template — always_replace / replace_if_unmodified via workspace-files.tsv):
  AGENTS.md, startup-prompt.md, .agents/, .bin/, docs/, system/templates

User state (per workspace — never_replace):
  raw/            corpus copies with YAML headers
  maps/           navigation maps (Obsidian wikilink graph)
  system/         context.md, configuration.md, dictionary.md, workspace_index.md
  agent_reports/  all agent output artifacts
  .spinosa/memory/  orchestrator-notes.md
  .trash/         archived intermediates

Operational (hidden):
  .logs/          import/conversion traces (onboarding.log, NDJSON)

Archive (pre-memory-migration):
  .spinosa/archive/  frozen session records migrated from legacy logs/
```

## Setup Lifecycle

```txt
not_started
    |
    | spinosa new (CLI)
    v
cli_started
    |
    | startup-prompt.md (orchestrator)
    |   Phase 1: Verify onboarding
    |   Phase 2: Survey corpus
    |   Phase 3: Extract + build dictionary (parallel mappers)
    |   Phase 4: Write navigation maps
    |   Phase 5: Serendipitous connection discovery
    |   Phase 6: Validate + verifier + evaluator
    v
workspace_started
```

## Key Patterns

- **File-to-file handoff:** Agents pass artifact paths, never inline content. Every step writes a durable file.
- **Adaptive chain:** The orchestrator picks the next agent based on what arrived — no frozen pipeline.
- **Dual gate:** verifier (factual) + evaluator (process) close every non-fast-path route.
- **Single notepad:** orchestrator-notes.md replaces the old events.jsonl + per-session index files.
- **Fallback:** If native agent spawn fails, inject the agent definition as the task prompt.
- **Idempotent indexing:** Mappers operate per-batch with no shared state; startup resumes from the last checkpoint.
