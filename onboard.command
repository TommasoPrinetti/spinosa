#!/usr/bin/env bash
set -euo pipefail

# Remove macOS quarantine attribute to avoid Gatekeeper warning on fresh clone
xattr -d com.apple.quarantine "$0" 2>/dev/null || true

cd "$(dirname "$0")"

if ! command -v bash >/dev/null 2>&1; then
  printf 'Bash is required but was not found.\n'
  printf 'Press Return to close this window...'
  IFS= read -r _ || true
  exit 1
fi

set +e
bash .bin/onboard.sh
status=$?
set -e

printf '\n'
if [[ "$status" -eq 0 ]]; then
  printf 'Onboarding finished.\n'
else
  printf 'Onboarding exited with status %s.\n' "$status"
fi

printf 'Press Return to close this window...'
IFS= read -r _ || true
exit "$status"
