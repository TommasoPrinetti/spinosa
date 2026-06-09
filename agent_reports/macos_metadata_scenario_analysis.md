---
type: scenario_analysis
agent: pragmatist
role: Application Slot — Real-World Scenario Simulator
mission: Find real-world scenarios where macOS metadata files cause problems for users
created: 2026-06-09
status: complete
connects_to:
  - .bin/pilosa
  - .gitignore
  - system/startup.md
---

# macOS Metadata File Filtering — Scenario Analysis

## Source Code Evidence Base

All findings are grounded in these source files:

| File | Lines | Relevance |
|------|-------|-----------|
| `.bin/pilosa` | 1159-1168 | `should_skip_source_file()` — the sole file filter for onboarding |
| `.bin/pilosa` | 1439-1508 | `scan_source()` — corpus scanning with `find -type f` |
| `.bin/pilosa` | 1601-2087 | `copy_source()` — file copy and conversion pipeline |
| `.bin/pilosa` | 2919-2922 | Post-framework-copy `.DS_Store` cleanup |
| `.gitignore` | 1-48 | Git exclusion patterns |
| `system/startup.md` | 93-106 | Phase 2.1 corpus survey with `find` exclusion list |

---

## The Gap: `should_skip_source_file()` (Line 1159-1168)

```bash
should_skip_source_file() {
  local name lower_name
  name="$(basename "$1")"
  lower_name="$(printf '%s' "$name" | tr '[:upper:]' '[:lower:]')"
  [[ "$lower_name" == "agents.md" ]] && return 0
  case "$1" in
    */.DS_Store|*/.gitkeep|*/node_modules/*|*/.git/*) return 0 ;;
    *) return 1 ;;
  esac
}
```

**Only FOUR patterns are excluded**: `.DS_Store`, `.gitkeep`, `node_modules/`, `.git/`.

**NOT excluded**:
- `._*` AppleDouble files (e.g., `._interview.pdf`, `._photo.jpg`)
- `.localized` files
- `__MACOSX` directories (though invisible to `-type f`)

Additionally, `file_ext()` (line 1170) extracts the extension from AppleDouble names incorrectly:

```bash
file_ext() {
  local name ext
  name="$(basename "$1")"         # e.g. "._interview.pdf"
  [[ "$name" == *.* ]] || { echo ""; return; }
  ext="${name##*.}"               # ext = "pdf"
  printf '%s' "$ext" | tr '[:upper:]' '[:lower:]'
}
```

A file named `._interview.pdf` is classified as extension `pdf`, which routes it through PDF/OCR processing — despite being a binary AppleDouble sidecar, not a real PDF.

---

## Scenario 1: Researcher with Finder-browsed corpus

**Setup**: A researcher has a folder of interview PDFs and images. They have opened it in Finder, creating `.DS_Store` in every subdirectory. They also have `.localized` files from macOS localization. They run `pilosa new /path/to/corpus`.

### `.DS_Store` files in subdirectories

| Aspect | Finding |
|--------|---------|
| Filtered? | **YES** — matched by `*/.DS_Store` pattern in `should_skip_source_file` |
| Scan handling | Counted as `ignored` (line 1502) — shows in scan summary as "N files ignored" |
| Copy handling | Skipped entirely — no processing attempt |
| raw/ contamination | None |
| User-visible symptom | None — completely silent. User sees "N files ignored" in scan summary |
| Verdict | **Handled correctly** |

### `._` AppleDouble files (hidden metadata companions)

| Aspect | Finding |
|--------|---------|
| Filtered? | **NO** — no `._*` pattern in `should_skip_source_file` |
| Scan handling | Classified as `ocr_convertible` (for `._*.pdf` or `._*.jpg`) or `unknown` (for other extensions) |
| Copy handling | **PROCESSED AS REAL CONTENT** — OCR attempted on binary garbage |
| raw/ contamination | **YES** — garbage `.md` files created from OCR of AppleDouble binary data |
| User-visible symptom | (1) Inflated file counts in scan summary ("N scanned PDFs and images available for OCR"). (2) Garbage `.md` files in `raw/` with nonsensical OCR output. (3) Data loss risk if the real source PDF was not also copied (AppleDouble shadows real file). (4) Processing time wasted on OCR of non-image files |
| Verdict | **BREAKS** — garbage data ingested into the corpus |

**Root cause**: `file_ext()` returns `pdf` for `._interview.pdf`, routing it through `is_rapidocr_pdf()` to `is_text_based_pdf()` — classified as `ocr_convertible` (scanned PDF needing OCR).

### `.localized` files

| Aspect | Finding |
|--------|---------|
| Filtered? | **NO** — `should_skip_source_file` has no `.localized` pattern |
| Scan handling | Classified as `unknown` — shows in scan summary as "N unsupported or unknown files" |
| Copy handling | Harmlessly excluded — no copy loop matches extension `localized` |
| raw/ contamination | None — never reaches copy stage |
| User-visible symptom | Slightly inflated "unknown files" count in scan summary |
| Verdict | **Minor cosmetic issue** — correctly excluded from processing but counted as "unknown" |

### `__MACOSX` directories (from zip extraction)

| Aspect | Finding |
|--------|---------|
| Filtered? | N/A — not files |
| Scan handling | **Invisible** — `find "$source_path" -type f` only returns regular files |
| Copy handling | Not created in `raw/` — copy loops iterate over files, not directories |
| raw/ contamination | None |
| User-visible symptom | None |
| Verdict | **No impact** — `__MACOSX` dirs are invisible to file-based processing |

---

## Scenario 2: Cross-platform team (macOS commits, Linux checks)

**Setup**: User A on macOS creates a workspace, commits to git. User B on Linux clones and runs `pilosa check`.

### `.gitignore` Coverage Audit

```
.DS_Store       ✓  — excluded
.DS_Store?      ✓  — excludes .DS_Store with extra suffix chars
._*             ✓  — excludes ALL AppleDouble files
*.localized     ✓  — matches .localized (the * matches empty prefix)
.Spotlight-V100 ✓
.Trashes        ✓
```

**Coverage verdict**: All macOS metadata file types are covered in `.gitignore`.

### What leaks through git

| Artifact | .gitignore | Leaks? |
|----------|------------|--------|
| `.DS_Store` | `.DS_Store` | No |
| `._*` | `._*` | No |
| `.localized` | `*.localized` | No |
| `__MACOSX/` | not in .gitignore | **Potential leak** — directories not matched by any pattern |

**`__MACOSX` directory concern**:
- `.gitignore` has no pattern for `__MACOSX` (e.g., `__MACOSX/` or `**/__MACOSX`)
- However, `pilosa new` does NOT copy directories (only files), so `__MACOSX/` would not appear in `raw/`
- Only a concern if `__MACOSX/` is somehow in the framework tree or workspace root

**`pilosa check` on Linux**:
- `cmd_check()` (line 3334-3497) validates: required files, placeholders, setup status, source location, maps
- It does NOT scan `raw/` contents for stray files
- A workspace with `._*` files in `raw/` (from Scenario 1) would pass `pilosa check` **silently**
- Only if `._*` files overwrote real source files would errors surface later (broken wikilinks, missing content)

**Verdict**: Git tracking is well-handled by `.gitignore`. The silent risk is that `._*` files in `raw/` are never validated by `pilosa check`.

---

## Scenario 3: CI/CD Pipeline

**Setup**: CI runner on Linux processes a corpus synced from macOS via rsync (which preserves `._` files). The CI runs `pilosa new`.

### The rsync factor

When syncing from macOS to Linux via `rsync -a`:
- macOS resource forks are stored as `._` sidecar files
- `rsync -a` (archive mode) preserves these as regular files on Linux
- On Linux, `._` files are visible to `find -type f`

### What breaks

| Aspect | Finding |
|--------|---------|
| `._*.pdf` files | Classified as `ocr_convertible` — OCR attempted on binary garbage |
| `._*.jpg` / `._*.png` | Classified as `ocr_convertible` — same problem |
| `._*.docx` / `._*.xlsx` | Routed to MarkItDown as Office docs — processing binary garbage |
| CI pipeline impact | (1) Build time inflated by OCR/MarkItDown of non-content files. (2) OCR binary may crash on non-image input. (3) Garbage `.md` output written to `raw/`. (4) Pipeline cache/artifact storage bloated. (5) Subsequent startup agent finds garbage files and wastes time processing them |
| CI failure modes | If `rapidocr_ocr_available()` returns true and OCR is selected, the pipeline may: (a) hang on binary input, (b) crash with non-zero exit, (c) complete with silently corrupted data |
| Debugging difficulty | Very high — CI logs show "OCR completed: N converted, M skipped" with no indication that processed files were garbage |
| Current filter handling | **Inadequate** — no `._*` exclusion in `should_skip_source_file` |

**Verdict**: **BREAKS silently** — CI pipeline produces garbage data with no warning. This is the most dangerous scenario because CI environments are least likely to have human oversight catching the issue.

---

## Scenario 4: USB Drive from Mac to Linux

**Setup**: User copies corpus from a Mac-formatted USB drive to a Linux machine. The drive has `._` files and `.DS_Store` from the macOS filesystem. They run `pilosa new`.

### Cross-platform filesystem context

| Filesystem | macOS behavior | Linux behavior |
|------------|----------------|----------------|
| HFS+ / APFS (native Mac) | `._` files hidden by FS metadata | Not mountable on standard Linux |
| ExFAT (common USB format) | macOS creates `._` for resource forks | `._` files are **VISIBLE** as regular files |
| FAT32 (legacy USB format) | macOS creates `._` for resource forks | `._` files are **VISIBLE** as regular files |
| NTFS (Windows USB format) | macOS creates `._` files | `._` files visible on Linux |

This means: **any USB drive formatted for cross-platform use will have `._` files visible to Linux.**

### What breaks

Same as Scenario 1 + additional concerns:

| Aspect | Finding |
|--------|---------|
| `._*.pdf` | **OCR'd as scanned PDF** — garbage output |
| `._*.docx` / `._*.xlsx` | **MarkItDown processed** — garbage output |
| `.DS_Store` | Correctly filtered |
| `._` overwriting real files | **HIGH RISK** — if `._photo.jpg` is processed before `photo.jpg`, OCR is wasted. If `._photo.jpg` gets converted and `photo.jpg` is skipped (already-exists check), the real image is never processed |
| `._` + real file both processed | **Bloat** — both the real content AND the garbage AppleDouble are processed, doubling processing time and storage |
| User confusion | "Why did my PDF turn into nonsense?" or "Why does my corpus have duplicate content?" |

### Specific code path for `._photo.jpg`:

1. `classify_source_file("._photo.jpg")`:
   - `should_skip_source_file` returns 1 — NOT skipped (no pattern match)
   - `file_ext` returns `jpg`
   - Not in MARKDOWN_EXTENSIONS
   - Not in MARKITDOWN_EXTENSIONS
   - Not in NATIVE_EXTENSIONS
   - `is_rapidocr_pdf` — no (ext is jpg, not pdf)
   - `case "$ext"` — matches `jpg|jpeg|png|...` — `echo "ocr_convertible"`
2. OCR'd as image — garbage output from binary AppleDouble data
3. Real `photo.jpg` may also be OCR'd — duplicate processing

**Verdict**: **BREAKS with highest user impact** — this is the most common real-world scenario and the current filter offers no protection. Users see garbage content with no clear explanation.

---

## Summary Matrix

| Artifact | Scenario 1 (Finder) | Scenario 2 (Git) | Scenario 3 (CI) | Scenario 4 (USB) | Fix Priority |
|----------|---------------------|------------------|-----------------|------------------|--------------|
| `.DS_Store` | Handled | .gitignore | Handled | Handled | Low |
| `._*` AppleDouble | **BREAKS** | .gitignore only | **BREAKS** | **BREAKS** | **CRITICAL** |
| `.localized` | Cosmetic only | .gitignore only | Cosmetic only | Cosmetic only | Low |
| `__MACOSX/` | No impact | Minor gap | No impact | No impact | Low |

---

## Fix Required

### Primary Fix: Add `._*` to `should_skip_source_file()` (CRITICAL)

In `.bin/pilosa`, line 1159-1168, add a pattern for AppleDouble files:

```bash
should_skip_source_file() {
  local name lower_name
  name="$(basename "$1")"
  lower_name="$(printf '%s' "$name" | tr '[:upper:]' '[:lower:]')"
  [[ "$lower_name" == "agents.md" ]] && return 0
  case "$name" in
    .DS_Store|.gitkeep|._*) return 0 ;;
  esac
  case "$1" in
    */node_modules/*|*/.git/*) return 0 ;;
    *) return 1 ;;
  esac
}
```

Key change: Use `$name` (basename) for name-based patterns, and add `._*` glob to catch all AppleDouble files regardless of extension.

### Secondary Fix: Add `__MACOSX` to `.gitignore`

```
__MACOSX/
```

### Tertiary Fix: Add `._*` exclusion to startup survey `find` command

In `system/startup.md`, line 103:

```bash
find raw/ -type f -not -name ".DS_Store" -not -name "._*" -not -name "AGENTS.md" -not -name "INDEX.md" -not -name "REPO_GUIDE.md" -not -name ".gitkeep" | wc -l
```

### Validation: `pilosa check` should warn about stray macOS files

Add a check in `cmd_check()` to scan `raw/` for files matching `._*` patterns and emit a warning if found.

---

## Verifier Note

This analysis was produced through direct code reading of:
- `/Users/tommasoprinetti/Documents/pilosa-main/.bin/pilosa` — all 4450 lines (entry point, file classification, copy pipeline)
- `/Users/tommasoprinetti/Documents/pilosa-main/.gitignore` — 90 lines (git exclusion patterns)
- `/Users/tommasoprinetti/Documents/pilosa-main/system/startup.md` — 499 lines (workspace indexing protocol)

All claims about code behavior are traceable to specific line numbers in these files.
