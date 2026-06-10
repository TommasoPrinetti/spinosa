---
type: system_architecture_map
role: framework_map
purpose:
  - show how the home session
  - logs
  - sub-agents
  - and evidence layers connect
description: Architecture map for Spinosa's orchestration, evidence, and output layers.,Agents use this only when they need structural context beyond the root contract.
scope:
  - repo-wide architecture
connects_to:
  - AGENTS.md
  - system/startup.md
  - .agents/skills/source-intake/SKILL.md
  - .agents/skills/report-writing/SKILL.md
  - .agents/skills/claim-verification/SKILL.md
  - .agents/skills/workspace-cleanup/SKILL.md
  - .agents/skills/orchestrator-dispatch/SKILL.md
  - workspace_index.md
created: 2026-05-26
updated: 2026-06-05
status: active
---

# System Architecture Map

## Core Architecture

Spinosa is a two-layer research system.

```txt
Source location
  read-only original sources
  canonical evidence layer
        |
        | CLI copies files unchanged into raw/,
        | agent builds dictionary, headers, and maps
        v
Spinosa workspace
  writable indexed collection
  raw copies with YAML headers, maps, dictionary, logs, reports
        |
        | prompt pipeline searches here first for token economy
        v
User-facing answers
  checked against raw copies before factual claims are finalized
```

## Prompt Lifecycle

```txt
User prompt
  |
  v
Home session orchestrator (AGENTS.md)
  |
  v
Request log
  |
  v
Classify
  |
  v
Choose sequence (default shapes; orchestrator may deviate)
  |
  v
Dispatch sub-agents — native spawn by canonical name, or inject SKILL.md fallback
  |
  v
Final report
```

The home session is the orchestrator. It is governed by `AGENTS.md` and controls routing, handoffs, stop conditions, and final response assembly. `.agents/` is the canonical source for agent and skill definitions; vendor directories are generated mirrors.

## Setup Lifecycle

Initial setup creates the translation layer between the source location and the workspace. The **startup** skill executes the protocol in [[startup]], which has two phases:

```txt
Setup draft / user startup prompt
  |
  v
Orchestrator reads [[startup]] protocol
  |
  v
Phase 1 — Setup Translation
  fill configuration and research context
  audit translation
  |
  v
CLI copies accepted text-like files unchanged into [[raw/]]
  |
  v
Phase 2 — Indexing
  agent builds master dictionary
  agent generates YAML headers for all raw copies
  agent creates multi-level navigation maps: structural overview, group maps with key passages, and theme threads
  disambiguate with user (via orchestrator) if needed
  build maps from repeated themes
  update master index
  |
  v
Run validation and retrieval tests
  |
  v
Mark setup_status: workspace_started
```

The setup output is not a final interpretation of the research corpus. It is the first navigable, token-efficient map that later agents can search.

## Active Files

| File                                            | Role                                                                   |     |
| ----------------------------------------------- | ---------------------------------------------------------------------- | --- |
| `AGENTS.md`                                     | Orchestrator playbook — single routing file                            |     |
| [[startup]]                                     | Setup translation + indexing protocol (read by orchestrator)           |     |
| [[configuration]]                               | Operating profile                                                      |     |
| [[system_architecture_map]]                     | This file — diagrams                                                   |     |
| `.agents/skills/source-intake/SKILL.md`         | Source file registration                                               |     |
| `.agents/skills/report-writing/SKILL.md`        | Report synthesis                                                       |     |
| `.agents/skills/claim-verification/SKILL.md`    | Claim verification                                                     |     |
| `.agents/skills/workspace-cleanup/SKILL.md`     | Hygiene audit and archival                                             |     |
| `.agents/skills/orchestrator-dispatch/SKILL.md` | Prompt routing and skill injection                                     |     |
| `.agents/agents/`                               | Canonical native agent definitions                                     |     |
| [[dictionary]]                                  | Shared term vocabulary                                                 |     |
| [[workspace_index]]                             | Master index                                                           |     |
| [[maps/]]                                       | Multi-level navigation: structural overview, group maps, theme threads |     |
| [[raw/]]                                        | Active working corpus with raw text/native/PDF copies                  |     |
| [[yaml_header_template]]                             | YAML header schema                                                     |     |
| [[user_requests]]                               | Request log                                                            |     |
| [[agent_reports/]]                              | Reports, checkpoints, evidence packets, verification notes             |     |
