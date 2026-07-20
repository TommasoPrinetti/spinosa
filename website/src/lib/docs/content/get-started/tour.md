# Tour — Your First Ride Through Spinosa

This walkthrough takes you from zero to your first verified report. It stays practical on purpose: install, index, ask, read, repeat.

## 1. Install and create a workspace

Spinosa needs the CLI and a folder of source documents.

```bash
# One command installs everything
curl -fsSL https://github.com/TommasoPrinetti/spinosa/releases/download/stable/install.sh | bash

# Create a workspace from your document folder
spinosa new
```

The CLI asks you to choose your document folder, name the workspace, and confirm what it found. When it finishes, it prints a startup prompt for your LLM tool.

## 2. Run the startup prompt

Copy that startup prompt and run it. This is the one-time setup pass that prepares the workspace for research.

What you'll notice:

- Spinosa reads the converted files in `raw/`
- It builds the dictionary and navigation maps
- It writes a startup report so you can confirm indexing completed cleanly

Typical startup time is a few minutes for small corpora and longer for large, mixed-format collections.

## 3. Ask your first question

Once startup finishes, ask a plain-language research question in your LLM tool.

Example:

> What did the Normandy interviews say about coastal erosion?

Spinosa then searches the corpus, assembles evidence, drafts an answer, and verifies the result against the source text before handing the report back.

## 4. Read the result

Every answer comes back as a markdown report in `agent_reports/`.

The report gives you:

- A direct answer to the question
- Evidence quotes with source paths
- Analysis that separates interpretation from source text
- Limitations so you can judge scope and confidence
- A verification status showing whether the claims passed source checks

For the full anatomy of a report, including statuses and charts, use [Reports & Charts](/docs/reports).

## 5. Keep going

After the first report, the normal loop is simple:

1. Ask a narrower follow-up or a broader comparison.
2. Review the cited files in `raw/` if you want to inspect the evidence directly.
3. Add new documents when the corpus changes, then refresh the workspace.

If you want to understand what the agents are doing behind the scenes, read [Agents & Pipeline](/docs/agents). If you want the file layout and workspace internals, read [Corpus Structure](/docs/corpus).

## Next reads

- [Agents & Pipeline](/docs/agents) for how questions are routed and verified
- [Corpus Structure](/docs/corpus) for the workspace layout and index files
- [CLI Reference](/docs/cli-reference) for commands like `prepare`, `check`, and `update`
- [FAQ](/docs/faq) if startup or report generation is misbehaving
