# CLI Reference

The `spinosa` CLI manages workspace creation, validation, sync, maintenance, and upgrades. A `pilosa` migration shim also exists for backward compatibility and redirects to `spinosa`.

## Command reference

### spinosa new

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

### spinosa prepare <workspace>

Re-run setup on an existing workspace.

### spinosa update <workspace>

Update framework files from a release. Preserves your data (configuration, context, dictionary, workspace index, logs).

### spinosa upgrade

Upgrade the CLI to the latest release. Downloads and verifies checksums automatically.

### spinosa check <workspace>

Validate workspace structure and settings. Reports missing files, broken paths, configuration issues.

### spinosa health

Check system status and which conversion engines are available on this machine.

### spinosa sync

Sync agent and skill definitions between the canonical `.agents/` directory and vendor-specific directories (`.claude/`, `.opencode/`, `.codex/`).

### spinosa uninstall

Remove Spinosa from the system. Your workspace folders stay in place.

### spinosa help

Show the help message.

## File classification

During `spinosa new` and source intake, each file is classified and routed to the right engine:

| Category                 | File types                                                                           | What happens                            |
| ------------------------ | ------------------------------------------------------------------------------------ | --------------------------------------- |
| **Markdown-convertible** | txt, rtf, wiki files, yaml, toml, css, js, py, rb, sh, log, tex, bib, org, adoc, rst | Renamed to `.md` (no conversion needed) |
| **MarkItDown**           | docx, pptx, xlsx, xls, epub, html, msg, zip, text-based PDF                          | Converted to `.md`                      |
| **OCR**                  | scanned PDF, jpg, png, gif, webp, heic, tif, bmp, svg                                | OCR-processed to `.md`                  |
| **Native**               | md, csv, json, yaml, xml, log, org, adoc, rst, tex, bib                              | Copied unchanged                        |
| **Skipped**              | mp4, mov, avi, mkv (video), mp3, wav, aac, flac (audio)                              | Left at source location                 |
| **Ignored**              | AGENTS.md, .DS*Store, .*\*, node_modules, .git                                       | Skipped entirely                        |

## PDF classification

PDFs are automatically classified as text-based (routed to MarkItDown) or image-based (routed to OCR):

1. Encrypted PDFs → OCR
2. PDFs with embedded fonts → MarkItDown
3. PDFs with no extractable text → OCR
4. Fallback: `pdftotext` check (if available) → MarkItDown if it returns text

## Environment variables

| Variable             | Purpose                                                     |
| -------------------- | ----------------------------------------------------------- |
| `NO_COLOR=1`         | Disable ANSI colors in output                               |
| `USE_GUM=1`          | Use gum for enhanced interactive menus                      |
| `SPINOSA_HOME`       | Override the installation directory (default: `~/.spinosa`) |
| `SPINOSA_NO_EMOJI=1` | Disable emoji in output                                     |

## Common task map

- First-time setup: `spinosa new`
- Add or refresh workspace setup: `spinosa prepare <workspace>`
- Validate a workspace that looks wrong: `spinosa check <workspace>`
- Update framework files in an existing workspace: `spinosa update <workspace>`
- Upgrade the installed CLI itself: `spinosa upgrade`

## Next reads

- [Tour](/docs/tour) for the first-run flow around `spinosa new`
- [Corpus Structure](/docs/corpus) for what the commands create and maintain
- [FAQ](/docs/faq) for command-not-found and setup troubleshooting
- [Glossary](/docs/glossary) for terms like corpus, workspace, and OCR
