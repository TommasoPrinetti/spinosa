#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMPDIR="$(mktemp -d)"
PASSED=0
FAILED=0

cleanup() {
  rm -rf "$TMPDIR"
}
trap cleanup EXIT

pass() { echo "  ✓ $1"; PASSED=$((PASSED + 1)); }
fail() { echo "  ✗ $1"; FAILED=$((FAILED + 1)); }

echo "Spinosa Operativity Regression Tests"
echo ""

echo "Test 1: sync fails closed on noninteractive EOF"
SYNC_EOF_OUTPUT="$(HOME="$TMPDIR/home" SPINOSA_HOME="$TMPDIR/home/.spinosa" "$REPO_ROOT/.bin/spinosa" sync </dev/null 2>&1 || true)"
if echo "$SYNC_EOF_OUTPUT" | grep -q "Sync cancelled" && ! echo "$SYNC_EOF_OUTPUT" | grep -q "Cleaning stale mirrors"; then
  pass "sync cancelled before mirror cleanup"
else
  fail "sync did not cancel safely"
  echo "$SYNC_EOF_OUTPUT" | sed -n '1,8p'
fi

echo ""
echo "Test 2: sync dry-run remains automation-safe"
SYNC_DRY_OUTPUT="$(HOME="$TMPDIR/home" SPINOSA_HOME="$TMPDIR/home/.spinosa" "$REPO_ROOT/.bin/spinosa" sync --dry-run </dev/null 2>&1 || true)"
if echo "$SYNC_DRY_OUTPUT" | grep -q "Dry run" && ! echo "$SYNC_DRY_OUTPUT" | grep -q "Cleaning stale mirrors"; then
  pass "sync dry-run reports without writes"
else
  fail "sync dry-run did not remain read-only"
  echo "$SYNC_DRY_OUTPUT" | sed -n '1,8p'
fi

echo ""
echo "Test 3: root startup check accepts framework template mode"
STARTUP_OUTPUT="$(bash "$REPO_ROOT/.bin/check-startup.sh" 2>&1 || true)"
if echo "$STARTUP_OUTPUT" | grep -q "Startup check passed" && echo "$STARTUP_OUTPUT" | grep -q "Framework template mode"; then
  pass "template startup validation passes"
else
  fail "template startup validation failed"
  echo "$STARTUP_OUTPUT" | sed -n '1,12p'
fi

echo ""
echo "Test 4: historical and current installers parse"
if bash -n "$REPO_ROOT/install.sh"; then
  if [[ -f "$REPO_ROOT/dist/v0.4.11/install.sh" ]]; then
    if bash -n "$REPO_ROOT/dist/v0.4.11/install.sh"; then
      pass "current and local historical installers parse"
    else
      fail "local historical installer syntax check failed"
    fi
  else
    pass "current installer parses; ignored historical dist artifact absent"
  fi
else
  fail "current installer syntax check failed"
fi

echo ""
echo "Test 5: CLI tests can use a temp home outside HOME"
if grep -q 'SPINOSA_TEST_HOME:-' "$REPO_ROOT/tests/test_cli.sh"; then
  pass "test_cli honors SPINOSA_TEST_HOME without re-running full CLI suite"
else
  fail "test_cli does not expose SPINOSA_TEST_HOME override"
fi

echo ""
echo "Results: $PASSED passed, $FAILED failed"
if [[ "$FAILED" -gt 0 ]]; then
  exit 1
fi
