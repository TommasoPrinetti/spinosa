# Prompt Routing Split

Map the prompt to one route, then pick a chain shape.

## Route split

| Route | When |
| ----- | ---- |
| `fast_path` | Operational answer, no source search or orchestrated artifact chain needed |
| `non-fast-path` | Any source-grounded, verification, maintenance, cleanup, indexing, or synthesis request that requires orchestrated artifacts |

## Chain shapes (non-fast-path)

After route split, choose the initial chain. The orchestrator may adapt after each inspect step — see [[AGENTS.md]] §4.

| Shape | Typical chain | When to use |
| ----- | ------------- | ----------- |
| **Q1 — Evidence answer** | Goal → Searcher → Writer → Verifier → Evaluator | Single-topic factual lookup; quotes and paths are enough |
| **Q2 — Contextual answer** | Goal → Searcher → Analyst → Writer → Verifier → Evaluator | Synthesis, cohort comparison, taxonomy, claim-strength guidance |
| **Q3 — Hidden connections** | Goal → Searcher → Analyst → **Serendippo** → Writer → Verifier → Evaluator | Implicit/subtle signals, cross-file patterns, tone readable only in context, participant trajectories |
| **Q4 — Cleanup** | Goal → Janitor → Verifier → Evaluator | Hygiene audit, stale files, archival moves |
| **Q5 — Coverage** | Goal → Overseer → Evaluator | Every 5 routes, user request, or discretionary trigger |

### Prompt signals → chain hint

| Signals in user prompt | Prefer |
| ---------------------- | ------ |
| "find evidence", "what does the corpus say", single entity | Q1 |
| "compare", "across cohorts", "patterns", "taxonomy" | Q2 |
| "subtle", "implicit", "from context", "not declared", "hidden", "cross-cutting", "unexpected connections" | Q3 (include Serendippo) |
| "cleanup", "hygiene", "stale", "archive" | Q4 |
| "coverage", "gaps", "what are we missing" | Q5 |

**Serendippo vs Analyst:** Analyst organizes evidence the Searcher already found. Serendippo roams `raw/` for connections Searcher did not surface. Use both when the question needs interpretation **and** discovery.

### Default phase order

```
searcher → [analyst] → [serendippo] → writer → verifier → evaluator
```

Omit bracketed phases when the chain shape does not need them. Never skip verifier or evaluator on routes that produce claims, citations, or quotes.