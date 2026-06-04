#!/bin/bash
# sync-agents.sh — Copy agent definitions and skills from source of truth to all platform directories
#
# Source of truth:
#   - system/agents/*.md → agent definitions
#   - .agents/skills/*/SKILL.md → skills
#
# Destinations:
#   - .opencode/agents/
#   - .claude/agents/
#   - .kilocode/agents/
#   - .claude/skills/
#   - .codex/skills/
#   - .kilocode/skills/
#
# Note: .codex/agents/ uses .toml format (different) — not synced here.
#       .github/copilot-instructions.md is unique — not synced.
#
# Usage: bash .bin/sync-agents.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

echo "=== Pilosa Agent Sync ==="
echo "Source: $REPO_ROOT/system/agents/"
echo ""

# Sync agent definitions
echo "--- Syncing agent definitions ---"
for platform in .opencode .claude .kilocode; do
    dest="$REPO_ROOT/$platform/agents"
    mkdir -p "$dest"
    cp "$REPO_ROOT/system/agents/"*.md "$dest/"
    count=$(ls "$dest"/*.md 2>/dev/null | wc -l)
    echo "  $platform/agents/ → $count files"
done

# Sync skills
echo ""
echo "--- Syncing skills ---"
for platform in .claude .codex .kilocode; do
    dest="$REPO_ROOT/$platform/skills"
    mkdir -p "$dest"
    # Copy each skill directory
    for skill_dir in "$REPO_ROOT/.agents/skills"/*/; do
        skill_name=$(basename "$skill_dir")
        mkdir -p "$dest/$skill_name"
        cp "$skill_dir"*.md "$dest/$skill_name/" 2>/dev/null || true
    done
    count=$(find "$dest" -name "SKILL.md" | wc -l)
    echo "  $platform/skills/ → $count skills"
done

echo ""
echo "=== Sync complete ==="
