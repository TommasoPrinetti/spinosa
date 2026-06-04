---
type: context
agent: startup
scope: project_context
description:
  - Project context: scope, names, particularities, relationships.
  - Read by Writer for synthesis; updated by startup during indexing.
created: 2026-05-26
updated: 2026-06-04
setup_status: not_started
connects_to:
  - AGENTS.md
  - system/configuration.md
  - system/startup.md
  - logs/user_requests.md
---
# Context

## What This System Is

Pilosa is a search-and-find engine for large datasets and text archives. It uses a chain of specialized sub-agents — orchestrated by the main conversation — to search, synthesize, verify, and present evidence from a corpus of source documents.

The system provides both direct answers grounded in sources and broader contextual perspectives on the topics being researched. Every factual claim traces back to a source path. Every report is verified before presentation.

## Project
- Title: [filled by startup]
- Description: [filled by startup or "not provided during fast setup"]

## Project Artifacts
- URLs or repos the user provided: [filled by startup]

## Sources
- Source location: [filled by CLI onboarding]
- Main source types: [filled by startup]
- Expected incoming sources: [filled by startup]

## Research Vocabulary
- Key actors / institutions / places: [filled by startup]
- Key concepts: [filled by startup]
- Sensitizing concepts, not evidence: [filled by startup]
- Theoretical frames, not forced labels: [filled by startup]

## Method And Evidence
- Methods: [filled by startup]
- Claims require source paths.
- L2 clues require Verifier checking before reporting.
- External sources must stay labeled external unless moved into `raw/`.
- External source policy: no

## Outputs
- Start with maps in maps/ and evidence-grounded answers unless the researcher requests another output.

## Blind Spots
[Filled by startup]

## Researcher Preferences
[To be filled by researcher]

## Preferred LLM CLI
[filled by CLI onboarding]
