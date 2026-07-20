<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="workspace-template/assets/Banner_Spinosa_new.png">
    <img src="workspace-template/assets/Banner_Spinosa_new.png" alt="Spinosa Framework" width="100%">
  </picture>
</p>

# Spinosa

[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Spinosa turns a folder of research documents into a local workspace you can chat with. Ask questions in plain language. AI agents search your files, draft answers, and verify every claim against the original text.

**No cloud, no uploads.** All processing happens on your machine.

---

## Cold start

```bash
# 1. Install (macOS / Linux)
curl -fsSL https://github.com/medialab/spinosa/releases/download/stable/install.sh | bash

# 2. Launch the dashboard
spinosa
```

The first time you run `spinosa`, you'll see the workspace picker. Click **+ New workspace** and follow the wizard: pick your document folder, name the workspace, choose your AI coding tool, and start asking questions.

---

## Quick reference

| What you want | How |
|---------------|-----|
| Launch the TUI | `spinosa` |
| Create a workspace from the terminal | `spinosa create ~/research/papers` |
| Add more files | `spinosa add ~/research/more-papers` |
| Update the framework | `spinosa upgrade` |
| List workspaces | `spinosa list` |
| Check system health | `spinosa doctor` |

---

## What it does

| You have... | Spinosa gives you... |
|---|---|
| 200 PDFs from field research | A searchable workspace that knows every file |
| "What did participants say about X?" | A report with quotes, source paths, and a verification badge |
| Concerns about accuracy | Every claim checked against the original file |
| New files later | Add them without starting over |

## Supported formats

PDFs, Word docs, spreadsheets, presentations, EPUB, HTML, ZIP, Outlook messages, images (OCR), CSVs, Markdown — all converted to searchable text.

## Requirements

- macOS or Linux
- ~500 MB disk space for the framework and dependencies

## Links

- [Documentation](https://medialab.github.io/spinosa/)
- [License (MIT)](LICENSE)
