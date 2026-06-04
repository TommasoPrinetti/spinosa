---
type: information
agent: setup_cli
description:
  - Project blueprint filled during onboarding and startup.
  - Agents read this to understand scope, source location, evidence rules, and researcher preferences.
created: 2026-05-26
updated: 2026-05-26
setup_status: not_started
connects_to:
  - AGENTS.md
  - system/configuration.md
  - system/startup.md
  - logs/user_requests.md
---

# Information

## Project
- Title: [project name]
- Description: not provided during fast setup; infer from the raw corpus during startup

## Project Artifacts
- none provided during fast setup

## Sources
- Source location: [path]
- Main source types: [inferred during startup from the source material]
- Expected incoming sources: [inferred during startup]

## Research Vocabulary
- Key actors / institutions / places: [inferred during startup]
- Key concepts: [inferred during startup]
- Sensitizing concepts, not evidence: [inferred during startup]
- Theoretical frames, not forced labels: [inferred during startup]

## Method And Evidence
- Methods: [inferred during startup]
- Claims require source paths.
- L2 clues require Verifier checking before reporting.
- External sources must stay labeled external unless moved into `raw/`.
- External source policy: no (default; ask only if external access is needed)

## Outputs
- Start with maps in maps/ and evidence-grounded answers unless the researcher requests another output.

## Blind Spots
- [identified during startup]

## Researcher Preferences
[to be filled by researcher]

## Preferred LLM CLI
[filled by CLI onboarding]
