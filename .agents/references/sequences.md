# Goal-Driven Phase A

Every non-fast-path response requires a goal artifact before any Phase A sub-agent runs. The goal artifact freezes the chain. There are no default class-specific Phase A presets.

Always handle workspace startup by reading `system/startup.md` directly. Do not route startup through a skill injection.

## Route Policy

| Route | Behavior |
|---|---|
| `fast_path` | Answer directly. No goal artifact. No Phase A chain. |
| `non-fast-path` | Write a goal artifact in `agent_reports/`, then execute the frozen chain sequentially, file-to-file. |

## Goal Artifact Requirements

The orchestrator writes the goal artifact. It must include:
- cleaned prompt
- goal statement
- success metric that is primarily qualitative
- fixed serialized Phase A chain
- expected artifact from each step
- one rationale line per step
- explicit statement that the chain is frozen once written

Quantitative signals may be included when useful, but they are secondary to answer quality, evidence relevance, explicit limitations, and the intended truth-check state.

## Chain Rules

- Choose the smallest chain that can honestly complete the request.
- Every selected Phase A agent writes a durable artifact to `agent_reports/`.
- The orchestrator passes file paths, not inline content, between steps.
- The chain is strictly sequential once frozen: no parallel execution, no appended agents, no skipped later agents, and no mid-route replanning. Exception: during startup Phase 2.2, all `spinosa-mapper` sub-agents are dispatched in a single message (one per batch). See `system/startup.md` Phase 2.2.
- Repeated agents are allowed only when declared in the goal artifact with separate rationale lines.
- If the route produces a user-facing answer report, Writer must produce it before Verifier.
- Verifier is required whenever the route yields claims, citations, or quotes that need truth-checking.
- Non-answering maintenance routes may omit Writer when the frozen chain does not require a user-facing answer report.

## Example Phase A Chains

- `Goal Artifact → Searcher → Writer → Verifier`
- `Goal Artifact → Searcher → Analyst → Serendippo → Writer → Verifier`
- `Goal Artifact → Mapper → Searcher → Writer → Verifier`
- `Goal Artifact → Janitor`
- `Goal Artifact → Searcher → Mapper → Searcher → Writer → Verifier`

## Phase B Tail

Append this tail to every non-fast-path route after the Phase A terminal artifact reaches its intended checking state:

`Evaluator → (Evolver when evaluator decision = edit_recommended) → targeted validation`

Rules:

- Evaluator always runs, even when the route ended with `partial` verification.
- Evolver runs only when the evaluator emits `edit_recommended`.
- Targeted validation checks touched files structurally and sanity-checks the affected route logic.
- Self-edits apply only to future requests. The current answer is not rerun under the new instructions.
