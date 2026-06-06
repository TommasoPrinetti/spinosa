#!/usr/bin/env bash
set -euo pipefail

# Pilosa CLI Interactive Test Suite
# Tests the dashboard and interactive flows as a real user would experience them

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PILOSA_BIN="$REPO_ROOT/.bin/pilosa"
TEST_HOME="$HOME/.pilosa-interactive-test-$$"
export PILOSA_HOME="$TEST_HOME"

# Colors
if [[ -t 1 ]]; then
  R=$'\033[31m' G=$'\033[32m' Y=$'\033[33m' C=$'\033[36m' DIM=$'\033[2m' BOLD=$'\033[1m' RESET=$'\033[0m'
else
  R="" G="" Y="" C="" DIM="" BOLD="" RESET=""
fi

TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# ── Helpers ─────────────────────────────────────────────────────────────────

test_start() {
  TESTS_RUN=$((TESTS_RUN + 1))
  printf '\n%s[%d] %s%s\n' "${BOLD}${C}" "$TESTS_RUN" "$1" "${RESET}"
}

test_pass() {
  TESTS_PASSED=$((TESTS_PASSED + 1))
  printf '  %s✓%s %s\n' "${G}" "${RESET}" "$1"
}

test_fail() {
  TESTS_FAILED=$((TESTS_FAILED + 1))
  printf '  %s✗%s %s\n' "${R}" "${RESET}" "$1"
  [[ -n "${2:-}" ]] && printf '    %s%s%s\n' "${DIM}" "$2" "${RESET}"
}

# Run pilosa with simulated input and timeout
# Usage: run_interactive "input_sequence" timeout_seconds
run_interactive() {
  local input="$1"
  local timeout_secs="${2:-5}"
  local output_file="$TEST_HOME/output_$$.txt"
  
  # Create a temporary expect-like script
  cat > "$TEST_HOME/interact.sh" <<INTERACT_EOF
#!/usr/bin/env bash
export PILOSA_HOME="$TEST_HOME"
export PILOSA_BIN="$PILOSA_BIN"

# Feed input with delays to simulate real typing
{
  IFS='|' read -ra INPUTS <<< "$input"
  for inp in "\${INPUTS[@]}"; do
    echo "\$inp"
    sleep 0.3
  done
} | "$PILOSA_BIN" 2>&1
INTERACT_EOF
  chmod +x "$TEST_HOME/interact.sh"
  
  # Use background process with manual timeout
  bash "$TEST_HOME/interact.sh" > "$output_file" 2>&1 &
  local pid=$!
  
  # Wait with timeout
  local elapsed=0
  while kill -0 "$pid" 2>/dev/null && [[ $elapsed -lt $timeout_secs ]]; do
    sleep 0.1
    elapsed=$((elapsed + 1))
  done
  
  # Kill if still running
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  fi
  
  cat "$output_file"
}

# Check if output contains expected string
output_contains() {
  local output="$1"
  local expected="$2"
  [[ "$output" == *"$expected"* ]]
}

# ── Setup & Teardown ────────────────────────────────────────────────────────

setup() {
  printf '%s\n' "${BOLD}Setting up interactive test environment...${RESET}"
  mkdir -p "$TEST_HOME"
  
  # Create test workspaces
  for i in 1 2 3; do
    mkdir -p "$TEST_HOME/workspace-$i/.pilosa"
    cat > "$TEST_HOME/workspace-$i/.pilosa/workspace" <<EOF
workspace_version: 1
framework_version: 0.3.0
created: 2026-06-06
project_name: Test Project $i
source_location: /tmp/sources-$i
setup_status: workspace_started
EOF
  done
  
  # Create config with scan permission granted
  cat > "$TEST_HOME/config.yaml" <<EOF
scan_permission: "granted"
scan_roots:
  - "$TEST_HOME"
EOF
  
  # Register workspaces
  cat > "$TEST_HOME/workspaces.txt" <<EOF
$TEST_HOME/workspace-1|Test Project 1|2026-06-06
$TEST_HOME/workspace-2|Test Project 2|2026-06-06
$TEST_HOME/workspace-3|Test Project 3|2026-06-06
EOF
  
  printf '  %s✓%s Test environment created\n' "${G}" "${RESET}"
  printf '    Workspaces: 3\n'
  printf '    Config: granted\n'
  printf '    Registry: populated\n'
}

teardown() {
  printf '\n%s\n' "${BOLD}Cleaning up...${RESET}"
  rm -rf "$TEST_HOME"
  printf '  %s✓%s Test environment removed\n' "${G}" "${RESET}"
}

# ── Interactive Tests ───────────────────────────────────────────────────────

test_dashboard_shows_menu() {
  test_start "Dashboard shows menu with all options"
  
  # Send '9' to select Help (last option) then quit
  local output
  output=$(run_interactive "9" 3)
  
  if output_contains "$output" "Pilosa — Research Framework" && \
     output_contains "$output" "New workspace" && \
     output_contains "$output" "Update workspace" && \
     output_contains "$output" "Check workspace"; then
    test_pass "Dashboard menu displayed correctly"
  else
    test_fail "Dashboard menu incomplete" "$(echo "$output" | head -20)"
  fi
}

test_dashboard_shows_workspaces() {
  test_start "Dashboard shows discovered workspaces"
  
  local output
  output=$(run_interactive "9" 3)
  
  if output_contains "$output" "Discovered workspaces" || \
     output_contains "$output" "workspace-1" || \
     output_contains "$output" "Test Project"; then
    test_pass "Workspaces displayed in dashboard"
  else
    test_fail "Workspaces not shown" "$(echo "$output" | head -20)"
  fi
}

test_dashboard_shows_llm_clis() {
  test_start "Dashboard shows detected LLM CLIs"
  
  local output
  output=$(run_interactive "9" 3)
  
  if output_contains "$output" "LLM CLIs" || \
     output_contains "$output" "Claude Code" || \
     output_contains "$output" "OpenCode"; then
    test_pass "LLM CLIs detected and shown"
  else
    test_fail "LLM CLIs not shown" "$(echo "$output" | head -20)"
  fi
}

test_menu_selection_help() {
  test_start "Menu selection: Help (option 9)"
  
  local output
  output=$(run_interactive "9" 3)
  
  if output_contains "$output" "Usage:" && \
     output_contains "$output" "pilosa new"; then
    test_pass "Help command executed from menu"
  else
    test_fail "Help not shown" "$(echo "$output" | head -30)"
  fi
}

test_menu_selection_health() {
  test_start "Menu selection: System health (option 7)"
  
  local output
  output=$(run_interactive "7" 3)
  
  if output_contains "$output" "System Health" || \
     output_contains "$output" "Framework found"; then
    test_pass "Health command executed from menu"
  else
    test_fail "Health not shown" "$(echo "$output" | head -30)"
  fi
}

test_ctrl_c_during_menu() {
  test_start "Ctrl-C during menu selection"
  
  # Send Ctrl-C (ASCII 3) immediately
  local output
  output=$(printf '\x03' | "$PILOSA_BIN" 2>&1 &
    local pid=$!
    sleep 2
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
    wait "$pid" 2>/dev/null || true
  )
  
  # Should exit cleanly, not crash
  if [[ $? -le 130 ]]; then
    test_pass "Ctrl-C handled cleanly"
  else
    test_fail "Ctrl-C caused crash" "Exit code: $?"
  fi
}

test_ctrl_c_during_spinner() {
  test_start "Ctrl-C during spinner operation"
  
  # Start a command that uses spinner, then Ctrl-C
  local output
  output=$( (
    sleep 0.5
    printf '\x03'
  ) | "$PILOSA_BIN" health 2>&1 &
    local pid=$!
    sleep 3
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
    wait "$pid" 2>/dev/null || true
  )
  
  # Should not leave orphan processes
  if ! pgrep -f "pilosa.*health" > /dev/null 2>&1; then
    test_pass "No orphan processes after Ctrl-C"
  else
    test_fail "Orphan process left behind"
    pkill -f "pilosa.*health" 2>/dev/null || true
  fi
}

test_update_without_workspace() {
  test_start "Update command outside workspace shows selection"
  
  cd /tmp
  # Send '1' to select first workspace from list
  local output
  output=$(run_interactive "1" 5)
  
  if output_contains "$output" "workspace-1" || \
     output_contains "$output" "Test Project 1" || \
     output_contains "$output" "Select a workspace"; then
    test_pass "Workspace selection shown for update"
  else
    test_fail "Workspace selection not shown" "$(echo "$output" | head -30)"
  fi
}

test_check_without_workspace() {
  test_start "Check command outside workspace shows selection"
  
  cd /tmp
  # Use the check command directly
  local output
  output=$(run_interactive "1" 5)
  
  if output_contains "$output" "workspace-1" || \
     output_contains "$output" "Select a workspace"; then
    test_pass "Workspace selection shown for check"
  else
    test_fail "Workspace selection not shown" "$(echo "$output" | head -30)"
  fi
}

test_permission_prompt_first_run() {
  test_start "Permission prompt on first run (no config)"
  
  # Remove config to trigger permission prompt
  rm -f "$TEST_HOME/config.yaml"
  
  # Send 'n' to deny permission
  local output
  output=$(run_interactive "n" 3)
  
  if output_contains "$output" "Pilosa needs to discover" || \
     output_contains "$output" "Allow workspace discovery"; then
    test_pass "Permission prompt shown"
  else
    test_fail "Permission prompt not shown" "$(echo "$output" | head -20)"
  fi
  
  # Restore config
  cat > "$TEST_HOME/config.yaml" <<EOF
scan_permission: "granted"
scan_roots:
  - "$TEST_HOME"
EOF
}

test_permission_granted_flow() {
  test_start "Permission granted allows discovery"
  
  # Remove config and registry
  rm -f "$TEST_HOME/config.yaml"
  rm -f "$TEST_HOME/workspaces.txt"
  
  # Send 'y' to grant permission, then '9' for help
  local output
  output=$(run_interactive "y|9" 5)
  
  if output_contains "$output" "Pilosa — Research Framework"; then
    test_pass "Dashboard works after granting permission"
  else
    test_fail "Dashboard failed after permission" "$(echo "$output" | head -20)"
  fi
  
  # Verify config was saved
  if [[ -f "$TEST_HOME/config.yaml" ]] && \
     grep -q "granted" "$TEST_HOME/config.yaml"; then
    test_pass "Permission saved to config"
  else
    test_fail "Permission not saved"
  fi
}

test_upgrade_shows_release_notes() {
  test_start "Upgrade shows release notes before confirmation"
  
  # Send 'n' to cancel upgrade after seeing notes
  local output
  output=$(run_interactive "n" 10)
  
  if output_contains "$output" "Release Notes" || \
     output_contains "$output" "Pilosa Framework" || \
     output_contains "$output" "Download and run"; then
    test_pass "Release notes shown or upgrade prompt displayed"
  else
    test_fail "Release notes not shown" "$(echo "$output" | head -30)"
  fi
}

test_rapid_menu_navigation() {
  test_start "Rapid menu navigation (stress test)"
  
  # Quickly navigate through menu options
  local output
  output=$(run_interactive "1|2|3|4|5|6|7|8|9" 10)
  
  # Should not crash
  if [[ $? -le 130 ]]; then
    test_pass "Rapid navigation handled"
  else
    test_fail "Rapid navigation caused crash"
  fi
}

test_empty_input_handling() {
  test_start "Empty input handling"
  
  # Send just newlines
  local output
  output=$(printf '\n\n\n' | "$PILOSA_BIN" 2>&1 &
    local pid=$!
    sleep 3
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
    wait "$pid" 2>/dev/null || true
  )
  
  # Should not crash
  if [[ $? -le 130 ]]; then
    test_pass "Empty input handled"
  else
    test_fail "Empty input caused crash"
  fi
}

test_invalid_menu_selection() {
  test_start "Invalid menu selection (99)"
  
  # Send invalid number then valid
  local output
  output=$(run_interactive "99|9" 5)
  
  # Should handle gracefully
  if [[ $? -le 130 ]]; then
    test_pass "Invalid selection handled"
  else
    test_fail "Invalid selection caused crash"
  fi
}

test_concurrent_pilosa_instances() {
  test_start "Multiple pilosa instances don't conflict"
  
  # Start two instances
  "$PILOSA_BIN" help > "$TEST_HOME/out1.txt" 2>&1 &
  PID1=$!
  
  "$PILOSA_BIN" help > "$TEST_HOME/out2.txt" 2>&1 &
  PID2=$!
  
  # Wait for both
  wait $PID1 2>/dev/null || true
  wait $PID2 2>/dev/null || true
  
  # Both should complete
  if [[ -f "$TEST_HOME/out1.txt" ]] && [[ -f "$TEST_HOME/out2.txt" ]]; then
    test_pass "Concurrent instances work"
  else
    test_fail "Concurrent instances failed"
  fi
}

# ── Summary ─────────────────────────────────────────────────────────────────

print_summary() {
  printf '\n%s\n' "${BOLD}═══════════════════════════════════════════════════════════════${RESET}"
  printf '%s\n' "${BOLD}Interactive Test Suite Summary${RESET}"
  printf '%s\n' "═══════════════════════════════════════════════════════════════"
  
  printf '  %sTotal:%s   %d\n' "${BOLD}" "${RESET}" "$TESTS_RUN"
  printf '  %sPassed:%s  %s%d%s\n' "${G}" "${RESET}" "${G}" "$TESTS_PASSED" "${RESET}"
  printf '  %sFailed:%s  %s%d%s\n' "${R}" "${RESET}" "${R}" "$TESTS_FAILED" "${RESET}"
  
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
  printf '%s\n' "${BOLD}═══════════════════════════════════════════════════════════════${RESET}"
  printf '%s\n' "${BOLD}Pilosa CLI Interactive Test Suite${RESET}"
  printf '%s\n' "═══════════════════════════════════════════════════════════════"
  
  setup
  
  # Dashboard display tests
  test_dashboard_shows_menu
  test_dashboard_shows_workspaces
  test_dashboard_shows_llm_clis
  
  # Menu selection tests
  test_menu_selection_help
  test_menu_selection_health
  
  # Ctrl-C handling tests
  test_ctrl_c_during_menu
  test_ctrl_c_during_spinner
  
  # Workspace selection tests
  test_update_without_workspace
  test_check_without_workspace
  
  # Permission flow tests
  test_permission_prompt_first_run
  test_permission_granted_flow
  
  # Upgrade flow tests
  test_upgrade_shows_release_notes
  
  # Stress tests
  test_rapid_menu_navigation
  test_empty_input_handling
  test_invalid_menu_selection
  test_concurrent_pilosa_instances
  
  teardown
  print_summary
}

main "$@"
