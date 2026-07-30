#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGETS=(
  "$ROOT/install.sh"
  "$ROOT/workspace-template/.bin/spinosa"
)

if ! command -v shellcheck >/dev/null 2>&1; then
  echo "shellcheck is required for release validation but was not found"
  echo "Install with: brew install shellcheck"
  exit 1
fi

shellcheck "${TARGETS[@]}"
echo "✓ shellcheck passed"
