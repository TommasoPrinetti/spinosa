---
type: context
agent: startup
description:
  - Project context: scope, names, particularities, relationships.
  - Read by Writer for synthesis; updated by startup during indexing.
created: 2026-05-26
updated: 2026-06-03
setup_status: cli_started
connects_to:
  - AGENTS.md
  - system/instructions/configuration.md
  - system/instructions/startup.md
  - logs/user_requests.md
---

# Context

## Project
- Title: [project name]
- Description: [one sentence — what the project studies or builds]

## Project Artifacts
- URLs or repos the user provided: [URLs or none]

## Sources
- Root Vault path: [path]
- Main source types: [e.g., PDFs, markdown notes, transcripts]
- Expected incoming sources: [what the user said they would add]

## Research Vocabulary
- Key actors / institutions / places: [list]
- Key concepts: [list]
- Sensitizing concepts, not evidence: [list]
- Theoretical frames, not forced labels: [list]

## Method And Evidence
- Methods: [how the project gathers, organizes, or interprets evidence]
- Claims require source paths.
- L2 clues require Verifier checking before reporting.
- External sources must stay labeled external unless moved into the Root Vault.
- External source policy: [yes/no — ask only if external access is needed]

## Outputs
- Start with maps in maps/ and evidence-grounded answers unless the researcher requests another output.

## Blind Spots
- Fast setup did not include a user-written project description or artifact URLs. The orchestrator inferred them from the raw corpus.

## Researcher Preferences
[How the researcher wants to work: internal-first vs web-grounded, preferred retrieval style, risk tolerance, output style.]

## Preferred LLM CLI
[which CLI the researcher plans to use]
