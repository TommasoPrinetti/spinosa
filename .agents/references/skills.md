# Skills Reference

| Role | Native Agent | Skill | What it does |
|---|---|---|---|
| Searcher | `pilosa-searcher` | `pilosa-evidence-search` | Searches existing raw copies and maps for evidence |
| Analyst | `pilosa-analyst` | `pilosa-context-analysis` | Reads prior artifacts and project context, then writes a contextual analysis packet |
| Writer | `pilosa-writer` | `pilosa-report-writing` | Produces the user-facing answer report when the frozen chain requires one |
| Verifier | `pilosa-verifier` | `pilosa-claim-verification` | Truth-checks claims, quotes, and paths in substantive artifacts |
| Evaluator | `pilosa-evaluator` | `pilosa-evaluator` | Audits completed non-fast-path routes and decides whether evolution is justified |
| Evolver | `pilosa-evolver` | `pilosa-evolver` | Applies tightly scoped framework updates for future requests |
| Janitor | `pilosa-janitor` | `pilosa-workspace-cleanup` | Writes a cleanup audit artifact and proposes archival moves |
| Mapper | `pilosa-mapper` | `pilosa-mapper-fallback` | Reads raw files in batches; extracts content-grounded fragments, key passages, and concept signals; writes maps |
| Serendippo | `pilosa-serendippo` | `pilosa-serendippo-fallback` | Finds hidden cross-corpus connections and proposes map enrichment |
