#!/usr/bin/env bash
set -euo pipefail

bash -n install.sh
bash -n workspace-template/.bin/spinosa
test -f workspace-template/.spinosa/workspace-files.tsv
test -f workspace-template/.bin/spinosa

for package in packages/*; do
  [ -f "$package/package.json" ] || continue
  if rg -q '"typecheck"' "$package/package.json"; then
    bun run --cwd "$package" typecheck
  fi
done

bun run --cwd packages/tui test:spinosa
bun run script/build-tui.ts --single --skip-install
