---
description: Maps tool names and command patterns to operation categories for evidence reporting.
---

# Operation Classification

## Operation categories

| Category | Includes | Examples |
|----------|----------|----------|
| `read` | Reading file content | `read` tool, `cat`, `head`, `bat`, `less` |
| `search` | Content search, pattern matching | `grep`, `rg`, `ag`, `ack` |
| `list` | Listing files/directories | `glob` tool, `ls`, `find`, `fd`, `tree` |
| `edit` | Modifying files | `edit` tool, `apply_patch`, `sed -i`, `echo > file`, `patch` |
| `write` | Creating new files | `write` tool, `echo > newfile`, `touch` |
| `command` | Other shell commands | `npm`, `git`, `python`, `make`, `docker`, `curl` |
| `web` | Web fetches and searches | `webfetch`, `websearch` tools, `curl URL` |
| `meta` | Environment, config, metadata | `pwd`, `date`, `which`, `env`, `node --version` |

## Tool name mapping

### OpenCode → normalized

| OpenCode tool | Normalized | Category |
|---------------|------------|----------|
| `read` | `read` | `read` |
| `edit` | `edit` | `edit` |
| `write` | `write` | `write` |
| `bash` | `bash` | (depends on command — see below) |
| `glob` | `glob` | `list` |
| `grep` | `grep` | `search` |
| `task` | `task` | `command` |
| `todowrite` | `todowrite` | `meta` |
| `webfetch` | `webfetch` | `web` |
| `websearch` | `websearch` | `web` |

### Codex → normalized

| Codex tool | Normalized | Category |
|------------|------------|----------|
| `exec_command` | `bash` | (depends on command — see below) |
| `apply_patch` | `edit` | `edit` |
| `Write` | `write` | `write` |
| `Edit` | `edit` | `edit` |
| `spawn_agent` | `task` | `command` |
| `wait_agent` | `task` | `command` |
| `close_agent` | `task` | `command` |
| `mcp__*` | (extract after `mcp__`) | varies |

### Bash command → category

When tool is `bash` / `exec_command`, classify by the first command word:

| Command prefix | Category |
|----------------|----------|
| `cat`, `head`, `tail`, `less`, `more`, `bat`, `nl` | `read` |
| `grep`, `rg`, `ag`, `ack` | `search` |
| `ls`, `find`, `fd`, `tree` | `list` |
| `sed`, `patch` | `edit` |
| `echo`, `printf`, `touch` (with `>` or `>>`) | `write` |
| `npm`, `pnpm`, `yarn`, `bun`, `pip`, `uv`, `cargo` | `command` |
| `git`, `gh` | `command` |
| `python`, `python3`, `node`, `deno`, `bun`, `tsx` | `command` |
| `docker`, `docker-compose` | `command` |
| `curl`, `wget`, `httpie` | `web` |
| `pwd`, `date`, `which`, `whoami`, `id`, `env`, `printenv` | `meta` |
| `cd`, `pushd`, `popd` | `meta` (navigation) |
| `mkdir`, `cp`, `mv`, `rm`, `ln` | `command` |
| `chmod`, `chown` | `command` |
| `source`, `.`, `export` | `meta` |
| `make`, `just`, `task` | `command` |
| `jq`, `yq` | `command` (transform) |

## Classification priority

1. If the tool has a dedicated handler (`read`, `edit`, `write`, `grep`, `glob`, `webfetch`), use that category directly.
2. For `bash` / `exec_command`, parse the first word of `args.command` against the bash command table.
3. For compound commands (`&&`, `|`, `;`), use the primary operation (first command before the operator).
4. If unclassifiable, mark as `command` with note `"unclassified"`.
