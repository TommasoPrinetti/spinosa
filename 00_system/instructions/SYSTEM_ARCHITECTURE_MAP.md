---
type: system_architecture_map
role: framework_map
purpose: [show how the home session, logs, sub-agents, and evidence layers connect]
scope: [repo-wide architecture]
connects_to:
  - AGENTS.md
  - 00_system/instructions/STARTUP.md
  - .agents/skills/source-intake/SKILL.md
  - .agents/skills/report-writing/SKILL.md
  - .agents/skills/claim-verification/SKILL.md
  - .agents/skills/zone-cleanup/SKILL.md
  - .agents/skills/orchestrator-dispatch/SKILL.md
  - zone_index.md
created: 2026-05-26
updated: 2026-06-02
---

# LLM Zone System Architecture Map

## Core Architecture

LLM Zone is a two-layer research system.

```txt
Root Vault
  read-only original sources
  canonical evidence layer
        |
        | CLI copies text-like files unchanged into raw/,
        | agent builds dictionary, headers, and central maps
        v
LLM Zone
  writable indexed collection
  raw copies with YAML headers, source pointer records, central maps, dictionary, concept maps, logs, reports
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
| 1 | Navigator | Search the active raw corpus first; use Root Vault directly only for pointer-only accounting or approved recovery | Raw evidence packet |
| 2 | Packer | Build coherent report answering the original request | ONE clean report in [[05_agent_reports/]] |
| 3 | Checker | Verify quotes, claims, paths, indexes | Verification status, in-place corrections |
| 4 | Cleaner | Audit repo hygiene, propose archival moves, evaluate staleness | Cleaner Report with user-confirmation gate |
| 5 | Startup | Execute setup translation + mapping to create the first usable LLM Zone (orchestrator reads [[STARTUP]] directly) | Configuration, dictionary, headers, central maps, concept maps, startup report |

The **Checker** can run alone for verification, source-path repair, or index maintenance. The **Cleaner** runs on-demand for hygiene audits. The **Startup** skill runs when the user asks to start the Zone or setup files contain placeholders. Routing decisions and default route shapes live in `AGENTS.md`; sub-agent workflows are defined in `.agents/skills/<name>/SKILL.md`.

## Setup Lifecycle

Initial setup creates the translation layer between Root Vault and LLM Zone. The **startup** skill executes the protocol in [[STARTUP]], which has two phases:

```txt
Setup draft / user startup prompt
  |
  v
Orchestrator reads [[STARTUP]] protocol
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
  build concept maps from repeated themes
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
| Raw copy with header | Indexed, searchable copy in the Zone |
| Dictionary | Canonical vocabulary for consistent headers |
| Concept index | Thematic retrieval and pattern layer |
| Packer report | User-facing synthesis, not evidence by itself |
| Checker note | Verification state for quotes and claims |

## Active Files

| File                        | Role                                                                  |                                                  |
| --------------------------- | --------------------------------------------------------------------- | ------------------------------------------------ |
| `AGENTS.md`                 | Orchestrator playbook — single routing file                           |                                                  |
| [[STARTUP]]                 | Setup translation + indexing protocol (read by orchestrator)          |                                                  |
| [[CONFIGURATION]]      | Operating profile                                                     |                                                  |
| [[SYSTEM_ARCHITECTURE_MAP]] | This file — diagrams                                                  |                                                  |
| `.agents/skills/source-intake/SKILL.md` | Source file registration                              |                                                  |
| `.agents/skills/report-writing/SKILL.md` | Report synthesis                                     |                                                  |
| `.agents/skills/claim-verification/SKILL.md` | Claim verification                               |                                                  |
| `.agents/skills/zone-cleanup/SKILL.md` | Hygiene audit and archival                            |                                                  |
| `.agents/skills/orchestrator-dispatch/SKILL.md` | Prompt routing and skill injection         |                                                  |
| [[dictionary]]              | Shared term vocabulary                                                |                                                  |
| [[zone_index]]              | Master index                                                          |                                                  |
| [[maps/]]                   | Central navigation layer with Obsidian wikilinks into raw files       |                                                  |
| [[raw/]]                    | Active working corpus with raw text copies and source pointer records |                                                  |
| [[HEADER_TEMPLATE]]         | YAML header schema                                                    |                                                  |
| [[user_requests]]           | Request log                                                           |                                                  |
| [[05_agent_reports/]]       | Reports, checkpoints, evidence packets, verification notes            |                                                  |

## Retired Model

The previous PROCESS_ROUTER and ONBOARDING files, and the previous TODO list, are historical. Active routing lives entirely in `AGENTS.md`. The setup translation protocol and indexing protocol are unified in [[STARTUP]]. The development TODO is now part of `README.md`. Archived files may mention retired names, but archived material is not active instruction.
