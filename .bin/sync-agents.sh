#!/usr/bin/env bash
# sync-agents.sh — Generate documented vendor agent mirrors, skills, and references
#
# Source of truth:
#   - .agents/agents/*.md → canonical agent definitions
#   - .agents/skills/ → Agent Skills standard skills, generated from agents when absent
#   - .agents/references/ → shared reference files (templates, format specs)
#   - AGENTS.md → CLAUDE.md (Claude Code reads this automatically)
#
# Destinations (generated, platform-specific frontmatter):
#   - .opencode/agents/   — mode: subagent, permission object
#   - .claude/agents/     — tools: (comma-separated)
#   - .codex/agents/      — TOML subagent profiles with developer_instructions
#   - .agents/skills/      — Codex/OpenCode/Claude Agent Skills standard
#   - .opencode/skills/   — OpenCode skill mirror
#   - .claude/skills/     — Claude skill mirror
#   - .opencode/references/ — OpenCode reference mirror
#   - .claude/references/   — Claude reference mirror
#   - .codex/references/    — Codex reference mirror
#   - .hermes/skills/              — Hermes skill mirror
#   - .hermes/references/          — Hermes reference mirror
#   - .hermes/workspace.config.yaml — merge into ~/.hermes/config.yaml
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
                cat > "$dest_dir/$agent_file" << OPENCODE_EOF
---
mode: subagent
description: >
  $description
permission:
  edit: allow
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
                    spinosa-overseer)   claude_tools="Read, Grep, Glob, Write" ;;
                esac
                cat > "$dest_dir/$agent_file" << CLAUDE_EOF
---
name: $name
description: |
$(echo "$description" | sed 's/^/  /')
tools: $claude_tools
skills:
  - $name
---

$(awk 'BEGIN{fm=0} /^---$/ && fm < 2 {fm++; next} fm == 2' "$canonical")
CLAUDE_EOF
                ;;
            .codex)
                local sandbox="read-only"
                [[ "$permissions" == *"write: allow"* ]] && sandbox="workspace-write"
                local agent_body
                agent_body=$(awk 'BEGIN{fm=0} /^---$/ && fm < 2 {fm++; next} fm == 2' "$canonical")
                cat > "$dest_dir/${agent}.toml" << CODEX_EOF
name = "$name"
description = "$(echo "$description" | sed 's/"/\\"/g')"
# model: orchestrator sets at dispatch via --model flag (small model recommended)
sandbox_mode = "${sandbox}"
developer_instructions = """
${agent_body}
"""
CODEX_EOF
                ;;
        esac
    }

    emit_agent_file .opencode "$agent" "$agent_file" "$name" "$description" "$permissions"
    emit_agent_file .claude  "$agent" "$agent_file" "$name" "$description" "$permissions"
    emit_agent_file .codex   "$agent" "$agent_file" "$name" "$description" "$permissions"
    echo "  $agent → .opencode/agents/ + .claude/agents/ + .codex/agents/"
done

# ── Sync Agent Skills ─────────────────────────────────────────────────
echo ""
echo "--- Syncing Agent Skills ---"

SKILLS_DIR="$REPO_ROOT/.agents/skills"
mkdir -p "$SKILLS_DIR"

generated_skills=0
skipped_skills=0
for canonical in "$REPO_ROOT/.agents/agents/"*.md; do
    [ -f "$canonical" ] || continue
    agent_file=$(basename "$canonical")
    agent="${agent_file%.md}"
    agent_label="${agent#spinosa-}"
    skill_dir="$SKILLS_DIR/$agent"
    skill_file="$skill_dir/SKILL.md"

    frontmatter=$(sed -n '/^---$/,/^---$/p' "$canonical" | sed '1d;$d')
    name=$(echo "$frontmatter" | sed -n 's/^name: *//p' | head -1)
    [ -n "$name" ] || name="$agent"
    description=$(sed -n '/^description: |/,/^[a-z]/p' "$canonical" | sed '/^description:/d;/^[a-z]/d' | sed 's/^  //' | tr '\n' ' ' | tr -s ' ')
    [ -n "$description" ] || description="$agent"

    if [[ -f "$skill_file" ]] && ! grep -q '<!-- generated by sync-agents from .agents/agents/' "$skill_file"; then
        echo "  $agent skill exists; preserved hand-written SKILL.md"
        skipped_skills=$((skipped_skills + 1))
        continue
    fi

    mkdir -p "$skill_dir"
    cat > "$skill_file" << SKILL_EOF
---
name: $name
description: |
  Fallback skill for the Spinosa $agent_label sub-agent. Use when native vendor sub-agent dispatch is unavailable or when a Codex/OpenCode/Claude skill invocation is more appropriate than a separate sub-agent session.
---
<!-- generated by sync-agents from .agents/agents/$agent_file; edit the canonical agent or replace this file with a hand-written skill to opt out -->

# $name

Prefer the native \`$name\` sub-agent when the active vendor supports project sub-agents. Use this skill as the portable Agent Skills fallback. It mirrors the canonical agent instructions from \`.agents/agents/$agent_file\`.

$(awk 'BEGIN{fm=0} /^---$/ && fm < 2 {fm++; next} fm == 2' "$canonical")
SKILL_EOF
    generated_skills=$((generated_skills + 1))
done

for platform in .opencode .claude .codex .hermes; do
    dest="$REPO_ROOT/$platform/skills"
    rm -rf "$dest"
    mkdir -p "$dest"
    for skill_dir in "$SKILLS_DIR"/*; do
        [ -d "$skill_dir" ] || continue
        cp -R "$skill_dir" "$dest/"
    done
    count=$(find "$dest" -mindepth 2 -maxdepth 2 -name "SKILL.md" | wc -l | tr -d ' ')
    echo "  $platform/skills/ → $count skills"
done

skill_count=$(find "$SKILLS_DIR" -mindepth 2 -maxdepth 2 -name "SKILL.md" | wc -l | tr -d ' ')
echo "  .agents/skills/ → $skill_count skills (${generated_skills} generated, ${skipped_skills} preserved)"

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

# ── Sync Hermes workspace config ─────────────────────────────────────
echo ""
echo "--- Syncing Hermes workspace config ---"
HERMES_DIR="$REPO_ROOT/.hermes"
mkdir -p "$HERMES_DIR"
cat > "$HERMES_DIR/workspace.config.yaml" << HERMES_CONFIG_EOF
# Spinosa workspace wiring for Hermes Agent
# Generated by sync-agents.sh — merge these keys into ~/.hermes/config.yaml
# (or into a dedicated profile under ~/.hermes/profiles/<name>/config.yaml).
#
# Hermes loads AGENTS.md from terminal.cwd automatically. Spinosa skills
# register via external_dirs; dispatch with /spinosa-<agent> or delegate_task.

skills:
  external_dirs:
    - ${REPO_ROOT}/.hermes/skills

terminal:
  cwd: ${REPO_ROOT}
HERMES_CONFIG_EOF
echo "  .hermes/workspace.config.yaml → merge into ~/.hermes/config.yaml"

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

# ── Sync .codex/config.toml ───────────────────────────────────────────
echo ""
echo "--- Syncing .codex/config.toml ---"
CODEX_AGENTS_DIR="$REPO_ROOT/.codex/agents"
CODEX_CONFIG="$REPO_ROOT/.codex/config.toml"
if [[ -d "$CODEX_AGENTS_DIR" ]]; then
    cat > "$CODEX_CONFIG" << CODEX_CONFIG_EOF
# Codex subagent role registration for Spinosa
# Generated by sync-agents.sh — do not edit by hand
# Each [agents.<name>] entry wires a TOML agent profile to a named role.
# Model is chosen by the orchestrator at dispatch (see AGENTS.md); not set here.

[agents]
max_threads = 4
max_depth = 1

$(for agent_toml in "$CODEX_AGENTS_DIR/"*.toml; do
    [ -f "$agent_toml" ] || continue
    agent_name=$(basename "$agent_toml" .toml)
    agent_desc=$(grep '^description' "$agent_toml" | sed 's/^description = "//;s/"$//')
    cat << ENTRY
[agents.${agent_name}]
description = "${agent_desc}"
config_file = "agents/${agent_name}.toml"

ENTRY
done)
CODEX_CONFIG_EOF
    toml_count=$(find "$CODEX_AGENTS_DIR" -name "*.toml" | wc -l | tr -d ' ')
    echo "  .codex/config.toml → ${toml_count} agents registered"
fi

echo ""
echo "=== Sync complete ==="
