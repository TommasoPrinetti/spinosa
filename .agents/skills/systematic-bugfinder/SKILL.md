---
name: systematic-bugfinder
description: Systematically diagnose and fix software bugs across five layers—reported symptom, direct cause, neighboring paths, recurring patterns, and systemic safeguards. Use when asked to investigate, debug, bug-hunt, fix all related issues, audit regressions, analyze recurring failures, or prevent a bug family from returning.
---

# Systematic Bugfinder

## Purpose

Find the bug the user sees, the bug that causes it, the nearby bugs built from the same assumptions, and the missing safeguards that let the pattern recur. Produce the smallest complete fix with evidence, regression coverage, and a clear disposition for every investigated finding.

## Operating rules

- Start from observable behavior. Do not edit before reproducing or isolating the failure.
- Separate evidence from hypothesis. Mark uncertainty instead of presenting guesses as findings.
- Fix the causal primitive before patching individual callers.
- Add a regression test that fails for the original behavior and passes after the fix.
- Preserve user work and unrelated changes. Keep the diff surgical.
- Treat audit claims as inputs, not facts. Validate every claim against the current tree.
- Do not stack speculative fixes. Test one causal theory at a time.
- Do not stop at the first passing test when the same primitive has neighboring consumers.
- Do not widen forever. Use the stopping rules below.

## Investigation modes

Choose the narrowest mode authorized by the request:

- **Diagnose:** identify and explain the cause; make no implementation changes.
- **Fix:** diagnose, implement, and verify the reported bug.
- **Fix the family:** also inspect neighboring and recurring instances of the same cause.
- **Audit:** classify a supplied finding list as confirmed, stale, intentional, hypothetical, test gap, or duplicate, then fix confirmed defects.

## Five-layer bug sweep

1. **L1 — Symptom:** Reproduce the exact user-visible failure and capture expected versus actual behavior.
2. **L2 — Direct cause:** Trace the executed path, state changes, async boundaries, and ownership until one causal mechanism explains the symptom.
3. **L3 — Neighbors:** Inspect other callers, transitions, alternate entry points, failure paths, retries, cleanup, and persistence around the same primitive.
4. **L4 — Recurrence:** Search for the same risky pattern elsewhere: duplicated logic, dropped context, shared mutable flags, non-atomic writes, unchecked runtime input, or lifecycle asymmetry.
5. **L5 — Safeguard:** Strengthen the shared primitive, invariant, type, test, lock, transaction, or validation boundary that prevents the family from returning.

Use the detailed prompts in [references/field-guide.md](references/field-guide.md).

## Workflow

### 1. Frame the failure

Record:

- exact trigger and user journey;
- expected and actual behavior;
- scope authorized: diagnose, fix, family, or audit;
- environment and state prerequisites;
- current worktree status and relevant repository instructions.

Write a one-sentence falsifiable bug statement:

> When **trigger**, the system **actual behavior** because **candidate mechanism**; it should **expected behavior**.

The mechanism is provisional until evidence confirms it.

### 2. Establish a baseline

- Run the narrowest existing test or reproduction.
- Confirm whether the failure is deterministic, intermittent, state-dependent, or timing-dependent.
- Capture the first divergent state, output, route, write, or call.
- Distinguish pre-existing test failures from failures in scope.

If the report cannot be reproduced, inspect whether it is stale, platform-specific, hidden by fallback behavior, or missing a prerequisite.

### 3. Trace causality

Follow data and control flow in execution order:

- entry point and input normalization;
- state owner and mutation order;
- awaited operations and continuations;
- route or lifecycle transitions;
- filesystem/network/database boundaries;
- cleanup, rollback, and error propagation;
- final consumer that renders or commits the wrong result.

Prefer one causal chain over a list of suspicious lines.

### 4. Maintain a finding ledger

For every candidate, record:

| Field | Meaning |
|---|---|
| ID | Stable local identifier |
| Layer | L1–L5 |
| Claim | Specific falsifiable statement |
| Evidence | Reproduction, code path, test, log, or state trace |
| Confidence | Confirmed, probable, possible |
| Disposition | Fix, no fix, stale, intentional, hypothetical, duplicate, test gap |
| Action | File/test change or reason for no change |

A finding is confirmed only when evidence connects it to incorrect behavior or a violated invariant.

### 5. Test the theory before widening

Choose the smallest discriminating check. A useful check should make competing explanations produce different outcomes.

Examples:

- bypass one route transition;
- freeze a generation token;
- force a read/write failure;
- switch workspace identity while preserving status;
- run two calls concurrently;
- cancel immediately before and after an await;
- restart or reload persisted state;
- pass corrupt runtime data across a typed boundary.

If the check disproves the theory, update the ledger and move to the next hypothesis. Do not preserve the failed patch.

### 6. Fix the primitive

Prefer, in order:

1. restore a missing invariant;
2. make state identity explicit;
3. propagate context through the whole call chain;
4. serialize or make mutation atomic;
5. validate at the external boundary;
6. make lifecycle transitions symmetric;
7. remove duplicated or dead paths;
8. patch a caller only when the shared primitive cannot safely change.

Keep intentional behavior explicit. Do not hide errors behind broad fallback branches.

### 7. Sweep neighbors and recurrence

After confirming the root cause, search by mechanism rather than symptom. Inspect:

- every caller and consumer of the changed primitive;
- sibling status/route branches;
- retry, cancellation, timeout, and error paths;
- initial load versus real transition;
- workspace/session/user identity switches;
- partial failure and rollback;
- persisted state before and after cold start;
- concurrent invocations;
- mirrored/generated copies;
- tests and documentation that encode the old assumption.

Fix only confirmed neighboring defects. Record non-defects instead of changing them for consistency.

### 8. Prove the result

Validation order:

1. original regression test;
2. focused tests for the primitive;
3. neighboring-path tests;
4. package typecheck/lint/build;
5. maintained suite;
6. runtime or end-to-end check when user-visible flow is involved.

For race fixes, test at least:

- cancellation or switch before the await;
- completion after invalidation;
- a new run starting while the old one unwinds;
- no overlapping commit to the same destination.

### 9. Report by disposition

Lead with the outcome. Include:

- root cause in one causal paragraph;
- confirmed fixes grouped by primitive;
- tests and exact outcomes;
- findings intentionally not changed and why;
- remaining limitations only when real.

Never claim “all fixed” without a disposition for every scoped finding.

## Loop-control and stopping rules

Stop widening when all are true:

- the original symptom is reproduced and then resolved;
- one causal chain explains the failure;
- all consumers of the changed primitive were inspected;
- searches for the causal pattern add no new confirmed findings in two consecutive passes;
- regression, focused, and maintained-suite checks pass;
- every scoped claim has a disposition.

Stop and ask for direction when the next action is destructive, requires production access, changes public behavior beyond the request, or presents a meaningful product trade-off.

## References

- [references/field-guide.md](references/field-guide.md) — layer prompts, bug-family patterns, race matrices, audit dispositions, and reporting template.

