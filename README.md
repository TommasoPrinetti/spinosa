<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="workspace-template/assets/Banner_Spinosa_new.png">
    <img src="workspace-template/assets/Banner_Spinosa_new.png" alt="Spinosa Framework" width="100%">
  </picture>
</p>

# Spinosa

[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Spinosa is a **local research framework** for AI coding agents. Give it a folder of PDFs, notes, transcripts, images, CSVs. It builds a workspace where agents can search, analyse, synthesise, and verify evidence from those sources. Every claim traces back to a file you provided.

**No cloud, no uploads.** All document processing happens on your machine.

---

## Install

### macOS / Linux (one-liner)

```bash
curl -fsSL https://github.com/medialab/spinosa/releases/download/stable/install.sh | bash
```

### Beta channel

```bash
curl -fsSL https://github.com/medialab/spinosa/releases/download/beta/install.sh | bash
```

### Specific version

```bash
curl -fsSL https://github.com/medialab/spinosa/releases/download/v0.9.0-beta.1/install.sh | bash
```

After install, restart your terminal or run:

```bash
source ~/.zshrc   # or ~/.bashrc
```

Verify:

```bash
spinosa --help
```

---

## Quick start

```bash
# Create a workspace from a folder of documents
spinosa create /path/to/your/documents

# Or add files to an existing workspace
spinosa add /path/to/new/files
```

---

## Upgrade

```bash
# Stable channel (default)
spinosa upgrade

# Beta channel
spinosa upgrade --channel beta

# Specific version
spinosa upgrade --version 0.9.0-beta.1
```

---

## What it does

| You have... | Spinosa gives you... |
|---|---|
| 200 PDFs from field research | A searchable workspace where agents know every file |
| A question like "what did participants say about X?" | A report with direct quotes, source links, and confidence levels |
| Concerns about accuracy | Every claim checked against the original file by a dedicated verifier |
| New files later | Add them with one command and update the workspace |

---

## Supported formats

PDFs, Word docs, spreadsheets, presentations, EPUB, HTML, ZIP, Outlook messages, images (OCR), CSVs, Markdown — all converted to `.md` where possible.

---

## Requirements

- macOS or Linux
- [Bash](https://www.gnu.org/software/bash/) (installed by default on most systems)
- ~500 MB disk space for the framework + dependencies

---

## Links

- [License (MIT)](LICENSE)
- [Security policy](SECURITY.md)
- [Contributing](CONTRIBUTING.md)
- [Support](SUPPORT.md)
