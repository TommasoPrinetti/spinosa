# Default Sequences

Use the default sequence unless the user's request clearly requires a different route. If you deviate, record the reason in the log row. Every non-fast-path response requires a sequence with at least one sub-agent.

Always handle workspace startup by reading `system/startup.md` directly. Do not route startup through a skill injection.

| Class | Default Sequence | Skill to inject |
|---|---|---|
| `fast_path` | (none — answer directly) | — |
| `clarify_search` | skip (or Searcher if term disambiguation needed) | `evidence-search` (if needed) |
| `find_material` | Searcher → Verifier | `evidence-search` → `claim-verification` |
| `evidence_answer` | Searcher + Analyst → Serendippo → Writer → Verifier | `evidence-search` + `context-analysis` → serendipity → `report-writing` → `claim-verification` |
| `synthesis_report` | Searcher ×N + Analyst → Serendippo → Writer → Verifier | `evidence-search` ×N + `context-analysis` → serendipity → `report-writing` → `claim-verification` |
| `verification` | Verifier | `claim-verification` |
| `index_maintenance` | Searcher, Mapper, or Source Intake → Verifier | `evidence-search` or `source-intake` → `claim-verification` |
| `cleanup` | Janitor | `workspace-cleanup` |

Startup and deep index-maintenance routes may additionally use Mapper and Serendippo when the task requires corpus-wide extraction or hidden-connection discovery.

## Serendipity in Default Sequences

Serendippo runs automatically after Searcher + Analyst for `evidence_answer` and `synthesis_report` routes. This ensures hidden connections across the corpus are discovered by default, not just on explicit request.

**When Serendippo runs:**
- After Searcher has written evidence packets
- After Analyst has provided contextual analysis
- Before Writer synthesizes the final report

**What Serendippo does:**
- Roams raw files to find hidden connections
- Identifies patterns across heterogeneous sources
- Proposes map enrichments
- Writes serendipity report to `agent_reports/`

**How Writer uses Serendippo output:**
- Writer reads the serendipity report
- Integrates discovered connections into the final report
- Notes any map updates proposed
