# Welcome to Spinosa

You have a folder of interviews, PDFs, field notes, reports. You need to find patterns, compare perspectives, write evidence-backed answers. Spinosa turns your documents into a searchable workspace where AI agents find evidence, write reports, and verify every claim against your original files.

No cloud. No uploads. Your documents stay on your machine.

## What Spinosa does for you

| You have... | Spinosa gives you... |
|---|---|
| 200 PDFs from field research | A searchable workspace where agents know every file |
| A question like "what did participants say about X?" | A report with direct quotes, source links, and confidence levels |
| Concerns about accuracy | Every claim checked against the original file by a dedicated verifier |
| New files later | Add them with one command — the workspace updates automatically |

## Who are you?

**I have documents and questions.**
Start with the [Tour →](TOUR.md) — a 10-minute walkthrough from install to your first report. No technical background needed.

**I set things up and configure.**
Read the [Tour →](TOUR.md) first, then dive into [Reference/](reference/) for agents, CLI, and corpus details.

**I'm just evaluating.**
Read this page and the [Tour →](TOUR.md). That's enough to understand what Spinosa does.

## Quick start

```bash
# Install (macOS or Linux)
curl -fsSL https://github.com/TommasoPrinetti/spinosa/releases/latest/download/install.sh | bash

# Create a workspace from your document folder
spinosa new
```

The CLI walks you through picking your document folder and naming the project. When it finishes, it prints a startup prompt — copy and run it with your LLM tool (OpenCode, Gemini CLI, Qwen Code, Claude Code, Codex, or Kilo). Then ask your first question.

## How it works in plain English

1. **Spinosa copies your documents** into a `raw/` folder, converting PDFs, Word docs, images (OCR), and other formats to plain text.
2. **An agent reads every file** — it builds a dictionary of names, places, and key terms. It creates navigation maps so future searches know where to look.
3. **You ask a question** — Spinosa dispatches specialized agents: one searches for evidence, one provides context, one checks for hidden connections.
4. **A writer composes your report** — it weaves the evidence into a structured document with quotes, analysis, and source links.
5. **A verifier checks every claim** — it goes back to the original files and confirms each quote is accurate. Nothing gets reported without source verification.

## Next steps

- Walk through the full flow → [Tour](TOUR.md)
- Look up terms → [Glossary](GLOSSARY.md)
- Common questions → [FAQ](FAQ.md)
- Technical reference → [Reference/](reference/)
