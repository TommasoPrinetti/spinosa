#!/usr/bin/env bash
set -euo pipefail

bash -n install.sh
bash -n workspace-template/.bin/spinosa
test -f workspace-template/.spinosa/workspace-files.tsv
test -f workspace-template/.bin/spinosa

bun run --cwd packages/tui typecheck:spinosa
bun run --cwd packages/tui test:spinosa
bun run script/build-tui.ts --single --skip-install
