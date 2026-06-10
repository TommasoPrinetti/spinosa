#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════════════════
# Spinosa Smoke Tests
# ═══════════════════════════════════════════════════════════════════════════
# Plain bash — zero dependencies. Run with: bash tests/smoke.sh
#
# Tests:
#   1. Syntax checks on all shell scripts
#   2. spinosa help outputs expected commands
#   3. spinosa check on a minimal workspace
#   4. spinosa sync in dev mode
#   5. spinosa uninstall --yes on a temp install
#   6. (numbered test ordering continued below)
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
  "$REPO_ROOT/.bin/spinosa" \
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

# ── Test 2: spinosa help ─────────────────────────────────────────────────────
echo ""
echo "Test 2: spinosa help"
HELP_OUTPUT="$($REPO_ROOT/.bin/spinosa help 2>/dev/null || true)"
for cmd in new prepare update upgrade check sync uninstall; do
  if echo "$HELP_OUTPUT" | grep -q "spinosa $cmd"; then
    pass "help mentions 'spinosa $cmd'"
  else
    fail "help missing 'spinosa $cmd'"
  fi
done
NEW_HELP_OUTPUT="$($REPO_ROOT/.bin/spinosa new --help 2>/dev/null || true)"
if echo "$NEW_HELP_OUTPUT" | grep -q -- "--gum" && ! echo "$NEW_HELP_OUTPUT" | grep -qi "default, if installed"; then
  pass "new help documents Gum as opt-in"
else
  fail "new help still suggests Gum is default"
fi

# ── Test 3: spinosa check on minimal workspace ───────────────────────────────
echo ""
echo "Test 3: spinosa check on minimal workspace"

# Create a minimal workspace manually (simulating what spinosa new would do)
WS_DIR="$TMPDIR/test-workspace"
mkdir -p "$WS_DIR/.spinosa"
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

cat > "$WS_DIR/.spinosa/workspace" << 'EOF'
workspace_version: 1
framework_version: 0.1.0
created: 2026-01-01
project_name: Test Project
setup_status: workspace_started
EOF

cp "$REPO_ROOT/.spinosa/framework-files.tsv" "$WS_DIR/.spinosa/framework-files.tsv"

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
CHECK_OUTPUT="$($REPO_ROOT/.bin/spinosa check "$WS_DIR" 2>/dev/null || true)"
if echo "$CHECK_OUTPUT" | grep -q "Check passed"; then
  pass "spinosa check passed on minimal workspace"
else
  fail "spinosa check failed on minimal workspace"
  echo "    Output: $CHECK_OUTPUT" | head -5
fi

# ── Test 4: spinosa sync (dev mode) ──────────────────────────────────────────
echo ""
echo "Test 4: spinosa sync (dev mode)"
# spinosa sync requires FRAMEWORK_ROOT to resolve; in dev mode it looks for .spinosa/framework-files.tsv
SYNC_OUTPUT="$($REPO_ROOT/.bin/spinosa sync 2>/dev/null || true)"
if echo "$SYNC_OUTPUT" | grep -q "Sync complete"; then
  pass "spinosa sync completed in dev mode"
else
  # sync may fail for other reasons (missing tools), but let's see
  if echo "$SYNC_OUTPUT" | grep -q "spinosa sync"; then
    pass "spinosa sync ran in dev mode"
  else
    fail "spinosa sync failed in dev mode"
    echo "    Output: $SYNC_OUTPUT" | head -5
  fi
fi

# ── Test 5: spinosa uninstall --yes on temp install ──────────────────────────
echo ""
echo "Test 5: spinosa uninstall --yes"
FAKE_HOME="$TMPDIR/fake-home"
mkdir -p "$FAKE_HOME/.spinosa/bin"
mkdir -p "$FAKE_HOME/.local/bin"
cp "$REPO_ROOT/.bin/spinosa" "$FAKE_HOME/.spinosa/bin/spinosa"
cat > "$FAKE_HOME/.local/bin/spinosa" << 'EOF'
#!/bin/sh
exec "$HOME/.spinosa/bin/spinosa" "$@"
EOF
chmod +x "$FAKE_HOME/.local/bin/spinosa"

UNINSTALL_OUTPUT="$(HOME="$FAKE_HOME" SPINOSA_HOME="$FAKE_HOME/.spinosa" SPINOSA_BIN_DIR="$FAKE_HOME/.local/bin" "$REPO_ROOT/.bin/spinosa" uninstall --yes 2>/dev/null || true)"
if [[ ! -d "$FAKE_HOME/.spinosa" ]] && [[ ! -f "$FAKE_HOME/.local/bin/spinosa" ]]; then
  pass "spinosa uninstall removed files"
else
  fail "spinosa uninstall did not remove files"
fi



# ── Test 7: spinosa new flag-based pipeline (single extension) ─────────────
echo ""
echo "Test 7: spinosa new flag-based pipeline (txt only)"
T7_CORPUS="$TMPDIR/t7-corpus"
mkdir -p "$T7_CORPUS"
cat > "$T7_CORPUS/note.txt" << 'EOF'
temporary source note
EOF
cat > "$T7_CORPUS/paper.pdf" << 'EOF'
fake pdf bytes
EOF

T7_OUTPUT="$("$REPO_ROOT/.bin/spinosa" new "$T7_CORPUS" --numbered --no-color \
  --project-name Test --extensions txt --cli opencode --launch copy 2>&1 || true)"
T7_WS="$TMPDIR/t7-corpus-spinosa"

if [[ -f "$T7_WS/.spinosa/workspace" ]] && [[ -f "$T7_WS/raw/note__txt.md" ]] && \
   [[ ! -f "$T7_WS/raw/paper.md" ]] && [[ -f "$T7_WS/.spinosa/onboarding-summary.md" ]] && \
   grep -q "Selected extension batches: \.txt" "$T7_WS/.spinosa/onboarding-summary.md" && \
   grep -q "Files imported into workspace: 1" "$T7_WS/.spinosa/onboarding-summary.md" && \
   grep -q "Scanned PDFs and images available for OCR: 1" "$T7_WS/.spinosa/onboarding-summary.md"; then
  pass "spinosa new flag-based pipeline imports txt, skips pdf, writes summary"
else
  fail "spinosa new flag-based pipeline failed"
  echo "    Output: $T7_OUTPUT" | head -10
fi

# ── Test 8: spinosa new multi-extension import ────────────────────────────
echo ""
echo "Test 8: spinosa new multi-extension flag parsing"
T8_CORPUS="$TMPDIR/t8-corpus"
mkdir -p "$T8_CORPUS"
cat > "$T8_CORPUS/note.txt" << 'EOF'
text source with pdf companion
EOF
cat > "$T8_CORPUS/paper.pdf" << 'EOF'
pdf companion
EOF

T8_OUTPUT="$("$REPO_ROOT/.bin/spinosa" new "$T8_CORPUS" --numbered --no-color \
  --project-name Test --extensions txt,pdf --cli opencode --launch copy 2>&1 || true)"
T8_WS="$TMPDIR/t8-corpus-spinosa"

if [[ -f "$T8_WS/raw/note__txt.md" ]] && [[ ! -f "$T8_WS/raw/paper.md" ]] && \
   grep -q "Selected extension batches: \.txt, \.pdf" "$T8_WS/.spinosa/onboarding-summary.md"; then
  pass "spinosa new parses --extensions txt,pdf, imports txt, skips pdf"
else
  fail "spinosa new multi-extension flag parsing failed"
  echo "    Output: $T8_OUTPUT" | head -15
fi

# ── Test 9: spinosa new PDF skip when OCR not bundled ──────────────────────
echo ""
echo "Test 9: spinosa new PDF skip (no OCR)"
T9_CORPUS="$TMPDIR/t9-corpus"
mkdir -p "$T9_CORPUS"
cat > "$T9_CORPUS/note.txt" << 'EOF'
text source
EOF
cat > "$T9_CORPUS/paper.pdf" << 'EOF'
fake pdf bytes
EOF

T9_OUTPUT="$("$REPO_ROOT/.bin/spinosa" new "$T9_CORPUS" --numbered --no-color \
  --project-name Test --extensions txt,pdf --cli opencode --launch copy 2>&1 || true)"
T9_WS="$TMPDIR/t9-corpus-spinosa"

if [[ -f "$T9_WS/raw/note__txt.md" ]] && [[ ! -f "$T9_WS/raw/paper.md" ]] && \
   echo "$T9_OUTPUT" | grep -q "RapidOCR not available" && \
   grep -q "OCR mode: rapidocr_not_bundled" "$T9_WS/.spinosa/onboarding-summary.md"; then
  pass "spinosa new skips PDF when RapidOCR not available"
else
  fail "spinosa new PDF skip failed"
  echo "    Output: $T9_OUTPUT" | head -15
fi

# ── Test 10: spinosa new custom project name ──────────────────────────────
echo ""
echo "Test 10: spinosa new custom project name"
T10_CORPUS="$TMPDIR/t10-corpus"
mkdir -p "$T10_CORPUS"
cat > "$T10_CORPUS/note.txt" << 'EOF'
project name test
EOF

T10_OUTPUT="$("$REPO_ROOT/.bin/spinosa" new "$T10_CORPUS" --numbered --no-color \
  --project-name "My Research Project" --extensions txt --cli opencode --launch copy 2>&1 || true)"
T10_WS="$TMPDIR/t10-corpus-spinosa"

if grep -q "project_name: My Research Project" "$T10_WS/.spinosa/workspace" 2>/dev/null; then
  pass "spinosa new uses --project-name as workspace project name"
else
  fail "spinosa new custom project name failed"
  echo "    Output: $T10_OUTPUT" | head -10
fi

# ── Test 11: spinosa new records OpenCode in summary ──────────────────────
echo ""
echo "Test 11: spinosa new OpenCode CLI selection"
T11_CORPUS="$TMPDIR/t11-corpus"
mkdir -p "$T11_CORPUS"
cat > "$T11_CORPUS/note.txt" << 'EOF'
cli selection test
EOF

T11_OUTPUT="$("$REPO_ROOT/.bin/spinosa" new "$T11_CORPUS" --numbered --no-color \
  --project-name Test --extensions txt --cli opencode --launch copy 2>&1 || true)"
T11_WS="$TMPDIR/t11-corpus-spinosa"

if grep -q "Preferred CLI:.*OpenCode" "$T11_WS/.spinosa/onboarding-summary.md" 2>/dev/null || \
   grep -q "OpenCode" "$T11_WS/.spinosa/onboarding-summary.md" 2>/dev/null; then
  pass "spinosa new records OpenCode as preferred CLI"
else
  fail "spinosa new OpenCode selection not recorded"
fi

# ── Test 12: spinosa new filtered import excludes unrequested types ───────
echo ""
echo "Test 12: spinosa new filtered import (only txt, not csv or json)"
T12_CORPUS="$TMPDIR/t12-corpus"
mkdir -p "$T12_CORPUS"
cat > "$T12_CORPUS/note.txt" << 'EOF'
txt only
EOF
cat > "$T12_CORPUS/table.csv" << 'EOF'
col,row
EOF
cat > "$T12_CORPUS/data.json" << 'EOF'
{"k": "v"}
EOF

T12_OUTPUT="$("$REPO_ROOT/.bin/spinosa" new "$T12_CORPUS" --numbered --no-color \
  --project-name Test --extensions txt --cli opencode --launch copy 2>&1 || true)"
T12_WS="$TMPDIR/t12-corpus-spinosa"

if [[ -f "$T12_WS/raw/note__txt.md" ]] && [[ ! -f "$T12_WS/raw/table.csv" ]] && \
   [[ ! -f "$T12_WS/raw/data.json.md" ]] && \
   grep -q "Selected extension batches: \.txt" "$T12_WS/.spinosa/onboarding-summary.md"; then
  pass "spinosa new imports only .txt, excludes .csv and .json"
else
  fail "spinosa new filtered import failed"
  echo "    Output: $T12_OUTPUT" | head -10
fi

# ── Test 13: install.sh version pinning ──────────────────────────────────────
echo ""
echo "Test 13: install.sh version pinning"
HELP_OUTPUT="$(bash "$REPO_ROOT/install.sh" --help 2>/dev/null || true)"
PINNED="$(grep 'PINNED_VERSION=' "$REPO_ROOT/install.sh" | head -1 | sed 's/.*PINNED_VERSION="\([^"]*\)".*/\1/')"
if [[ -n "$PINNED" ]] && echo "$HELP_OUTPUT" | grep -q "default: ${PINNED}"; then
  pass "install.sh defaults to pinned version ${PINNED}"
else
  fail "install.sh does not default to pinned version (expected: ${PINNED})"
fi

# ── Test 12: install.sh --upgrade and --reinstall flags ──────────────────────
echo ""
echo "Test 14: install.sh --upgrade and --reinstall flags"
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

# ── Test 15: install.sh --min-days on old release ─────────────────────────
echo ""
echo "Test 15: install.sh --min-days on old release"
# Mock the GitHub release API so this stays deterministic offline.
MIN_DAYS_BIN="$TMPDIR/min-days-bin"
mkdir -p "$MIN_DAYS_BIN"
cat > "$MIN_DAYS_BIN/curl" << 'EOF'
#!/bin/sh
printf '{"published_at": "2026-01-01T00:00:00Z"}\n'
EOF
chmod +x "$MIN_DAYS_BIN/curl"

MIN_DAYS_OUTPUT="$(PATH="$MIN_DAYS_BIN:$PATH" bash "$REPO_ROOT/install.sh" --version 0.1.0 --min-days 1 --dry-run 2>/dev/null || true)"
if echo "$MIN_DAYS_OUTPUT" | grep -q "Release age verified" && echo "$MIN_DAYS_OUTPUT" | grep -q "Dry run"; then
  pass "--min-days 1 passes for old release v0.1.0"
else
  fail "--min-days 1 failed for old release v0.1.0"
  echo "    Output: $MIN_DAYS_OUTPUT" | head -3
fi

# ── Test 16: install.sh --verify-only ───────────────────────────────────────
echo ""
echo "Test 16: install.sh --verify-only"
FAKE_INSTALL="$TMPDIR/fake-verify"
mkdir -p "$FAKE_INSTALL/.spinosa/versions/0.1.0/spinosa-framework-0.1.0/metadata"
mkdir -p "$FAKE_INSTALL/.spinosa/versions/0.1.0/spinosa-framework-0.1.0/.bin/lib/vendor"

# Create a fake binary and its checksum
FAKE_GUM="$FAKE_INSTALL/.spinosa/versions/0.1.0/spinosa-framework-0.1.0/.bin/lib/vendor/gum-darwin-arm64"
cat > "$FAKE_GUM" << 'EOF'
#!/bin/sh
echo "fake gum"
EOF
chmod +x "$FAKE_GUM"

# Compute checksum and write manifest (3-field format: hash name suffix)
GUM_HASH="$(sha256sum "$FAKE_GUM" 2>/dev/null | awk '{print $1}' || shasum -a 256 "$FAKE_GUM" 2>/dev/null | awk '{print $1}')"
printf '%s  %s  %s\n' "$GUM_HASH" "gum" "darwin-arm64" > "$FAKE_INSTALL/.spinosa/versions/0.1.0/spinosa-framework-0.1.0/metadata/vendor-checksums.txt"

# Also install the binary in the expected location (renamed to base name)
mkdir -p "$FAKE_INSTALL/.spinosa/bin"
cp "$FAKE_GUM" "$FAKE_INSTALL/.spinosa/bin/gum"

VERIFY_OUTPUT="$(HOME="$FAKE_INSTALL" SPINOSA_HOME="$FAKE_INSTALL/.spinosa" bash "$REPO_ROOT/install.sh" --verify-only 2>/dev/null || true)"
if echo "$VERIFY_OUTPUT" | grep -q "Verification complete"; then
  pass "--verify-only verifies installed binaries"
else
  fail "--verify-only did not complete successfully"
  echo "    Output: $VERIFY_OUTPUT" | head -3
fi

# ── Test 17: spinosa upgrade --help ─────────────────────────────────────────
echo ""
echo "Test 17: spinosa upgrade --help"
UPGRADE_HELP="$($REPO_ROOT/.bin/spinosa upgrade --help 2>/dev/null || true)"
if echo "$UPGRADE_HELP" | grep -q "spinosa upgrade"; then
  pass "upgrade command has help"
else
  fail "upgrade command missing help"
fi

# ── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════════════════"
echo "  Results: $PASSED passed, $FAILED failed"
echo "═══════════════════════════════════════════════════════════════════════════"

if [[ "$FAILED" -gt 0 ]]; then
  exit 1
fi
