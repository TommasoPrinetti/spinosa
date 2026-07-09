---
description: Heuristics for detecting file reads from tool calls and estimating coverage depth.
---

# File Read Analysis

## Detection methods

### Method 1: Direct read tool

| Runtime | Tool name | File path in |
|----------|-----------|-------------|
| OpenCode | `read` | `args.filePath` |
| OpenCode | `edit` | `args.filePath` (reads before edit) |
| Codex | `Bash` via MCP | `command` contains `cat /path` |

### Method 2: Shell commands that read files

Parse `args.command` for read commands:

| Command | Read type | Coverage signal |
|---------|-----------|-----------------|
| `cat <file>` | Full read | Entire file |
| `head -<n> <file>` | Partial read | First N lines |
| `tail -<n> <file>` | Partial read | Last N lines |
| `less <file>` | Interactive read | Unknown (heuristic: partial) |
| `bat <file>` | Full read (syntax highlight) | Entire file |
| `nl <file>` | Full read with line numbers | Entire file |
| `wc <file>` | Metadata only | 0% (only counts) |
| `file <path>` | Metadata only | 0% |
| `stat <path>` | Metadata only | 0% |
| `ls <dir>` | Listing only | 0% (directory listing) |
| `find <dir>` | Listing only | 0% (walk) |
| `tree <dir>` | Listing only | 0% (walk) |

### Method 3: Search commands that read files

| Command | Reads content | Coverage |
|---------|--------------|----------|
| `grep <pattern> <file>` | Pattern match lines only | Partial (matched lines) |
| `rg <pattern> <file>` | Pattern match lines only | Partial (matched lines) |
| `ag <pattern> <file>` | Pattern match lines only | Partial (matched lines) |
| `awk '<expr>' <file>` | Processed lines | Partial (expr-dependent) |
| `sed '<expr>' <file>` | Processed lines | Partial (expr-dependent) |
| `sed -n '<range>p' <file>` | Range read (e.g., lines 1-260) | Partial (range-specified) |

### Method 4: Glob / listing commands

| Command | What it captures |
|---------|-----------------|
| `ls <dir>` | Filenames only |
| `find <dir> -name '<pattern>'` | Filenames matching pattern |
| `fd <pattern>` | Filenames matching pattern |
| `rg --files` | All filenames in repo |
| `glob` tool (OpenCode) | Paths matching glob pattern |

## Coverage estimation heuristics

Use these when exact read size is unavailable:

| Signal | Coverage estimate | Confidence |
|--------|-------------------|------------|
| `cat <file>` | 100% | high |
| `bat <file>` | 100% | high |
| `read(<filePath>)` | 100% | high (tool reads full file) |
| `head -20 <file>` | ~first N lines | medium |
| `tail -20 <file>` | ~last N lines | medium |
| `grep <pat> <file>` | <10% (matched lines only) | low |
| `rg <pat> <file>` | <10% (matched lines only) | low |
| `less <file>` | unknown | low (interactive) |
| `wc <file>` | 0% | high |
| `ls <dir>` | 0% | high |
| Multiple reads of same file | Increment: `cat`→`grep`→`head` | track separately |

### Token estimation (approximate)

```bash
# Rough estimate: 1 token ≈ 4 characters for code
# For a file read, estimate: file_size_bytes / 4 * coverage_factor
```

## File operation classification

| Detected via | File operation |
|-------------|----------------|
| `read(<filePath>)` | `read` |
| `edit(<filePath>)` | `edit` |
| `cat`, `bat`, `head`, `tail`, `less` on file | `read` |
| `grep`, `rg`, `ag` on file | `search` |
| `ls`, `find`, `fd`, `glob` | `list` |
| `write`, `echo > file`, `tee` | `write` |

## Pattern for bash command parsing

Extract file paths from shell commands:

```bash
# Extract file paths from cat/head/tail/grep commands
jq -r '
  .args.command // "" |
  capture("(?<cmd>cat|head|tail|grep|rg|bat|less|more|nl|wc|file|stat|ls|find|fd|tree|ag|ack)\\s+(?<args>.*)") |
  .args | split(" ") | map(select(startswith("/") or startswith("./") or startswith("~")))
'
```

Note: only applies to `bash` tool calls. For the `read` tool, use `args.filePath` directly.
