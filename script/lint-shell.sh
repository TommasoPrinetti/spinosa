#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGETS=(
  "$ROOT/install.sh"
  "$ROOT/script/release/publish-channel.sh"
  "$ROOT/workspace-template/.bin/spinosa"
)

if ! command -v shellcheck >/dev/null 2>&1; then
  echo "shellcheck not installed — skipping shell lint"
  echo "Install with: brew install shellcheck"
  exit 0
fi

shellcheck "${TARGETS[@]}"
echo "✓ shellcheck passed"
