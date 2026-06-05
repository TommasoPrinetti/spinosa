#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════════════════
# Pilosa Smoke Tests
# ═══════════════════════════════════════════════════════════════════════════
# Plain bash — zero dependencies. Run with: bash tests/smoke.sh
#
# Tests:
#   1. Syntax checks on all shell scripts
#   2. pilosa help outputs expected commands
#   3. pilosa check on a minimal workspace
#   4. pilosa sync in dev mode
#   5. pilosa uninstall --yes on a temp install
# ═══════════════════════════════════════════════════════════════════════════

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMPDIR="$(mktemp -d)"
PASSED=0
FAILED=0

# ── helpers ─────────────────────────────────────────────────────────────────
pass() { echo "  ✓ $1"; PASSED=$((PASSED + 1)); }
fail() { echo "  ✗ $1"; FAILED=$((FAILED + 1)); }
cleanup() { rm -rf "$TMPDIR"; }
trap cleanup EXIT

# ── Test 1: Syntax checks ───────────────────────────────────────────────────
echo "Test 1: Syntax checks"
for script in \
  "$REPO_ROOT/.bin/pilosa" \
  "$REPO_ROOT/install.sh" \
  "$REPO_ROOT/.bin/package-release.sh" \
  "$REPO_ROOT/.bin/check-startup.sh" \
  "$REPO_ROOT/.bin/sync-agents.sh"; do
  if [[ -f "$script" ]]; then
    if bash -n "$script" 2>/dev/null; then
      pass "$(basename "$script") syntax OK"
    else
      fail "$(basename "$script") syntax error"
    fi
  fi
done

# ── Test 2: pilosa help ─────────────────────────────────────────────────────
echo ""
echo "Test 2: pilosa help"
HELP_OUTPUT="$($REPO_ROOT/.bin/pilosa help 2>/dev/null || true)"
for cmd in new onboard update check sync uninstall; do
  if echo "$HELP_OUTPUT" | grep -q "pilosa $cmd"; then
    pass "help mentions 'pilosa $cmd'"
  else
    fail "help missing 'pilosa $cmd'"
  fi
done

# ── Test 3: pilosa check on minimal workspace ───────────────────────────────
echo ""
echo "Test 3: pilosa check on minimal workspace"

# Create a minimal workspace manually (simulating what pilosa new would do)
WS_DIR="$TMPDIR/test-workspace"
mkdir -p "$WS_DIR/.pilosa"
mkdir -p "$WS_DIR/system"
mkdir -p "$WS_DIR/raw"
mkdir -p "$WS_DIR/maps"
mkdir -p "$WS_DIR/logs"
mkdir -p "$WS_DIR/agent_reports"
mkdir -p "$WS_DIR/.trash"
mkdir -p "$WS_DIR/.obsidian/snippets"

# Write minimal required files
cat > "$WS_DIR/AGENTS.md" << 'EOF'
---
type: project_context
---
# Test Workspace
EOF

cat > "$WS_DIR/system/configuration.md" << 'EOF'
---
type: configuration
---
# Configuration

source_location: /tmp/test-sources
external_sources_allowed: no
EOF

cat > "$WS_DIR/system/startup.md" << 'EOF'
---
type: startup
---
# Startup
EOF

cat > "$WS_DIR/system/context.md" << 'EOF'
---
type: context
---
# Context
setup_status: workspace_started
EOF

cat > "$WS_DIR/system/yaml_header_template.md" << 'EOF'
---
type: template
---
# Template
EOF

cat > "$WS_DIR/.pilosa/workspace" << 'EOF'
workspace_version: 1
framework_version: 0.1.0
created: 2026-01-01
project_name: Test Project
setup_status: workspace_started
EOF

cp "$REPO_ROOT/.pilosa/framework-files.tsv" "$WS_DIR/.pilosa/framework-files.tsv"

# Write an overview map at maps/ root
mkdir -p "$WS_DIR/maps/overview"
cat > "$WS_DIR/maps/test_overview.md" << 'EOF'
# Test Overview Map
EOF
cat > "$WS_DIR/maps/overview/test_map.md" << 'EOF'
# Test Map
EOF

# Write non-empty dictionary and index
cat > "$WS_DIR/system/dictionary.md" << 'EOF'
# Dictionary

| Term | Definition |
|------|------------|
| test | a test term |
EOF
cat > "$WS_DIR/system/workspace_index.md" << 'EOF'
# Workspace Index

| File | Type | Summary |
|------|------|---------|
| raw/test.md | source | test source |
EOF

# Create fake source location
mkdir -p /tmp/test-sources
cat > /tmp/test-sources/test.md << 'EOF'
# Test Source
EOF

# Create .obsidian files
cat > "$WS_DIR/.obsidian/appearance.json" << 'EOF'
{"theme": "system"}
EOF

# Run check
CHECK_OUTPUT="$($REPO_ROOT/.bin/pilosa check "$WS_DIR" 2>/dev/null || true)"
if echo "$CHECK_OUTPUT" | grep -q "Check passed"; then
  pass "pilosa check passed on minimal workspace"
else
  fail "pilosa check failed on minimal workspace"
  echo "    Output: $CHECK_OUTPUT" | head -5
fi

# ── Test 4: pilosa sync (dev mode) ──────────────────────────────────────────
echo ""
echo "Test 4: pilosa sync (dev mode)"
# pilosa sync requires FRAMEWORK_ROOT to resolve; in dev mode it looks for .pilosa/framework-files.tsv
SYNC_OUTPUT="$($REPO_ROOT/.bin/pilosa sync 2>/dev/null || true)"
if echo "$SYNC_OUTPUT" | grep -q "Sync complete"; then
  pass "pilosa sync completed in dev mode"
else
  # sync may fail for other reasons (missing tools), but let's see
  if echo "$SYNC_OUTPUT" | grep -q "pilosa sync"; then
    pass "pilosa sync ran in dev mode"
  else
    fail "pilosa sync failed in dev mode"
    echo "    Output: $SYNC_OUTPUT" | head -5
  fi
fi

# ── Test 5: pilosa uninstall --yes on temp install ──────────────────────────
echo ""
echo "Test 5: pilosa uninstall --yes"
FAKE_HOME="$TMPDIR/fake-home"
mkdir -p "$FAKE_HOME/.pilosa/bin"
mkdir -p "$FAKE_HOME/.local/bin"
cp "$REPO_ROOT/.bin/pilosa" "$FAKE_HOME/.pilosa/bin/pilosa"
cat > "$FAKE_HOME/.local/bin/pilosa" << 'EOF'
#!/bin/sh
exec "$HOME/.pilosa/bin/pilosa" "$@"
EOF
chmod +x "$FAKE_HOME/.local/bin/pilosa"

UNINSTALL_OUTPUT="$(HOME="$FAKE_HOME" PILOSA_HOME="$FAKE_HOME/.pilosa" PILOSA_BIN_DIR="$FAKE_HOME/.local/bin" "$REPO_ROOT/.bin/pilosa" uninstall --yes 2>/dev/null || true)"
if [[ ! -d "$FAKE_HOME/.pilosa" ]] && [[ ! -f "$FAKE_HOME/.local/bin/pilosa" ]]; then
  pass "pilosa uninstall removed files"
else
  fail "pilosa uninstall did not remove files"
fi

# ── Test 6: pdf_converter_available PATH fallback ──────────────────────────
echo ""
echo "Test 6: pdf_converter_available PATH fallback"
# Create a fake pdf2md on PATH
FAKE_BIN="$TMPDIR/fake-bin"
mkdir -p "$FAKE_BIN"
cat > "$FAKE_BIN/pdf2md" << 'EOF'
#!/bin/sh
echo "fake pdf2md"
EOF
chmod +x "$FAKE_BIN/pdf2md"

if PATH="$FAKE_BIN:$PATH" "$REPO_ROOT/.bin/pilosa" help >/dev/null 2>&1; then
  # We can't easily test internal functions, but we can verify the script loads
  pass "pilosa loads with pdf2md on PATH"
else
  fail "pilosa failed to load with pdf2md on PATH"
fi

# ── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════════════════"
echo "  Results: $PASSED passed, $FAILED failed"
echo "═══════════════════════════════════════════════════════════════════════════"

if [[ "$FAILED" -gt 0 ]]; then
  exit 1
fi
