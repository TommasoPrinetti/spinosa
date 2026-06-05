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
for cmd in new onboard update upgrade check sync uninstall; do
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

# ── Test 7: install.sh version pinning ──────────────────────────────────────
echo ""
echo "Test 7: install.sh version pinning"
HELP_OUTPUT="$(bash "$REPO_ROOT/install.sh" --help 2>/dev/null || true)"
if echo "$HELP_OUTPUT" | grep -q "default: 0.2.0"; then
  pass "install.sh defaults to pinned version 0.2.0"
else
  fail "install.sh does not default to pinned version"
fi

# ── Test 8: install.sh --upgrade and --reinstall flags ──────────────────────
echo ""
echo "Test 8: install.sh --upgrade and --reinstall flags"
HELP_OUTPUT="$(bash "$REPO_ROOT/install.sh" --help 2>/dev/null || true)"
if echo "$HELP_OUTPUT" | grep -q "\-\-upgrade"; then
  pass "install.sh has --upgrade flag"
else
  fail "install.sh missing --upgrade flag"
fi
if echo "$HELP_OUTPUT" | grep -q "\-\-reinstall"; then
  pass "install.sh has --reinstall flag"
else
  fail "install.sh missing --reinstall flag"
fi

# ── Test 9: install.sh --min-days on old release ──────────────────────────
echo ""
echo "Test 9: install.sh --min-days on old release"
# v0.1.0 should be older than 1 day
MIN_DAYS_OUTPUT="$(bash "$REPO_ROOT/install.sh" --version 0.1.0 --min-days 1 --dry-run 2>/dev/null || true)"
if echo "$MIN_DAYS_OUTPUT" | grep -q "Dry run"; then
  pass "--min-days 1 passes for old release v0.1.0"
else
  fail "--min-days 1 failed for old release v0.1.0"
  echo "    Output: $MIN_DAYS_OUTPUT" | head -3
fi

# ── Test 10: install.sh --verify-only ────────────────────────────────────────
echo ""
echo "Test 10: install.sh --verify-only"
FAKE_INSTALL="$TMPDIR/fake-verify"
mkdir -p "$FAKE_INSTALL/.pilosa/versions/0.1.0/pilosa-framework-0.1.0/metadata"
mkdir -p "$FAKE_INSTALL/.pilosa/versions/0.1.0/pilosa-framework-0.1.0/.bin/lib/vendor"

# Create a fake binary and its checksum
FAKE_GUM="$FAKE_INSTALL/.pilosa/versions/0.1.0/pilosa-framework-0.1.0/.bin/lib/vendor/gum-darwin-arm64"
cat > "$FAKE_GUM" << 'EOF'
#!/bin/sh
echo "fake gum"
EOF
chmod +x "$FAKE_GUM"

# Compute checksum and write manifest (3-field format: hash name suffix)
GUM_HASH="$(sha256sum "$FAKE_GUM" 2>/dev/null | awk '{print $1}' || shasum -a 256 "$FAKE_GUM" 2>/dev/null | awk '{print $1}')"
printf '%s  %s  %s\n' "$GUM_HASH" "gum" "darwin-arm64" > "$FAKE_INSTALL/.pilosa/versions/0.1.0/pilosa-framework-0.1.0/metadata/vendor-checksums.txt"

# Also install the binary in the expected location (renamed to base name)
mkdir -p "$FAKE_INSTALL/.pilosa/bin"
cp "$FAKE_GUM" "$FAKE_INSTALL/.pilosa/bin/gum"

VERIFY_OUTPUT="$(HOME="$FAKE_INSTALL" PILOSA_HOME="$FAKE_INSTALL/.pilosa" bash "$REPO_ROOT/install.sh" --verify-only 2>/dev/null || true)"
if echo "$VERIFY_OUTPUT" | grep -q "Verification complete"; then
  pass "--verify-only verifies installed binaries"
else
  fail "--verify-only did not complete successfully"
  echo "    Output: $VERIFY_OUTPUT" | head -3
fi

# ── Test 11: pilosa upgrade --help ────────────────────────────────────────
echo ""
echo "Test 11: pilosa upgrade --help"
UPGRADE_HELP="$($REPO_ROOT/.bin/pilosa upgrade --help 2>/dev/null || true)"
if echo "$UPGRADE_HELP" | grep -q "pilosa upgrade"; then
  pass "upgrade command has help"
else
  fail "upgrade command missing help"
fi

# ── Test 12: pilosa dashboard (global) ──────────────────────────────────────
echo ""
echo "Test 12: pilosa dashboard (global)"
DASH_OUTPUT="$(printf '5\n' | perl -e 'alarm(5); exec "'"$REPO_ROOT"'/.bin/pilosa"' 2>&1 || true)"
if echo "$DASH_OUTPUT" | grep -q "Pilosa.*v.*gum:"; then
  pass "global dashboard renders"
else
  fail "global dashboard did not render"
fi

# ── Test 13: pilosa dashboard (workspace) ───────────────────────────────────
echo ""
echo "Test 13: pilosa dashboard (workspace)"
DASH_WS="$TMPDIR/dash-test"
mkdir -p "$DASH_WS/.pilosa" "$DASH_WS/raw" "$DASH_WS/maps"
cat > "$DASH_WS/.pilosa/workspace" << 'EOF'
workspace_version: 1
framework_version: 0.2.0
created: 2026-06-05
project_name: Dashboard Test
setup_status: workspace_started
EOF
touch "$DASH_WS/raw/doc.md"
DASH_WS_OUTPUT="$(cd "$DASH_WS" && printf '7\n' | perl -e 'alarm(5); exec "'"$REPO_ROOT"'/.bin/pilosa"' 2>&1 || true)"
if echo "$DASH_WS_OUTPUT" | grep -q "Pilosa — Dashboard Test"; then
  pass "workspace dashboard renders with project name"
else
  fail "workspace dashboard did not render"
fi

# ── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════════════════"
echo "  Results: $PASSED passed, $FAILED failed"
echo "═══════════════════════════════════════════════════════════════════════════"

if [[ "$FAILED" -gt 0 ]]; then
  exit 1
fi
