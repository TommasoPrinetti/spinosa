#!/usr/bin/env bash
# sync.sh — Sync and validate skills (SKILL protocol entry point)
#
# Performs:
#   1. Sync skills from canonical .agents/skills/ to vendor mirrors
#   2. Validate all skills
#
# Usage: bash .bin/sync.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Spinosa Skill Sync ==="
echo ""

# ── Sync agents + skills ───────────────────────────────────────────────
bash "${SCRIPT_DIR}/sync-agents.sh"

# ── Validate skills ────────────────────────────────────────────────────
echo ""
bash "${SCRIPT_DIR}/validate-skills.sh"

echo ""
echo "=== Sync complete ==="
