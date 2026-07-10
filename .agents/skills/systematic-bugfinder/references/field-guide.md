# Systematic Bugfinding Field Guide

## 1. Layer prompts

### L1 — First-level symptom bugs

Ask:

- What exact click, command, request, input, or state triggers the failure?
- What does the user see, and what should they see?
- Is the first wrong result a render, route, state value, return value, file, query, or side effect?
- Can the failure be reduced to one deterministic action?
- Does it reproduce from a clean start, warm state, or only after a prior action?

Evidence standard: a reproducible sequence, failing assertion, captured state divergence, or reliable manual observation.

### L2 — Deeper causal bugs

Trace beyond the visible line:

- Who owns the wrong state?
- Which operation first makes it wrong?
- Which awaited continuation resumes with stale assumptions?
- Is identity missing from state that belongs to a workspace, session, generation, user, request, or file?
- Is a caller treating fallible I/O as infallible?
- Is a typed value actually external runtime data?
- Is a transition reacting to initial hydration as if it were a real change?
- Is the final wrong render only a downstream symptom?

Evidence standard: an execution-order explanation where removing or correcting the mechanism prevents the symptom.

### L3 — Neighboring bugs

Inspect the same primitive along nearby axes:

| Axis | Questions |
|---|---|
| Callers | Who else calls this function, hook, command, or write helper? |
| State branches | What happens for every enum/status/route value, including unknown? |
| Lifecycle | Initial load, update, retry, cancel, unmount, restart, cleanup? |
| Identity | What if workspace/session/user/path changes while work is pending? |
| Errors | Read error, corrupt data, permission failure, missing file, rejected promise? |
| Timing | Before await, during await, after invalidation, overlapping invocation? |
| Persistence | Cold start before storage hydration; stale values after switching? |
| Mutation | Partial write, concurrent write, crash, rollback, retired data? |
| Mirrors | Generated files, adapters, templates, copied configs, docs? |
| UX | Blank screen, transient wrong screen, lost input, misleading success? |

A neighbor is not automatically a defect. Confirm violated behavior before editing.

### L4 — Recurring bug families

Search for mechanisms and shapes, not exact names.

#### Shared mutable cancellation

Signals:

- one boolean reused across retries;
- a new run resets a flag an old continuation still reads;
- cancellation checks exist but context is not passed through a boundary;
- long operations check only before, not after, an await.

Preferred correction:

- generation-scoped or request-scoped abort predicate;
- propagate it through every phase;
- check immediately before committing output;
- serialize commits to the same destination.

#### Cross-identity stale state

Signals:

- previous and current values compared without workspace/session identity;
- flat pending state applied after switching context;
- async result navigates or writes without confirming its owner is still active.

Preferred correction:

- store identity with state;
- compare tuples such as `[workspacePath, status]`;
- discard results whose identity is no longer current.

#### Hydration mistaken for transition

Signals:

- initial resource load fires transition logic;
- persisted state is read before storage reports ready;
- mount-time default later overwrites an intentional route.

Preferred correction:

- distinguish `undefined -> value` hydration from `oldValue -> newValue`;
- let the initiating action own initial navigation;
- react only to real changes in the same identity.

#### Dropped context

Signals:

- phase functions accept cancellation, transaction, auth, tracing, or identity, but orchestrators omit it;
- wrapper types do not expose a parameter supported by lower layers;
- recovery or secondary paths call the primitive without the context.

Preferred correction:

- put context in the public boundary type;
- thread it through all callers and recovery paths;
- add a boundary-level regression test.

#### Non-atomic or partial mutation

Signals:

- direct writes to important metadata;
- multiple files updated before success is known;
- destructive removal without archive;
- check-then-act concurrency;
- temporary files survive cancellation.

Preferred correction:

- temp-write plus atomic rename;
- lock concurrent operations;
- snapshot/journal and rollback;
- archive user-affecting removals;
- clean temporary output in `finally`.

#### Watcher desynchronization

Signals:

- snapshot updated before callback succeeds;
- async callback is fire-and-forget;
- poll ticks overlap;
- filesystem exceptions abort a tick;
- mtime/size misses content changes.

Preferred correction:

- serialize callbacks;
- commit snapshot only after callback success;
- retain old snapshot on error so the next tick retries;
- use asynchronous I/O and content hashes where warranted;
- bind disposal to lifecycle.

#### Route and state-machine incompleteness

Signals:

- multiple statuses map to one route unintentionally;
- spec route exists only in documentation;
- unknown runtime route renders nothing;
- alternate entry points bypass onboarding or recovery;
- explicit navigation competes with reactive navigation.

Preferred correction:

- exhaustive route function;
- safe runtime normalization;
- one owner for initial navigation;
- transition logic keyed by identity and real prior state;
- end-to-end test for the user journey.

#### Runtime trust behind static types

Signals:

- loops assume arrays from files/APIs;
- property access assumes non-null records;
- exported functions accept external strings but do not validate them;
- corrupt data throws far from the boundary.

Preferred correction:

- validate at read/parse boundary;
- normalize unknown values;
- preserve strict internal types after validation;
- test corrupt and partial input.

#### Mirror and documentation drift

Signals:

- generated comments name deleted scripts;
- mirror existence tested but content not compared;
- caches tracked despite ignore rules;
- fixture validates only one adapter.

Preferred correction:

- define a canonical source;
- compare normalized content where adapter headers differ;
- validate all supported layouts;
- remove generated caches and test their absence.

### L5 — Systemic safeguards

Choose safeguards closest to the invariant:

- type union or exhaustive switch for closed state;
- schema validation for external input;
- identity-bearing data structure for scoped state;
- generation token for superseded async work;
- lock for concurrent mutation;
- atomic writer for durable files;
- rollback snapshot or journal for multi-file updates;
- lifecycle cleanup for pollers/resources;
- content-integrity test for mirrors;
- end-to-end journey test for routing/UI;
- narrow regression test for the exact failure.

A safeguard is better than another caller-specific conditional when it prevents multiple instances of the bug family.

## 2. Hypothesis discipline

Use a short hypothesis queue:

| Hypothesis | Discriminating check | Result | Next |
|---|---|---|---|
| H1 | What outcome differs if H1 is true? | Supported/refuted | Fix or discard |
| H2 | Smallest independent check | Supported/refuted | Fix or discard |

Rules:

- keep at most three live hypotheses;
- run the cheapest high-information check first;
- discard refuted patches completely;
- do not add multiple speculative changes before retesting;
- if three theories fail, return to the first divergent observable state.

## 3. Severity and confidence

Severity measures impact, not certainty:

- **Critical:** corruption, destructive loss, security boundary failure, unrecoverable workflow.
- **High:** crash, blank screen, wrong workspace/session, persistent inability to complete a core flow.
- **Medium:** recoverable wrong behavior, stale state, missing automation, misleading result.
- **Low:** narrow edge case, dead code, stale docs, defensive hardening.

Confidence measures evidence:

- **Confirmed:** reproduced or proven by deterministic code path/test.
- **Probable:** strong causal evidence, reproduction constrained by environment.
- **Possible:** plausible pattern without a demonstrated incorrect outcome.

Fix priority should consider both. A possible critical claim needs urgent validation, not an immediate speculative patch.

## 4. Audit disposition vocabulary

Use exactly one primary disposition per claim:

- **Fixed:** confirmed defect corrected and validated.
- **No fix — intentional:** behavior is deliberate and consistent with current contract.
- **No fix — stale:** referenced code or behavior no longer exists.
- **No fix — hypothetical:** depends on a future shape or absent mechanism.
- **No fix — not reproducible:** prerequisites were exercised and failure did not occur; record limits.
- **Coverage added:** behavior was correct but insufficiently protected.
- **Duplicate:** same causal defect as another finding; point to the canonical ID.
- **Blocked:** confirmation requires missing authority, environment, credentials, or product decision.

Do not label a confirmed defect “not reproducible” merely because one path passed.

## 5. Race-condition matrix

For async/state bugs, test this matrix where applicable:

| Moment | Action | Required result |
|---|---|---|
| Before start | Cancel/switch identity | No operation begins |
| During await | Cancel/switch identity | Completion is discarded before commit |
| After old invalidation | Start new run | Old run cannot become active again |
| Concurrent commit | Same destination/state | Writes serialize or reject safely |
| Cleanup | Old run exits | It cannot destroy the new run's resource |
| Cold start | Persistence still hydrating | No false navigation or missing durable state |
| Retry | Previous callback failed | Next tick/call retries rather than accepting stale snapshot |

## 6. Regression-test design

A strong regression test:

- names the user-visible failure or violated invariant;
- fails before the fix for the right reason;
- exercises the highest boundary that dropped or corrupted behavior;
- avoids implementation-only assertions when behavior can be asserted;
- includes identity/timing when the bug is a race;
- proves preservation of prior data for mutation bugs;
- remains deterministic without arbitrary long sleeps.

Use fake dependencies or short controlled gates for concurrency. If a real UI journey caused the bug, keep one end-to-end test even when lower-level tests also exist.

## 7. Avoiding circles

You are going in circles when:

- the same files are reread without a new question;
- searches repeat the same terms without new evidence;
- patches change several unrelated mechanisms;
- tests pass but the original journey was never rerun;
- every theoretical edge case is treated as in scope;
- a broad audit continues after two passes find no new confirmed pattern.

Recovery:

1. Restate the first wrong observable state.
2. List confirmed facts only.
3. Choose one discriminating check.
4. Revert unsupported edits.
5. Narrow to the causal primitive.
6. Apply the stopping rules from `SKILL.md`.

## 8. Final report template

### Outcome

One or two sentences stating whether the bug and its confirmed family were fixed.

### Root cause

One causal paragraph: trigger → first incorrect transition/mutation → downstream symptom.

### Changes

- Primitive changed and invariant restored.
- Neighboring confirmed defects fixed.
- Safeguards and regression coverage added.

### Validation

- Exact focused test and result.
- Maintained suite/typecheck/build and result.
- Runtime or end-to-end journey and result.

### Dispositions

| ID | Status | Reason |
|---|---|---|
| B1 | Fixed | Evidence and validation |
| B2 | No fix — stale | Current tree no longer contains path |
| B3 | Coverage added | Correct behavior lacked regression test |

### Notes

Only real limitations, remaining risks, or authorization blockers.

