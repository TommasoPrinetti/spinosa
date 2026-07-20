# Corpus Structure & Configuration

This is the canonical page for the workspace layout and indexing model. Read it when you want to understand what Spinosa creates on disk, what each folder is for, and which files matter during startup and maintenance.

## Workspace layout

```text
your-workspace/
  AGENTS.md
  raw/
  maps/
  system/
  agent_reports/
  logs/
  .agents/
  .bin/
  .trash/
```

## What each folder owns

| Path             | What it holds                                                                 |
| ---------------- | ----------------------------------------------------------------------------- |
| `raw/`           | Converted local copies of your source documents, one markdown file per source |
| `maps/`          | Navigation maps that help agents route search and comparison work             |
| `system/`        | Configuration, context, dictionary, and workspace index files                 |
| `agent_reports/` | Startup reports, answers, and other agent-produced report files               |
| `logs/`          | Request history and compact operational metrics                               |
| `.agents/`       | Agent definitions and fallback skill files                                    |
| `.bin/`          | CLI scripts and conversion helpers                                            |
| `.trash/`        | Archived process artifacts and cleanup targets                                |

## The files that matter most

### `raw/`

This is the working corpus. Agents search here, quote from here, and verify against here. Each file keeps a YAML header so the system can identify language, source type, dates, and key entities quickly.

Example header:

```yaml
---
type: raw_copy
source: 'raw/folder/interview-normandy-2024.md'
source_type: interview
original_format: pdf
converter_engine: markitdown
language: fr
date: '2024-06-15'
people: ['Maria Santos']
places: ['Normandy coast']
topics: ['coastal erosion']
keywords: ['shoreline retreat', 'sea defences']
---
```

### `system/configuration.md`

Holds operating settings such as source location, conversion policy, and preferred CLI.

### `system/context.md`

Holds project context: scope, research vocabulary, key actors, and known gaps.

### `system/dictionary.md`

Holds the shared vocabulary Spinosa extracted from the corpus: names, places, organizations, concepts, aliases, and uncertain terms that may need review.

### `system/workspace_index.md`

Tracks coverage and health: file counts, map coverage, extraction progress, and whether core validation checks passed.

## What startup builds

When you run the startup prompt, Spinosa:

1. Verifies the workspace was created correctly.
2. Surveys the converted corpus in `raw/`.
3. Builds the dictionary and navigation maps.
4. Writes startup artifacts and validation results.
5. Marks the workspace ready once the checks pass.

If you want the agent-level version of this story, read [Agents & Pipeline](/docs/agents).

## Working with the corpus safely

- Treat `raw/` as evidence, not as a drafting surface.
- Edit metadata carefully if you need to fix headers, but avoid rewriting source text bodies.
- Use `spinosa prepare <workspace>` or the intake workflow when new files arrive.
- Use `spinosa check <workspace>` if the workspace starts behaving inconsistently.

## Next reads

- [Agents & Pipeline](/docs/agents) for who reads and verifies these files
- [Reports & Charts](/docs/reports) for what the resulting reports look like
- [CLI Reference](/docs/cli-reference) for `prepare`, `check`, `update`, and `sync`
- [Glossary](/docs/glossary) for quick definitions of workspace terms
