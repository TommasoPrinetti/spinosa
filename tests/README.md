# Pilosa CLI Test Suite

## Overview

Comprehensive test suite for the Pilosa CLI system, covering core functionality, configuration management, workspace registry, and performance metrics.

## Running Tests

```bash
bash tests/test_cli.sh
```

## Test Coverage

### Core Functionality (4 tests)
1. **Bash syntax check** - Validates script has no syntax errors
2. **Help command** - Verifies help output is correct
3. **Ctrl-C handling** - Confirms global trap is defined for clean exits
4. **Empty array handling** - Tests `set -u` safety with empty arrays

### Configuration Management (2 tests)
5. **Config load with missing file** - Verifies defaults are set when config doesn't exist
6. **Config load with existing file** - Tests parsing of existing config file

### Workspace Registry (3 tests)
7. **Workspace registry write** - Tests registering a new workspace
8. **Workspace registry read** - Verifies loading workspaces from registry
9. **Workspace registry update** - Ensures no duplicate entries are created

### Spinner System (1 test)
10. **Spinner start and stop** - Validates spinner lifecycle works correctly

### Discovery System (3 tests)
11. **Discovery with permission denied** - Tests that discovery returns 1 when denied
12. **Discovery uses registry** - Verifies registry is used for instant lookup
13. **Workspace validation** - Tests workspace path validation

### Integration (1 test)
14. **Dashboard function exists** - Confirms dashboard command is defined

### Performance (1 test)
15. **Registry vs scan performance** - Measures and compares registry lookup vs filesystem scan

## Metrics Provided

- **Execution time** per test (in milliseconds)
- **Total suite time**
- **Success rate** percentage
- **Performance comparison** between registry and scan operations

## Test Framework Features

- **Isolated test environment** - Each test run uses a temporary directory
- **Automatic cleanup** - Test environment is removed after completion
- **Color output** - Visual pass/fail indicators (when terminal supports colors)
- **Detailed failure messages** - Shows reason for test failures
- **Function extraction** - Uses test harness to load functions without executing main

## Recent Fixes Tested

1. **Ctrl-C handling** - Global trap kills spinner and resets terminal
2. **Empty array safety** - Fixed `set -u` crash with empty arrays
3. **Config loading** - Fixed `set -e` exit on conditional expressions
4. **Workspace registry** - Persistent storage for instant workspace discovery

## Adding New Tests

To add a new test:

```bash
test_my_feature() {
  test_start "My feature description"
  local output
  if output=$(run_test "
    # Test code here
    echo 'result'
  "); then
    if [[ "$output" == *"expected"* ]]; then
      test_pass "Feature works correctly"
    else
      test_fail "Feature output incorrect" "$output"
    fi
  else
    test_fail "Feature crashed" "$output"
  fi
}
```

Then add the test function call to the `main()` function in the appropriate section.

## Test Results (Latest Run)

```
Total:   15
Passed:  15
Failed:  0
Time:    1s
Success: 100%
```

All tests passing ✓
