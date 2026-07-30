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

write_pkg_json() {
  local dest="$1"
  local name="$2"
  mkdir -p "$(dirname "$dest")"
  # install.sh extracts name via sed; keep "name" on its own line.
  cat >"$dest" <<EOF
{
  "name": "${name}",
  "version": "0.0.0"
}
EOF
}

@test "ensure_workspace_links uses @spinosa namespace only" {
  # Guard against regressing to @opencode-ai package links.
  run bash -c '! grep -q "@opencode-ai" <<<"$(declare -f ensure_workspace_links)"'
  [ "$status" -eq 0 ]

  fw_root="$BATS_TEST_TMPDIR/fw"
  write_pkg_json "$fw_root/packages/spinosa-core/package.json" "@spinosa/core"
  write_pkg_json "$fw_root/packages/other/package.json" "other"

  ensure_workspace_links "$fw_root"

  [ -L "$fw_root/node_modules/@spinosa/core" ]
  [ ! -e "$fw_root/node_modules/@spinosa/other" ]
  [ ! -d "$fw_root/node_modules/@opencode-ai" ]
}

@test "ensure_workspace_links is idempotent for existing symlink" {
  fw_root="$BATS_TEST_TMPDIR/fw2"
  write_pkg_json "$fw_root/packages/spinosa-cli/package.json" "@spinosa/cli"

  ensure_workspace_links "$fw_root"
  first_target="$(readlink "$fw_root/node_modules/@spinosa/cli")"
  ensure_workspace_links "$fw_root"
  second_target="$(readlink "$fw_root/node_modules/@spinosa/cli")"

  [ -n "$first_target" ]
  [ "$first_target" = "$second_target" ]
}
