#!/bin/bash
# sync-agents.sh — Generate vendor-specific agent mirrors and sync skills
#
# Source of truth:
#   - .agents/agents/*.md → canonical agent definitions
#   - .agents/skills/*/SKILL.md + references/ → skills
#   - AGENTS.md → CLAUDE.md (Claude Code reads this automatically)
#
# Destinations (generated, platform-specific frontmatter):
#   - .opencode/agents/   — mode: subagent, permission: (singular)
#   - .claude/agents/     — tools: (comma-separated)
#   - .claude/skills/
#   - .codex/skills/
#   - CLAUDE.md
#
# Not synced (manually maintained):
#   - .codex/agents/*.toml  — Codex-native TOML agent definitions
#   - .github/copilot-instructions.md — Copilot-specific instructions
#
# Usage: bash .bin/sync-agents.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

echo "=== Pilosa Agent Sync ==="
echo "Source: $REPO_ROOT/.agents/agents/"
echo ""

# ── Clean stale mirrors ──────────────────────────────────────────────
echo "--- Cleaning stale mirrors ---"
rm -rf "$REPO_ROOT/.kilocode"
echo "  Removed .kilocode/"
rm -rf "$REPO_ROOT/.opencode/skills"
echo "  Removed .opencode/skills/"

# ── Sync agent definitions ───────────────────────────────────────────
echo ""
echo "--- Syncing agent definitions ---"

# Ensure destination directories exist
mkdir -p "$REPO_ROOT/.opencode/agents"
mkdir -p "$REPO_ROOT/.claude/agents"

# Clean existing vendor agent files
rm -f "$REPO_ROOT/.opencode/agents/"*.md
rm -f "$REPO_ROOT/.claude/agents/"*.md

for canonical in "$REPO_ROOT/.agents/agents/"*.md; do
    [ -f "$canonical" ] || continue
    agent_file=$(basename "$canonical")
    agent="${agent_file%.md}"

    # ── Parse canonical frontmatter ──────────────────────────────────
    name=""
    description=""
    permissions=""

    # Extract frontmatter block (between --- delimiters)
    frontmatter=$(sed -n '/^---$/,/^---$/p' "$canonical" | sed '1d;$d')

    # Parse name
    name=$(echo "$frontmatter" | sed -n 's/^name: *//p' | head -1)

    # Parse multiline description (description: through next top-level key)
    description=$(sed -n '/^description:/,/^permissions:/p' "$canonical" | sed '/^description:/d;/^permissions:/d' | sed 's/^ *//' | tr -s ' ')
    [ -z "$description" ] && description="$agent"

    # Parse permissions (skip list items starting with dashes)
    in_permissions=false
    while IFS= read -r line; do
        # Only check for closing --- AFTER we've entered permissions
        if $in_permissions && [[ "$line" == "---" ]]; then
            break
        fi
        if [[ "$line" =~ ^permissions: ]]; then
            in_permissions=true
            continue
        fi
        if $in_permissions; then
            # New top-level key (not indented) ends permissions block
            if [[ "$line" =~ ^[a-z] ]] && ! [[ "$line" =~ ^[[:space:]] ]]; then
                break
            fi
            # Skip list items (lines starting with spaces + dash)
            [[ "$line" =~ ^[[:space:]]*-[[:space:]] ]] && continue
            # Extract key: value pairs
            if [[ "$line" =~ ^[[:space:]]*([a-z]+):[[:space:]]*(.*) ]]; then
                key="${BASH_REMATCH[1]}"
                value="${BASH_REMATCH[2]}"
                [ -z "$value" ] && value="allow"
                permissions="$permissions$key: $value, "
            fi
        fi
    done < "$canonical"
    permissions="${permissions%, }"

    # ── Emit OpenCode agent ──────────────────────────────────────────
    opencode_perms=""
    IFS=',' read -ra perm_parts <<< "$permissions"
    for part in "${perm_parts[@]}"; do
        part="${part## }"  # trim leading space
        part="${part%% }"  # trim trailing space
        [ -z "$part" ] && continue
        key="${part%%:*}"
        val="${part#*: }"
        case "$key" in
            read|grep|glob) opencode_perms="$opencode_perms  $key: $val"$'\n' ;;
            write)          opencode_perms="$opencode_perms  edit: $val"$'\n' ;;
            move)           opencode_perms="$opencode_perms  bash: $val"$'\n' ;;
        esac
    done

    cat > "$REPO_ROOT/.opencode/agents/$agent_file" << OPENCODE_EOF
---
name: $name
description: |
$(echo "$description" | sed 's/^/  /')
mode: subagent
permission:
$(echo "$opencode_perms" | sed '$d')
---

$(sed '1,/^---$/d; /^---$/,$d' "$canonical" | sed '1d')
OPENCODE_EOF

    # ── Emit Claude agent ────────────────────────────────────────────
    claude_tools=""
    case "$agent" in
        pilosa-searcher)    claude_tools="Read, Grep, Glob" ;;
        pilosa-analyst)     claude_tools="Read" ;;
        pilosa-writer)      claude_tools="Read, Write" ;;
        pilosa-verifier)    claude_tools="Read, Grep, Glob, Write" ;;
        pilosa-janitor)     claude_tools="Read, Grep, Glob, Write" ;;
        pilosa-mapper)      claude_tools="Read" ;;
        pilosa-serendippo)  claude_tools="Read, Grep, Glob, Write" ;;
    esac

    cat > "$REPO_ROOT/.claude/agents/$agent_file" << CLAUDE_EOF
---
name: $name
description: |
$(echo "$description" | sed 's/^/  /')
tools: $claude_tools
---

$(sed '1,/^---$/d; /^---$/,$d' "$canonical" | sed '1d')
CLAUDE_EOF

    echo "  $agent → .opencode/agents/ + .claude/agents/"
done

# ── Sync skills ──────────────────────────────────────────────────────
echo ""
echo "--- Syncing skills ---"
for platform in .claude .codex; do
    dest="$REPO_ROOT/$platform/skills"
    rm -rf "$dest"
    mkdir -p "$dest"
    # Copy each skill directory
    for skill_dir in "$REPO_ROOT/.agents/skills"/*/; do
        [ -d "$skill_dir" ] || continue
        skill_name=$(basename "$skill_dir")
        mkdir -p "$dest/$skill_name"
        # Copy SKILL.md and any other .md files from skill root
        cp "$skill_dir"*.md "$dest/$skill_name/" 2>/dev/null || true
        # Copy references/ subdirectory if it exists
        if [[ -d "$skill_dir/references" ]]; then
            mkdir -p "$dest/$skill_name/references"
            cp "$skill_dir/references/"*.md "$dest/$skill_name/references/" 2>/dev/null || true
        fi
    done
    count=$(find "$dest" -name "SKILL.md" | wc -l)
    echo "  $platform/skills/ → $count skills"
done

# ── Sync CLAUDE.md ──────────────────────────────────────────────────
echo ""
echo "--- Syncing CLAUDE.md ---"
cp "$REPO_ROOT/AGENTS.md" "$REPO_ROOT/CLAUDE.md"
echo "  CLAUDE.md → updated"

echo ""
echo "=== Sync complete ==="
