# Welcome to Spinosa

Spinosa turns a folder of source documents into a local research workspace. You ask questions in plain language. Agents search your files, draft an answer, and verify the evidence against the originals before you use it.

No cloud. No uploads. Your documents stay on your machine.

## What Spinosa gives you

| You have...                                          | Spinosa gives you...                                               |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| A folder of interviews, PDFs, field notes, reports   | A searchable workspace built from local copies of those files      |
| A question like "what did participants say about X?" | A report with quotes, source paths, and a verification status      |
| Concerns about accuracy                              | A verifier that checks claims back against the original text       |
| New material later                                   | A way to add files and refresh the workspace without starting over |

## Start here

- New to Spinosa: read the [Tour](/docs/tour) for the shortest path from install to first report.
- Want the mental model: read [Agents & Pipeline](/docs/agents), [Corpus Structure](/docs/corpus), and [Reports & Charts](/docs/reports).
- Need command syntax: jump to [CLI Reference](/docs/cli-reference).
- Need definitions or troubleshooting: use [Glossary](/docs/glossary) and [FAQ](/docs/faq).

## Quick start

```bash
# Install (macOS or Linux)
curl -fsSL https://github.com/TommasoPrinetti/spinosa/releases/download/stable/install.sh | bash

# Create a workspace from your document folder
spinosa new
```

The CLI walks you through choosing your document folder and naming the workspace. When it finishes, it prints a startup prompt for your LLM tool. Run that prompt, let Spinosa index the corpus, then ask your first question.

## What happens next

1. Spinosa copies and converts your documents into a local workspace.
2. Startup builds the workspace index, dictionary, and navigation maps.
3. You ask a question in your LLM tool.
4. Spinosa returns a markdown report with evidence, analysis, sources, and verification status.

## Next reads

- [Tour](/docs/tour) for the full first-run walkthrough
- [Corpus Structure](/docs/corpus) for the workspace layout and configuration files
- [Reports & Charts](/docs/reports) for how to read the output
- [FAQ](/docs/faq) if you're already troubleshooting
