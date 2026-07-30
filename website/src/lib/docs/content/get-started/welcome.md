# Welcome to Spinosa

Spinosa turns a folder of research documents into a local workspace you can chat with. Ask questions in plain language. Spinosa searches your files, drafts an answer, and checks every claim against the original text.

Local-first: your documents and indexes stay on your machine. When you connect a cloud model provider, prompts and context are sent to that provider for inference.

## Quick start

```bash
# Install (macOS, Linux)
curl -fsSL https://github.com/medialab/spinosa/releases/download/stable/install.sh | bash

# Launch the dashboard
spinosa
```

The first time you run `spinosa`, you'll see the workspace picker. Click **+ New workspace** and follow the 11-step wizard: pick your document folder, name the workspace, review what was found, and choose your preferred AI coding tool.

When the wizard finishes, you'll see a chat prompt. Ask your first question.

## What you get

- A chat interface connected to your documents
- A workspace on disk with your converted files, configuration, and reports
- Reports with evidence quotes, source paths, and a verification status
- A visualizer to explore how your AI agent worked through your question

## Next steps

- [Tour](/spinosa/docs/tour) — full walkthrough from install to first verified report
- [TUI Guide](/spinosa/docs/tui) — how to navigate the Spinosa dashboard
- [Agents](/spinosa/docs/agents) — how the AI agents divide the work
- [Reports](/spinosa/docs/reports) — how to read verification statuses and charts
