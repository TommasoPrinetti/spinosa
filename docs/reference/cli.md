# CLI Reference

The `spinosa` CLI manages workspace creation, validation, and upgrades.

## Commands

### `spinosa new`

Create a workspace from your document folder.

- Scans the folder and classifies each file by type
- Copies files into `raw/` using the appropriate conversion engine
- Fills in configuration and context files
- Prints a startup prompt to open the workspace with your LLM tool

During scanning, you'll see a summary of what was found:

```
✓ Source scan complete
├─ 12 text-based files to rename to .md (2.4 MB)
├─ 8 Office/EPUB/HTML files available for MarkItDown conversion (45 MB)
├─ 5 scanned PDFs and images available for OCR (120 MB)
├─ 3 native files to copy unchanged (1.1 MB)
└─ 0 files ignored
```

### `spinosa add`

Add one file or a directory of files to an existing workspace.

- Uses the same classifier and conversion engines as `spinosa new`
- Reads the workspace registry in `~/.spinosa/metadata/workspaces.txt` before asking for a path
- Writes `.spinosa/add-summary.md`
- Prints a mapper prompt for updating dictionary, maps, workspace index, and verification

Examples:

```bash
spinosa add --workspace ~/Research/project-spinosa --file ~/Downloads/new-interview.docx
spinosa add --workspace ~/Research/project-spinosa --dir ~/Downloads/new-batch
```

### `spinosa upgrade`

Upgrade the CLI to the latest release. Downloads and verifies checksums automatically.

### `spinosa uninstall`

Remove Spinosa runtime files from the system. Your workspace folders stay in place, and `~/.spinosa/metadata/` is kept so future reinstalls can reuse workspace registry and configuration metadata.

### `spinosa help`

Show the help message.

## How files are classified

During `spinosa new` and source intake, each file is classified and routed to the right engine:

| Category | File types | What happens |
|---|---|---|
| **Markdown-convertible** | txt, rtf, wiki files, yaml, toml, css, js, py, rb, sh, log, tex, bib, org, adoc, rst | Renamed to `.md` (no conversion needed) |
| **MarkItDown / structured fallback** | docx, pptx, xlsx, xls, epub, html, msg, zip, csv, json, xml, wav, mp3, m4a, text-based PDF, plus extensions from `SPINOSA_MARKITDOWN_EXTRA_EXTENSIONS` | Converted to `.md`; csv/json/xml use a built-in fallback if MarkItDown is unavailable. Page-marked Markdown output is split into `raw/<source>/page-001.md` files. |
| **OCR** | scanned PDF, jpg, png, gif, webp, heic, tif, bmp, svg | OCR-processed to `.md`; multi-page PDFs are split into one Markdown file per page under a raw subfolder. |
| **Native** | md | Copied unchanged |
| **Skipped by default** | mp4, mov, avi, mkv (video), aac, flac, ogg, opus, aiff, and other audio/video not selected for import | Reported in onboarding summary unless explicitly selected |
| **Unsupported** | unknown extensions | Reported as unsupported unless a route is added |
| **Ignored** | AGENTS.md, .DS_Store, ._*, node_modules, .git, macOS privacy-sensitive system paths | Skipped entirely |

## PDF classification

PDFs are automatically classified as text-based (routed to MarkItDown) or image-based (routed to OCR):

1. Encrypted PDFs → OCR
2. PDFs with embedded fonts → MarkItDown
3. PDFs with no extractable text → OCR
4. Fallback: `pdftotext` check (if available) → MarkItDown if it returns text

## Environment variables

| Variable | Purpose |
|---|---|
| `NO_COLOR=1` | Disable ANSI colors in output |
| `SPINOSA_HOME` | Override the installation directory (default: `~/.spinosa`) |
| `SPINOSA_MARKITDOWN_ENABLE_PLUGINS=1` | Enable installed MarkItDown plugins for conversion. Disabled by default. |
| `SPINOSA_MARKITDOWN_EXTRA_EXTENSIONS` | Comma- or pipe-separated plugin extension list to route through MarkItDown first. |
| `SPINOSA_NO_EMOJI=1` | Disable emoji in output |
