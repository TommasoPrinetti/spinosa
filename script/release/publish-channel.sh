#!/usr/bin/env bash
# Legacy wrapper — prefer: bun script/release/publish-channel.ts <version>
set -euo pipefail
exec bun script/release/publish-channel.ts "$@"
