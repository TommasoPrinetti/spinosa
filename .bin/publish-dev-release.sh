#!/usr/bin/env bash
# Publish a dev/beta Spinosa release (GitHub prerelease — does not become "latest").
#
# Usage: bash .bin/publish-dev-release.sh <version> [--replace-assets]
# Example: bash .bin/publish-dev-release.sh 0.8.0-beta.1
#
# Before publishing:
#   1. Bump PINNED_VERSION in install.sh to match <version>
#   2. Commit on your dev branch
#   3. Run testsuite Phase A (minimum)
#
# Install (curl):
#   curl -fsSL https://github.com/TommasoPrinetti/spinosa/releases/download/dev/install.sh | bash
#   # or tag-specific:
#   curl -fsSL https://github.com/TommasoPrinetti/spinosa/releases/download/v0.8.0-beta.1/install.sh | bash
#
# Upgrade:
#   spinosa upgrade --channel dev

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "${SCRIPT_DIR}/publish-release.sh" "$@" --prerelease