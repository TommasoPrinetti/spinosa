---
type: system_architecture_map
role: framework_map
purpose: [show how the home session, logs, sub-agents, and evidence layers connect]
description:
  - Architecture map for Pilosa's orchestration, evidence, and output layers.
  - Agents use this only when they need structural context beyond the root contract.
scope: [repo-wide architecture]
connects_to:
  - AGENTS.md
  - system/startup.md
  - .agents/skills/source-intake/SKILL.md
  - .agents/skills/report-writing/SKILL.md
  - .agents/skills/claim-verification/SKILL.md
  - .agents/skills/zone-cleanup/SKILL.md
  - .agents/skills/orchestrator-dispatch/SKILL.md
  - workspace_index.md
created: 2026-05-26
updated: 2026-06-02
---

# System Architecture Map

## Core Architecture

Pilosa is a two-layer research system.

```txt
Root Vault
  read-only original sources
  canonical evidence layer
        |
        | CLI copies text-like files unchanged into raw/,
        | agent builds dictionary, headers, and maps
        v
Pilosa workspace
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
Dispatch sub-agents — inject SKILL.md content into task prompt
  |
  v
Final answer
```

The home session is the orchestrator. It is governed by `AGENTS.md` and controls routing, handoffs, stop conditions, and final response assembly. Sub-agent routing tables, default sequences, hard rules, and evidence/quotes conventions all live in `AGENTS.md` — there is no separate router file.

## Sub-Agent Pipeline

| Stage | Owner | Function | Output |
|---|---|---|---|
| 0 | Home session | Log request, choose route, dispatch sub-agents, enforce stop conditions | Fast-path answer or routed sequence |
| 1 | Searcher | Search the active raw corpus first; use Root Vault directly only for skipped media accounting or approved recovery | Raw evidence packet |
| 2 | Writer | Build coherent report answering the original request | ONE clean report in [[agent_reports/]] |
| 3 | Verifier | Verify quotes, claims, paths, indexes | Verification status, in-place corrections |
| 4 | Janitor | Audit repo hygiene, propose archival moves, evaluate staleness | Janitor Report with user-confirmation gate |
| 5 | Startup | Execute setup translation + mapping to create the first usable workspace (orchestrator reads [[startup]] directly) | Configuration, dictionary, headers, maps, startup report |

The **Verifier** can run alone for verification, source-path repair, or index maintenance. The **Janitor** runs on-demand for hygiene audits. The **Startup** skill runs when the user asks to start the workspace or setup files contain placeholders. Routing decisions and default route shapes live in `AGENTS.md`; sub-agent workflows are defined in `.agents/skills/<name>/SKILL.md`.

## Setup Lifecycle

Initial setup creates the translation layer between Root Vault and the workspace. The **startup** skill executes the protocol in [[startup]], which has two phases:

```txt
Setup draft / user startup prompt
  |
  v
Orchestrator reads [[startup]] protocol
  |
  v
Phase 1 — Setup Translation
  fill configuration and research blueprint
  audit translation
  |
  v
CLI copies accepted text-like files unchanged into [[raw/]]
  |
  v
Phase 2 — Indexing
  agent builds master dictionary
  agent generates YAML headers for all raw copies
  agent creates maps/*.md with detailed wikilink retrieval summaries
  disambiguate with user (via orchestrator) if needed
  build maps from repeated themes
  update master index
  |
  v
Run validation and retrieval tests
  |
  v
Mark setup_status: zone_started
```

The setup output is not a final interpretation of the research corpus. It is the first navigable, token-efficient map that later agents can search.

## Evidence Hierarchy

| Layer | Role |
|---|---|
| Root Vault source | Canonical source of truth |
| Raw copy with header | Indexed, searchable copy in the workspace |
| Dictionary | Canonical vocabulary for consistent headers |
| Concept index | Thematic retrieval and pattern layer |
| Writer report | User-facing synthesis, not evidence by itself |
| Verifier note | Verification state for quotes and claims |

## Active Files

| File                        | Role                                                                  |                                                  |
| --------------------------- | --------------------------------------------------------------------- | ------------------------------------------------ |
| `AGENTS.md`                 | Orchestrator playbook — single routing file                           |                                                  |
| [[startup]]                 | Setup translation + indexing protocol (read by orchestrator)          |                                                  |
| [[configuration]]      | Operating profile                                                     |                                                  |
| [[system_architecture_map]] | This file — diagrams                                                  |                                                  |
| `.agents/skills/source-intake/SKILL.md` | Source file registration                              |                                                  |
| `.agents/skills/report-writing/SKILL.md` | Report synthesis                                     |                                                  |
| `.agents/skills/claim-verification/SKILL.md` | Claim verification                               |                                                  |
| `.agents/skills/zone-cleanup/SKILL.md` | Hygiene audit and archival                            |                                                  |
| `.agents/skills/orchestrator-dispatch/SKILL.md` | Prompt routing and skill injection         |                                                  |
| [[dictionary]]              | Shared term vocabulary                                                |                                                  |
| [[workspace_index]]              | Master index                                                          |                                                  |
| [[maps/]]                   | Central navigation layer with Obsidian wikilinks into raw files       |                                                  |
| [[raw/]]                    | Active working corpus with raw text/native/PDF copies; legacy pointer records may exist |                                                  |
| [[header_template]]         | YAML header schema                                                    |                                                  |
| [[user_requests]]           | Request log                                                           |                                                  |
| [[agent_reports/]]       | Reports, checkpoints, evidence packets, verification notes            |                                                  |

## Retired Model

The previous PROCESS_ROUTER and ONBOARDING files, and the previous TODO list, are historical. Active routing lives entirely in `AGENTS.md`. The setup translation protocol and indexing protocol are unified in [[startup]]. The development TODO is now part of `README.md`. Archived files may mention retired names, but archived material is not active instruction.
