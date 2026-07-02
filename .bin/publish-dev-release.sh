#!/usr/bin/env bash
# Publish a beta Spinosa release (GitHub prerelease — does not update stable).
#
# Usage: bash .bin/publish-dev-release.sh <version> [--replace-assets]
# Example: bash .bin/publish-dev-release.sh 0.8.0-beta.1
#
# Before publishing:
#   1. Bump PINNED_VERSION in install.sh to match <version>
#   2. Set PINNED_TAG="beta" in install.sh
#   3. Commit on your beta/release branch
#   4. Run testsuite Phase A (minimum)
#
# Install (curl):
#   curl -fsSL https://github.com/TommasoPrinetti/spinosa/releases/download/beta/install.sh | bash
#   # or tag-specific:
#   curl -fsSL https://github.com/TommasoPrinetti/spinosa/releases/download/v0.8.0-beta.1/install.sh | bash
#
# Upgrade:
#   spinosa upgrade --channel beta

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

CURRENT_BRANCH="$(git branch --show-current)"
if [[ "$CURRENT_BRANCH" != "beta" ]]; then
  echo "Error: beta releases must be published from the 'beta' branch (current: ${CURRENT_BRANCH})"
  echo "  Run: git checkout beta && git merge ${CURRENT_BRANCH}"
  exit 1
fi

exec bash "${SCRIPT_DIR}/publish-release.sh" "$@" --prerelease
