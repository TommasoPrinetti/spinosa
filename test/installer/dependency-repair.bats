#!/usr/bin/env bats

setup() {
  export SPINOSA_INSTALLER_LIB_ONLY=1
  export NO_COLOR=1
  export SPINOSA_LOG_DISABLED=1
  export SPINOSA_HOME="$BATS_TEST_TMPDIR/.spinosa"
  INSTALLER="$BATS_TEST_DIRNAME/../../install.sh"
  set --
  # shellcheck disable=SC1090
  source "$INSTALLER"
}

@test "prompt_dependency_repair accepts --yes without a TTY" {
  YES=1
  run prompt_dependency_repair
  [ "$status" -eq 0 ]
  [[ "$output" == *"Repairing automatically (--yes)"* ]]
}

@test "prompt_dependency_repair accepts SPINOSA_REPAIR=1" {
  YES=0
  SPINOSA_REPAIR=1
  run prompt_dependency_repair
  [ "$status" -eq 0 ]
  [[ "$output" == *"SPINOSA_REPAIR=1"* ]]
}

@test "prompt_dependency_repair surfaces Installation needs repair" {
  YES=1
  run prompt_dependency_repair
  [ "$status" -eq 0 ]
  [[ "$output" == *"Installation needs repair"* ]]
}
