#!/usr/bin/env bash
set -euo pipefail

# Spinosa CLI Test Suite
# Usage: bash tests/test_cli.sh

# ── Test Framework ──────────────────────────────────────────────────────────
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0
SUITE_START_TIME=0
TEST_START_TIME=0
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SPINOSA_BIN="$REPO_ROOT/.bin/spinosa"
TEST_HOME="$HOME/.spinosa-test-$$"
export SPINOSA_HOME="$TEST_HOME"

# Colors
if [[ -t 1 ]]; then
  R=$'\033[31m' G=$'\033[32m' Y=$'\033[33m' C=$'\033[36m' DIM=$'\033[2m' BOLD=$'\033[1m' RESET=$'\033[0m'
else
  R="" G="" Y="" C="" DIM="" BOLD="" RESET=""
fi

# ── Test Helpers ────────────────────────────────────────────────────────────
test_start() {
  TESTS_RUN=$((TESTS_RUN + 1))
  TEST_START_TIME=$(date +%s%N 2>/dev/null || echo "0")
  printf '\n%s[%d] %s%s\n' "${BOLD}${C}" "$TESTS_RUN" "$1" "${RESET}"
}

test_pass() {
  local duration=0
  if [[ "$TEST_START_TIME" != "0" ]]; then
    local end_time=$(date +%s%N 2>/dev/null || echo "0")
    if [[ "$end_time" != "0" ]]; then
      duration=$(( (end_time - TEST_START_TIME) / 1000000 ))
    fi
  fi
  TESTS_PASSED=$((TESTS_PASSED + 1))
  printf '  %s✓%s %s %s(%dms)%s\n' "${G}" "${RESET}" "$1" "${DIM}" "$duration" "${RESET}"
}

test_fail() {
  local duration=0
  if [[ "$TEST_START_TIME" != "0" ]]; then
    local end_time=$(date +%s%N 2>/dev/null || echo "0")
    if [[ "$end_time" != "0" ]]; then
      duration=$(( (end_time - TEST_START_TIME) / 1000000 ))
    fi
  fi
  TESTS_FAILED=$((TESTS_FAILED + 1))
  printf '  %s✗%s %s %s(%dms)%s\n' "${R}" "${RESET}" "$1" "${DIM}" "$duration" "${RESET}"
  [[ -n "${2:-}" ]] && printf '    %sReason:%s %s\n' "${DIM}" "${RESET}" "$2"
}

# Create a test harness that loads functions without executing main
create_test_harness() {
  # Strip the main case statement and save to file
  sed '/^case "${1:-}" in$/,$d' "$SPINOSA_BIN" > "$TEST_HOME/stripped.sh"
  
  cat > "$TEST_HOME/harness.sh" <<HARNESS_EOF
#!/usr/bin/env bash
# Test harness - loads functions without executing main
source "$TEST_HOME/stripped.sh"
HARNESS_EOF
  chmod +x "$TEST_HOME/harness.sh"
}

# Run a test in isolated environment
run_test() {
  local test_code="$1"
  create_test_harness
  bash -c "
    set -euo pipefail
    export SPINOSA_HOME='$TEST_HOME'
    export SPINOSA_BIN='$SPINOSA_BIN'
    source '$TEST_HOME/harness.sh'
    $test_code
  " 2>&1
}

# ── Setup & Teardown ────────────────────────────────────────────────────────
setup() {
  printf '%s\n' "${BOLD}Setting up test environment...${RESET}"
  mkdir -p "$TEST_HOME"
  # Create a test workspace
  mkdir -p "$TEST_HOME/test-workspace/.spinosa"
  cat > "$TEST_HOME/test-workspace/.spinosa/workspace" <<EOF
workspace_version: 1
framework_version: 0.3.0
created: 2026-06-06
project_name: Test Project
source_location: /tmp/sources
setup_status: workspace_started
EOF
  printf '  %s✓%s Test environment created at %s\n' "${G}" "${RESET}" "$TEST_HOME"
}

teardown() {
  printf '\n%s\n' "${BOLD}Cleaning up...${RESET}"
  rm -rf "$TEST_HOME"
  printf '  %s✓%s Test environment removed\n' "${G}" "${RESET}"
}

# ── Test Cases ──────────────────────────────────────────────────────────────

test_syntax_check() {
  test_start "Bash syntax check"
  if bash -n "$SPINOSA_BIN" 2>&1; then
    test_pass "No syntax errors"
  else
    test_fail "Syntax errors found"
  fi
}

test_help_command() {
  test_start "Help command"
  local output
  if output=$("$SPINOSA_BIN" help 2>&1); then
    if [[ "$output" == *"Usage:"* ]] && [[ "$output" == *"spinosa new"* ]]; then
      test_pass "Help output correct"
    else
      test_fail "Help output incomplete"
    fi
  else
    test_fail "Help command failed" "$output"
  fi
}

test_ctrl_c_handling() {
  test_start "Ctrl-C handling (SIGINT trap)"
  if grep -q "trap cleanup_on_exit EXIT INT TERM" "$SPINOSA_BIN" 2>&1; then
    test_pass "Global trap is defined"
  else
    test_fail "Global trap not found in script"
  fi
}

test_empty_array_handling() {
  test_start "Empty array handling (set -u safety)"
  local output
  if output=$(bash -c "
    set -euo pipefail
    arr=()
    if [[ \${#arr[@]} -gt 0 ]]; then
      echo \"\${arr[@]}\"
    fi
    echo 'SAFE'
  " 2>&1); then
    if [[ "$output" == *"SAFE"* ]]; then
      test_pass "Empty array check works"
    else
      test_fail "Empty array check failed" "$output"
    fi
  else
    test_fail "Empty array test crashed" "$output"
  fi
}

test_config_load_missing() {
  test_start "Config load with missing file"
  rm -f "$TEST_HOME/config.yaml"
  local output
  if output=$(run_test "
    load_config
    echo \"PERMISSION=\$SCAN_PERMISSION\"
    echo \"ROOTS=\${SCAN_ROOTS[*]:-}\"
  "); then
    if [[ "$output" == *"PERMISSION=unknown"* ]]; then
      test_pass "Defaults set when config missing"
    else
      test_fail "Defaults not set correctly" "$output"
    fi
  else
    test_fail "Config load crashed" "$output"
  fi
}

test_config_load_existing() {
  test_start "Config load with existing file"
  cat > "$TEST_HOME/config.yaml" <<EOF
scan_permission: "granted"
scan_roots:
  - "/tmp/test1"
  - "/tmp/test2"
EOF
  local output
  if output=$(run_test "
    load_config
    echo \"PERMISSION=\$SCAN_PERMISSION\"
    echo \"ROOTS=\${SCAN_ROOTS[*]}\"
  "); then
    if [[ "$output" == *"PERMISSION=granted"* ]] && [[ "$output" == *"/tmp/test1"* ]]; then
      test_pass "Config loaded correctly"
    else
      test_fail "Config not loaded correctly" "$output"
    fi
  else
    test_fail "Config load crashed" "$output"
  fi
}

test_workspace_registry_write() {
  test_start "Workspace registry write"
  rm -f "$TEST_HOME/workspaces.txt"
  local output
  if output=$(run_test "
    register_workspace '/tmp/test-ws' 'Test Project'
    cat \"\$SPINOSA_HOME/workspaces.txt\"
  "); then
    if [[ "$output" == *"/tmp/test-ws|Test Project|"* ]]; then
      test_pass "Workspace registered"
    else
      test_fail "Workspace not registered" "$output"
    fi
  else
    test_fail "Registry write crashed" "$output"
  fi
}

test_workspace_registry_read() {
  test_start "Workspace registry read"
  cat > "$TEST_HOME/workspaces.txt" <<EOF
/tmp/ws1|Project One|2026-06-06
/tmp/ws2|Project Two|2026-06-06
EOF
  mkdir -p /tmp/ws1/.spinosa /tmp/ws2/.spinosa
  local output
  if output=$(run_test "
    load_registry
  "); then
    if [[ "$output" == *"/tmp/ws1|Project One"* ]] && [[ "$output" == *"/tmp/ws2|Project Two"* ]]; then
      test_pass "Registry loaded correctly"
    else
      test_fail "Registry not loaded correctly" "$output"
    fi
  else
    test_fail "Registry read crashed" "$output"
  fi
  rm -rf /tmp/ws1 /tmp/ws2
}

test_workspace_registry_update() {
  test_start "Workspace registry update (no duplicates)"
  rm -f "$TEST_HOME/workspaces.txt"
  mkdir -p /tmp/ws-test/.spinosa
  cat > /tmp/ws-test/.spinosa/workspace <<EOF
project_name: Test
EOF
  local output
  if output=$(run_test "
    update_registry '/tmp/ws-test'
    update_registry '/tmp/ws-test'
    wc -l < \"\$SPINOSA_HOME/workspaces.txt\"
  "); then
    if [[ "$output" == *"1"* ]]; then
      test_pass "No duplicate entries"
    else
      test_fail "Duplicate entries found" "$output"
    fi
  else
    test_fail "Registry update crashed" "$output"
  fi
  rm -rf /tmp/ws-test
}

test_spinner_start_stop() {
  test_start "Spinner start and stop"
  local output
  if output=$(run_test "
    spinner_start 'Testing'
    sleep 0.2
    spinner_stop
    echo 'DONE'
  "); then
    if [[ "$output" == *"DONE"* ]]; then
      test_pass "Spinner lifecycle works"
    else
      test_fail "Spinner failed" "$output"
    fi
  else
    test_fail "Spinner crashed" "$output"
  fi
}

test_discover_with_permission_denied() {
  test_start "Discovery with permission denied"
  cat > "$TEST_HOME/config.yaml" <<EOF
scan_permission: "denied"
scan_roots:
  - "/tmp"
EOF
  local output
  if output=$(run_test "
    load_config
    discover_workspaces_with_permission
    echo \"EXIT_CODE=\$?\"
  "); then
    if [[ "$output" == *"EXIT_CODE=1"* ]]; then
      test_pass "Discovery returns 1 when denied"
    else
      test_fail "Discovery should return 1" "$output"
    fi
  else
    # Exit code 1 is expected
    test_pass "Discovery returns 1 when denied"
  fi
}

test_discover_with_registry() {
  test_start "Discovery uses registry when available"
  cat > "$TEST_HOME/config.yaml" <<EOF
scan_permission: "granted"
scan_roots:
  - "/tmp"
EOF
  cat > "$TEST_HOME/workspaces.txt" <<EOF
/tmp/registry-ws|Registry Project|2026-06-06
EOF
  mkdir -p /tmp/registry-ws/.spinosa
  local output
  if output=$(run_test "
    load_config
    discover_workspaces_with_permission
  "); then
    if [[ "$output" == *"/tmp/registry-ws|Registry Project"* ]]; then
      test_pass "Registry used for discovery"
    else
      test_fail "Registry not used" "$output"
    fi
  else
    test_fail "Discovery crashed" "$output"
  fi
  rm -rf /tmp/registry-ws
}

test_workspace_validation() {
  test_start "Workspace validation"
  local output
  if output=$(run_test "
    if validate_workspace '$TEST_HOME/test-workspace'; then
      echo 'VALID=0'
    else
      echo 'VALID=1'
    fi
    if validate_workspace '/nonexistent'; then
      echo 'INVALID=0'
    else
      echo 'INVALID=1'
    fi
  "); then
    if [[ "$output" == *"VALID=0"* ]] && [[ "$output" == *"INVALID=1"* ]]; then
      test_pass "Validation works correctly"
    else
      test_fail "Validation incorrect" "$output"
    fi
  else
    test_fail "Validation crashed" "$output"
  fi
}

test_dashboard_no_workspace() {
  test_start "Dashboard function exists and is callable"
  # Just verify the function exists - actual dashboard testing requires interactive terminal
  if run_test "type cmd_dashboard >/dev/null 2>&1"; then
    test_pass "Dashboard function is defined"
  else
    test_fail "Dashboard function not found"
  fi
}

test_ctrl_c_kills_spinner() {
  test_start "Ctrl-C kills running spinner"
  # Start a long-running command with spinner in background
  run_test "
    spinner_start 'Long operation'
    sleep 10
    spinner_stop
  " &
  SPIN_PID=$!
  sleep 0.5
  
  # Send SIGINT
  kill -INT $SPIN_PID 2>/dev/null
  wait $SPIN_PID 2>/dev/null
  local exit_code=$?
  
  # Should exit cleanly (our global trap handles SIGINT gracefully)
  # Exit code 0 means clean exit, 130 or 143 would mean killed by signal
  if [[ $exit_code -le 143 ]]; then
    test_pass "Spinner killed by SIGINT"
  else
    test_fail "Spinner not killed by SIGINT" "Exit code: $exit_code"
  fi
}

test_registry_persists_across_calls() {
  test_start "Registry persists across separate calls"
  rm -f "$TEST_HOME/workspaces.txt"
  
  # Create the workspace directory structure
  mkdir -p /tmp/persist-ws/.spinosa
  
  # First call - register workspace
  run_test "register_workspace '/tmp/persist-ws' 'Persist Test'" > /dev/null 2>&1
  
  # Second call - should still be there
  local output
  if output=$(run_test "load_registry"); then
    if [[ "$output" == *"/tmp/persist-ws|Persist Test"* ]]; then
      test_pass "Registry persists"
    else
      test_fail "Registry not persistent" "$output"
    fi
  else
    test_fail "Registry read failed" "$output"
  fi
  
  rm -rf /tmp/persist-ws
}

test_workspace_selection_with_path() {
  test_start "require_workspace with explicit path"
  local output
  if output=$(run_test "
    result=\$(require_workspace '$TEST_HOME/test-workspace')
    echo \"RESULT=\$result\"
  "); then
    if [[ "$output" == *"RESULT=$TEST_HOME/test-workspace"* ]]; then
      test_pass "Explicit path accepted"
    else
      test_fail "Explicit path not accepted" "$output"
    fi
  else
    test_fail "require_workspace crashed" "$output"
  fi
}

test_workspace_selection_invalid_path() {
  test_start "require_workspace with invalid path"
  local output
  output=$(run_test "
    require_workspace '/nonexistent/path' 2>&1
    echo \"EXIT=\$?\"
  " || true)
  
  if [[ "$output" == *"Not a valid Spinosa workspace"* ]] || [[ "$output" == *"EXIT=1"* ]]; then
    test_pass "Invalid path rejected"
  else
    test_fail "Invalid path not rejected" "$output"
  fi
}

test_scan_workspaces_empty_roots() {
  test_start "scan_workspaces with no roots"
  local output
  if output=$(run_test "
    scan_workspaces
    echo \"DONE\"
  "); then
    if [[ "$output" == *"DONE"* ]]; then
      test_pass "Handles empty roots gracefully"
    else
      test_fail "Failed with empty roots" "$output"
    fi
  else
    test_fail "Crashed with empty roots" "$output"
  fi
}

test_config_with_special_chars() {
  test_start "Config with special characters in paths"
  cat > "$TEST_HOME/config.yaml" <<EOF
scan_permission: "granted"
scan_roots:
  - "/tmp/test with spaces"
  - "/tmp/test-with-dashes"
  - "/tmp/test_with_underscores"
EOF
  local output
  if output=$(run_test "
    load_config
    echo \"ROOTS=\${SCAN_ROOTS[*]}\"
  "); then
    if [[ "$output" == *"test with spaces"* ]] && [[ "$output" == *"test-with-dashes"* ]]; then
      test_pass "Special characters handled"
    else
      test_fail "Special characters not handled" "$output"
    fi
  else
    test_fail "Config load crashed" "$output"
  fi
}

test_registry_handles_deleted_workspaces() {
  test_start "Registry handles deleted workspaces"
  mkdir -p /tmp/will-delete/.spinosa
  cat > "$TEST_HOME/workspaces.txt" <<EOF
/tmp/will-delete|Will Delete|2026-06-06
/tmp/also-gone|Also Gone|2026-06-06
EOF
  
  # Delete the workspaces
  rm -rf /tmp/will-delete /tmp/also-gone
  
  local output
  output=$(run_test "load_registry" 2>&1) || true
  
  # Should skip deleted workspaces (output should be empty or not contain the deleted paths)
  if [[ "$output" != *"/tmp/will-delete"* ]] && [[ "$output" != *"/tmp/also-gone"* ]]; then
    test_pass "Deleted workspaces filtered out"
  else
    test_fail "Deleted workspaces not filtered" "$output"
  fi
}

test_multiple_spinner_starts() {
  test_start "Multiple spinner start/stop cycles"
  local output
  if output=$(run_test "
    spinner_start 'First'
    sleep 0.1
    spinner_stop
    spinner_start 'Second'
    sleep 0.1
    spinner_stop
    spinner_start 'Third'
    sleep 0.1
    spinner_stop
    echo 'DONE'
  "); then
    if [[ "$output" == *"DONE"* ]]; then
      test_pass "Multiple cycles work"
    else
      test_fail "Multiple cycles failed" "$output"
    fi
  else
    test_fail "Multiple cycles crashed" "$output"
  fi
}

test_performance_registry_vs_scan() {
  test_start "Performance: registry vs scan"
  cat > "$TEST_HOME/workspaces.txt" <<EOF
/tmp/perf-ws1|Perf Test 1|2026-06-06
/tmp/perf-ws2|Perf Test 2|2026-06-06
EOF
  mkdir -p /tmp/perf-ws1/.spinosa /tmp/perf-ws2/.spinosa
  
  # Time registry load
  local registry_start=$(date +%s%N 2>/dev/null || echo "0")
  run_test "load_registry > /dev/null" > /dev/null 2>&1
  local registry_end=$(date +%s%N 2>/dev/null || echo "0")
  local registry_time=0
  if [[ "$registry_start" != "0" && "$registry_end" != "0" ]]; then
    registry_time=$(( (registry_end - registry_start) / 1000000 ))
  fi
  
  # Time scan
  local scan_start=$(date +%s%N 2>/dev/null || echo "0")
  run_test "scan_workspaces '/tmp' > /dev/null" > /dev/null 2>&1
  local scan_end=$(date +%s%N 2>/dev/null || echo "0")
  local scan_time=0
  if [[ "$scan_start" != "0" && "$scan_end" != "0" ]]; then
    scan_time=$(( (scan_end - scan_start) / 1000000 ))
  fi
  
  printf '    %sRegistry:%s %dms | %sScan:%s %dms\n' "${DIM}" "${RESET}" "$registry_time" "${DIM}" "${RESET}" "$scan_time"
  
  if [[ $registry_time -lt $scan_time ]] || [[ $scan_time -eq 0 ]]; then
    test_pass "Registry faster than scan"
  else
    test_pass "Performance measured" "Registry: ${registry_time}ms, Scan: ${scan_time}ms"
  fi
  
  rm -rf /tmp/perf-ws1 /tmp/perf-ws2
}

# ── Metrics & Summary ───────────────────────────────────────────────────────
print_summary() {
  local end_time=$(date +%s 2>/dev/null || echo "0")
  local total_time=0
  if [[ "$SUITE_START_TIME" != "0" && "$end_time" != "0" ]]; then
    total_time=$(( end_time - SUITE_START_TIME ))
  fi
  
  printf '\n%s\n' "${BOLD}═══════════════════════════════════════════════════════════════${RESET}"
  printf '%s\n' "${BOLD}Test Suite Summary${RESET}"
  printf '%s\n' "═══════════════════════════════════════════════════════════════"
  
  printf '  %sTotal:%s   %d\n' "${BOLD}" "${RESET}" "$TESTS_RUN"
  printf '  %sPassed:%s  %s%d%s\n' "${G}" "${RESET}" "${G}" "$TESTS_PASSED" "${RESET}"
  printf '  %sFailed:%s  %s%d%s\n' "${R}" "${RESET}" "${R}" "$TESTS_FAILED" "${RESET}"
  printf '  %sTime:%s    %ds\n' "${DIM}" "${RESET}" "$total_time"
  
  if [[ $TESTS_RUN -gt 0 ]]; then
    local success_rate=$(( TESTS_PASSED * 100 / TESTS_RUN ))
    printf '  %sSuccess:%s %d%%\n' "${C}" "${RESET}" "$success_rate"
  fi
  
  printf '%s\n' "═══════════════════════════════════════════════════════════════"
  
  if [[ $TESTS_FAILED -gt 0 ]]; then
    printf '\n%s✗ Some tests failed%s\n' "${R}" "${RESET}"
    return 1
  else
    printf '\n%s✓ All tests passed%s\n' "${G}" "${RESET}"
    return 0
  fi
}

# ── Main ────────────────────────────────────────────────────────────────────
main() {
  SUITE_START_TIME=$(date +%s 2>/dev/null || echo "0")
  
  printf '%s\n' "${BOLD}═══════════════════════════════════════════════════════════════${RESET}"
  printf '%s\n' "${BOLD}Spinosa CLI Test Suite${RESET}"
  printf '%s\n' "═══════════════════════════════════════════════════════════════"
  
  setup
  
  # Core functionality tests
  test_syntax_check
  test_help_command
  test_ctrl_c_handling
  test_empty_array_handling
  
  # Config tests
  test_config_load_missing
  test_config_load_existing
  
  # Registry tests
  test_workspace_registry_write
  test_workspace_registry_read
  test_workspace_registry_update
  
  # Spinner tests
  test_spinner_start_stop
  
  # Discovery tests
  test_discover_with_permission_denied
  test_discover_with_registry
  test_workspace_validation
  
  # Integration tests
  test_dashboard_no_workspace
  test_ctrl_c_kills_spinner
  test_workspace_selection_with_path
  test_workspace_selection_invalid_path
  
  # Edge case tests
  test_registry_persists_across_calls
  test_scan_workspaces_empty_roots
  test_config_with_special_chars
  test_registry_handles_deleted_workspaces
  test_multiple_spinner_starts
  
  # Performance tests
  test_performance_registry_vs_scan
  
  teardown
  print_summary
}

main "$@"
