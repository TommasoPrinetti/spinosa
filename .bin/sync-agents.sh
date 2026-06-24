#!/usr/bin/env bash
# sync-agents.sh — Generate vendor-specific agent mirrors and sync references
#
# Source of truth:
#   - .agents/agents/*.md → canonical agent definitions
#   - .agents/references/ → shared reference files (templates, format specs)
#   - AGENTS.md → CLAUDE.md (Claude Code reads this automatically)
#
# Destinations (generated, platform-specific frontmatter):
#   - .opencode/agents/   — mode: subagent, permission: (singular)
#   - .claude/agents/     — tools: (comma-separated)
#   - .codex/agents/      — Codex-native TOML generated from canonical body
#   - .opencode/references/ — OpenCode reference mirror
#   - .claude/references/   — Claude reference mirror
#   - .codex/references/    — Codex reference mirror
#   - .hermes/references/   — Hermes reference mirror
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
    description=$(sed -n '/^description: |/,/^[a-z]/p' "$canonical" | sed '/^description:/d;/^[a-z]/d' | sed 's/^  //' | tr '\n' ' ' | tr -s ' ')
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
            if [[ "$line" =~ ^[[:space:]]*([a-z_]+):[[:space:]]*(.*) ]]; then
                key="${BASH_REMATCH[1]}"
                value="${BASH_REMATCH[2]}"
                [ -z "$value" ] && value="allow"
                permissions="$permissions$key: $value, "
            fi
        fi
    done < "$canonical"
    permissions="${permissions%, }"

    # ── Emit platform-specific agent files ──────────────────────────
    emit_agent_file() {
        local platform="$1" agent="$2" agent_file="$3" name="$4" description="$5" permissions="$6"
        local dest_dir="$REPO_ROOT/$platform/agents"
        mkdir -p "$dest_dir"

        case "$platform" in
            .opencode)
                local oc_perms=""
                IFS=',' read -ra perm_parts <<< "$permissions"
                for part in "${perm_parts[@]}"; do
                    part="${part## }"; part="${part%% }"
                    [ -z "$part" ] && continue
                    key="${part%%:*}"
                    val="${part#*: }"
                    case "$key" in
                        read|grep|glob) oc_perms="$oc_perms  $key: $val"$'\n' ;;
                        write)          oc_perms="$oc_perms  edit: $val"$'\n' ;;
                        move)           oc_perms="$oc_perms  bash: $val"$'\n' ;;
                        grep_context)   ;;
                    esac
                done
                cat > "$dest_dir/$agent_file" << OPENCODE_EOF
---
name: $name
description: |
$(echo "$description" | sed 's/^/  /')
mode: subagent
permission:
$(echo "$oc_perms" | sed '$d')
---

$(awk 'BEGIN{fm=0} /^---$/ && fm < 2 {fm++; next} fm == 2' "$canonical")
OPENCODE_EOF
                ;;
            .claude)
                local claude_tools=""
                case "$agent" in
                    spinosa-searcher)    claude_tools="Read, Grep, Glob" ;;
                    spinosa-analyst)     claude_tools="Read" ;;
                    spinosa-writer)      claude_tools="Read, Write" ;;
                    spinosa-verifier)    claude_tools="Read, Grep, Glob, Write" ;;
                    spinosa-evaluator)   claude_tools="Read, Grep, Glob, Write" ;;
                    spinosa-evolver)     claude_tools="Read, Grep, Glob, Write" ;;
                    spinosa-janitor)     claude_tools="Read, Grep, Glob, Write" ;;
                    spinosa-mapper)      claude_tools="Read, Write" ;;
                    spinosa-serendippo)  claude_tools="Read, Grep, Glob, Write" ;;
                esac
                cat > "$dest_dir/$agent_file" << CLAUDE_EOF
---
name: $name
description: |
$(echo "$description" | sed 's/^/  /')
tools: $claude_tools
---

$(awk 'BEGIN{fm=0} /^---$/ && fm < 2 {fm++; next} fm == 2' "$canonical")
CLAUDE_EOF
                ;;
            .codex)
                local body_content
                body_content="$(awk 'BEGIN{fm=0} /^---$/ && fm < 2 {fm++; next} fm == 2' "$canonical")"
                local esc_name esc_desc
                esc_name="$(printf '%s' "$name" | sed 's/\\/\\\\/g; s/"/\\"/g')"
                esc_desc="$(printf '%s' "$description" | sed 's/\\/\\\\/g; s/"/\\"/g')"
                cat > "$dest_dir/${agent}.toml" << CODEX_EOF
name = "$esc_name"
description = "$esc_desc"
developer_instructions = '''
$body_content
'''
CODEX_EOF
                ;;
        esac
    }

    emit_agent_file .opencode "$agent" "$agent_file" "$name" "$description" "$permissions"
    emit_agent_file .claude  "$agent" "$agent_file" "$name" "$description" "$permissions"
    emit_agent_file .codex   "$agent" "$agent_file" "$name" "$description" "$permissions"
    echo "  $agent → .opencode/agents/ + .claude/agents/ + .codex/agents/"
done

# ── Sync references ────────────────────────────────────────────────────
echo ""
echo "--- Syncing references ---"
for platform in .opencode .claude .codex .hermes; do
    dest="$REPO_ROOT/$platform/references"
    rm -rf "$dest"
    if [[ -d "$REPO_ROOT/.agents/references" ]]; then
        mkdir -p "$dest"
        cp "$REPO_ROOT/.agents/references/"*.md "$dest/"
        count=$(find "$dest" -name "*.md" | wc -l | tr -d ' ')
        echo "  $platform/references/ → $count files"
    fi
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
