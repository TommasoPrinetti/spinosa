#!/usr/bin/env bash
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
#   - .codex/agents/      — Codex-native TOML generated from canonical body
#   - .claude/skills/
#   - .codex/skills/
#   - CLAUDE.md
#
# Not synced (manually maintained):
#   - .github/copilot-instructions.md — Copilot-specific instructions
#
# Usage: bash .bin/sync-agents.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

echo "=== Spinosa Agent Sync ==="
echo "Source: $REPO_ROOT/.agents/agents/"
echo ""

# ── Clean stale mirrors ──────────────────────────────────────────────
echo "--- Cleaning stale mirrors ---"
rm -rf "$REPO_ROOT/.opencode/skills"
echo "  Removed .opencode/skills/"

# ── Sync agent definitions ───────────────────────────────────────────
echo ""
echo "--- Syncing agent definitions ---"

# Ensure destination directories exist
mkdir -p "$REPO_ROOT/.opencode/agents"
mkdir -p "$REPO_ROOT/.claude/agents"
mkdir -p "$REPO_ROOT/.codex/agents"

# Clean existing vendor agent files
rm -f "$REPO_ROOT/.opencode/agents/"*.md
rm -f "$REPO_ROOT/.claude/agents/"*.md
rm -f "$REPO_ROOT/.codex/agents/"*.toml

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

    # Parse multiline description (description: | through next top-level key)
    description=$(sed -n '/^description: |/,/^[a-z]/p' "$canonical" | sed '/^description:/d;/^[a-z]/d' | sed 's/^  //' | tr -s ' ')
    [ -z "$description" ] && description="$agent"

    toml_escape() {
        printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
    }

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

$(awk 'BEGIN{fm=0} /^---$/ && fm < 2 {fm++; next} fm == 2' "$canonical")
OPENCODE_EOF

    # ── Emit Claude agent ────────────────────────────────────────────
    claude_tools=""
    case "$agent" in
        spinosa-searcher)    claude_tools="Read, Grep, Glob" ;;
        spinosa-analyst)     claude_tools="Read" ;;
        spinosa-writer)      claude_tools="Read, Write" ;;
        spinosa-verifier)    claude_tools="Read, Grep, Glob, Write" ;;
        spinosa-janitor)     claude_tools="Read, Grep, Glob, Write" ;;
        spinosa-mapper)      claude_tools="Read, Write" ;;
        spinosa-serendippo)  claude_tools="Read, Grep, Glob, Write" ;;
    esac

    cat > "$REPO_ROOT/.claude/agents/$agent_file" << CLAUDE_EOF
---
name: $name
description: |
$(echo "$description" | sed 's/^/  /')
tools: $claude_tools
---

$(awk 'BEGIN{fm=0} /^---$/ && fm < 2 {fm++; next} fm == 2' "$canonical")
CLAUDE_EOF

    # ── Emit Codex agent ─────────────────────────────────────────────
    body_content="$(awk 'BEGIN{fm=0} /^---$/ && fm < 2 {fm++; next} fm == 2' "$canonical")"

    cat > "$REPO_ROOT/.codex/agents/${agent}.toml" << CODEX_EOF
name = "$(toml_escape "$name")"
description = "$(toml_escape "$description")"
developer_instructions = '''
$body_content
'''
CODEX_EOF

    echo "  $agent → .opencode/agents/ + .claude/agents/ + .codex/agents/"
done

# ── Sync skills ──────────────────────────────────────────────────────
echo ""
echo "--- Syncing skills ---"
for platform in .opencode .claude .codex; do
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
    count=$(find "$dest" -name "SKILL.md" | wc -l | tr -d ' ')
    echo "  $platform/skills/ → $count skills"
done

# ── Sync CLAUDE.md ──────────────────────────────────────────────────
echo ""
echo "--- Syncing CLAUDE.md ---"
cp "$REPO_ROOT/AGENTS.md" "$REPO_ROOT/CLAUDE.md"
today="$(date +%Y-%m-%d)"
# Update updated date and add provenance fields in the frontmatter block
sed -i.bak \
  -e 's/^updated:.*/updated: '"$today"'/' \
  -e '/^updated:/a\'$'\n''generated_by: sync-agents\'$'\n''generated_at: '"$today"''$'\n''processing_status: auto_generated' \
  "$REPO_ROOT/CLAUDE.md" 2>/dev/null || \
sed -i '' \
  -e 's/^updated:.*/updated: '"$today"'/' \
  -e '/^updated:/a\
generated_by: sync-agents\
generated_at: '"$today"'\
processing_status: auto_generated' \
  "$REPO_ROOT/CLAUDE.md" 2>/dev/null || true
rm -f "$REPO_ROOT/CLAUDE.md.bak"
echo "  CLAUDE.md → updated"

echo ""
echo "=== Sync complete ==="
