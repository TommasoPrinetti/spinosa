# Agents & Pipeline

This is the canonical page for how Spinosa agents divide the work. Read it when you want the mental model behind startup, search, writing, verification, and maintenance.

## The agents at a glance

| Agent          | Main job                                        | When it runs             |
| -------------- | ----------------------------------------------- | ------------------------ |
| **Mapper**     | Builds navigation maps and indexing structure   | Startup and re-indexing  |
| **Searcher**   | Finds relevant passages in your documents       | Research questions       |
| **Analyst**    | Adds context, framing, and missing angles       | Alongside Searcher       |
| **Serendippo** | Looks for non-obvious cross-document links      | After core evidence work |
| **Writer**     | Turns evidence into a readable report           | After search is complete |
| **Verifier**   | Checks claims and quotes against the source     | After writing            |
| **Janitor**    | Audits workspace hygiene and cleanup candidates | On request               |

## Typical pipelines

The orchestrator does not run the same chain every time. It chooses the lightest path that still answers the request well.

| Question type                            | Typical sequence                                               |
| ---------------------------------------- | -------------------------------------------------------------- |
| "What files do I have?" or "How do I..." | Fast path, no full report                                      |
| "Find documents about X"                 | Searcher → Verifier                                            |
| "What does the corpus say about X?"      | Searcher + Analyst → Serendippo → Writer → Verifier            |
| "Compare A and B across the corpus"      | Searcher × multiple + Analyst → Serendippo → Writer → Verifier |
| "Check whether this quote is accurate"   | Verifier only                                                  |
| "Re-index the workspace"                 | Mapper → Verifier                                              |
| "Audit stale files and propose cleanup"  | Janitor only                                                   |

Searcher and Analyst can run in parallel. Writer waits for the evidence and context outputs they produce.

## What each agent owns

### Searcher

Owns evidence retrieval. It reads the dictionary and navigation maps, opens the relevant files in `raw/`, and assembles candidate passages with source paths and confidence labels.

### Analyst

Owns context. It broadens the search frame, flags missing angles, and helps the Writer avoid a narrow literal answer when the corpus points to a larger pattern.

### Serendippo

Owns discovery. It looks for links that were not part of the initial query but may matter for interpretation, comparison, or follow-up research.

### Writer

Owns the report draft. It turns the evidence and context into a structured markdown answer with clear sections and explicit limits.

### Verifier

Owns trust. It re-opens the cited source material, checks claims back against the text, and updates the report status to show whether the result is safe to rely on.

### Mapper

Owns startup structure. It creates the navigation maps and indexing scaffolding that make later searches faster and more targeted.

### Janitor

Owns maintenance. It audits stale artifacts, broken links, and cleanup candidates, then asks for confirmation before anything moves.

## How handoffs work

Agents coordinate through files in the workspace, not hidden memory. That makes their work inspectable.

```text
Searcher output + Analyst output
                ↓
             Writer draft
                ↓
          Verifier review
                ↓
         Final report status
```

Intermediate artifacts can be cleaned up later. Final reports stay in `agent_reports/`.

## Related concepts

- [Corpus Structure](/docs/corpus) explains where these outputs live on disk.
- [Reports & Charts](/docs/reports) explains how to read the Writer and Verifier output.
- [CLI Reference](/docs/cli-reference) covers commands for `prepare`, `check`, `sync`, and related operational tasks.

## Next reads

- [Corpus Structure](/docs/corpus)
- [Reports & Charts](/docs/reports)
- [CLI Reference](/docs/cli-reference)
- [FAQ](/docs/faq)
