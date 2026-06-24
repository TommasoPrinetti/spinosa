#!/usr/bin/env bash
# sync.sh — Sync and validate vendor agents and skills
#
# Performs:
#   1. Sync canonical .agents/agents/ to documented vendor agent mirrors
#   2. Generate portable Agent Skills fallbacks in .agents/skills/
#   3. Mirror skills to vendors that document project skill directories
#   4. Validate all skills
#
# Usage: bash .bin/sync.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Spinosa Agent + Skill Sync ==="
echo ""

# ── Sync agents + skills ───────────────────────────────────────────────
bash "${SCRIPT_DIR}/sync-agents.sh"

# ── Validate skills ────────────────────────────────────────────────────
echo ""
bash "${SCRIPT_DIR}/validate-skills.sh"

echo ""
echo "=== Sync complete ==="
