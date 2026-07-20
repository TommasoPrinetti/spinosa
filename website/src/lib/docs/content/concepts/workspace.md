# Workspace Structure

When you create a Spinosa workspace, a folder is created with this layout:

```text
your-workspace/
  raw/              Converted copies of your source documents (markdown)
  maps/             Navigation maps for searching and routing
  system/           Configuration, context, dictionary, index
  agent_reports/    Reports produced by agents
  logs/             Request history and metrics
  .agents/          Agent definitions and skills
  .bin/             CLI scripts and converters
  .trash/           Archived process artifacts
```

## Key files

**`raw/`** — The working corpus. Agents search here, quote from here, and verify against here. Each file has a YAML header identifying its source, language, type, and key entities.

**`system/configuration.md`** — Operating settings (source location, conversion policy).

**`system/context.md`** — Project scope, research vocabulary, key actors, known gaps.

**`system/dictionary.md`** — Vocabulary extracted from the corpus: names, places, organizations, concepts, aliases.

**`system/workspace_index.md`** — Coverage and health: file counts, map coverage, extraction progress.

## Working with the workspace safely

- Treat `raw/` as evidence, not a drafting surface.
- Edit metadata headers carefully if needed, but avoid rewriting source bodies.
- Use `spinosa add` or the TUI add-files wizard when new documents arrive.
- Use `spinosa update` when framework files need refreshing.

## Related

- [Agents](/spinosa/docs/agents) — who reads and verifies these files
- [Reports](/spinosa/docs/reports) — what the output looks like
- [CLI Reference](/spinosa/docs/cli-reference) — commands for add, update, and check
