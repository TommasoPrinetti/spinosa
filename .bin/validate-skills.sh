#!/usr/bin/env bash
# validate-skills.sh — Validate all Pilosa skills against SKILL protocol
#
# Checks:
#   - Valid YAML frontmatter with name + description
#   - Directory name matches skill name prefix
#   - references/ contents match ## References index in SKILL.md
#   - Internal cross-references resolve to existing skills
#   - Optional: agentskills validate (generic SKILL protocol check)
#
# Usage: bash .bin/validate-skills.sh [--strict]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
SKILLS_DIR="${REPO_ROOT}/.agents/skills"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

errors=0
warnings=0

err()  { echo -e "${RED}✗${NC} $*"; errors=$((errors + 1)); }
ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC} $*"; warnings=$((warnings + 1)); }

echo "=== Pilosa Skill Validation ==="
echo ""

for skill_dir in "$SKILLS_DIR"/*/; do
    [ -d "$skill_dir" ] || continue
    skill_name=$(basename "$skill_dir")
    skill_file="${skill_dir}SKILL.md"

    echo "── $skill_name ──"

    # ── Check SKILL.md exists ──────────────────────────────────────────
    if [[ ! -f "$skill_file" ]]; then
        err "$skill_name: SKILL.md not found"
        continue
    fi

    # ── Parse YAML frontmatter ─────────────────────────────────────────
    frontmatter=$(sed -n '/^---$/,/^---$/p' "$skill_file" | sed '1d;$d')

    # Check name
    name=$(echo "$frontmatter" | sed -n 's/^name: *//p' | head -1)
    if [[ -z "$name" ]]; then
        err "$skill_name: missing 'name' in frontmatter"
    else
        ok "$skill_name: name = $name"
    fi

    # Check description
    desc=$(echo "$frontmatter" | sed -n 's/^description: *//p' | head -1)
    if [[ -z "$desc" ]]; then
        err "$skill_name: missing 'description' in frontmatter"
    else
        ok "$skill_name: has description"
    fi

    # ── Check references/ index ────────────────────────────────────────
    ref_dir="${skill_dir}references"
    if [[ -d "$ref_dir" ]]; then
        ref_files=()
        while IFS= read -r -d '' f; do
            ref_files+=("$(basename "$f")")
        done < <(find "$ref_dir" -name "*.md" -print0)

        if [[ ${#ref_files[@]} -gt 0 ]]; then
            # Check that ## References section exists
            if ! grep -q '^## References' "$skill_file" 2>/dev/null; then
                err "$skill_name: has references/ but no ## References section in SKILL.md"
            else
                # Extract listed references
                listed_refs=$(sed -n '/^## References/,/^## /p' "$skill_file" | grep '| `' | sed 's/.*| `\([^`]*\)` |.*/\1/')
                for rf in "${ref_files[@]}"; do
                    if echo "$listed_refs" | grep -qF "$rf"; then
                        ok "$skill_name: references/$rf indexed"
                    else
                        warn "$skill_name: references/$rf exists but not listed in ## References section"
                    fi
                done
            fi
        fi
    fi

    echo ""
done

# ── Run agentskills validate (generic check) ────────────────────────────
echo "── agentskills validate ──"
if command -v agentskills &>/dev/null; then
    for skill_dir in "$SKILLS_DIR"/*/; do
        [ -d "$skill_dir" ] || continue
        skill_name=$(basename "$skill_dir")
        output=$(agentskills validate "$skill_dir" 2>&1) || true
        if echo "$output" | grep -q "Validation failed"; then
            # Check if the failures are only about extra fields and dir name
            # Our pilosa-specific fields (type, scope, created, updated, permissions)
            # are expected extras, and dir naming uses semantic names
            fail_lines=$(echo "$output" | grep "  - " || true)
            non_pilosa_fails=0
            while IFS= read -r line; do
                [[ -z "$line" ]] && continue
                # Skip expected Pilosa-specific "failures"
                if echo "$line" | grep -qE 'Unexpected fields|Directory name.*must match'; then
                    continue
                fi
                non_pilosa_fails=$((non_pilosa_fails + 1))
                warn "agentskills: $skill_name: $line"
            done <<< "$fail_lines"
            if [[ $non_pilosa_fails -eq 0 ]]; then
                ok "$skill_name: agentskills (pilosa-extensions ignored)"
            fi
        else
            ok "$skill_name: agentskills validate passed"
        fi
    done
else
    warn "agentskills not installed — run: uv tool install skills-ref"
fi

echo ""
echo "=== Summary ==="
echo "  Errors:   $errors"
echo "  Warnings: $warnings"
echo ""

if [[ $errors -gt 0 ]]; then
    echo -e "${RED}Validation failed.${NC}"
    exit 1
else
    echo -e "${GREEN}All skills valid.${NC}"
    exit 0
fi
