#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SPINOSA_LOG_COMPONENT="test-install-vendor-reuse"
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/lib/spinosa/logging_bootstrap.sh" "$@"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
tmpdir="$(mktemp -d)"
cleanup() { rm -rf "$tmpdir"; }
trap cleanup EXIT

export SPINOSA_HOME="${tmpdir}/spinosa"
export SPINOSA_METADATA_DIR="${SPINOSA_HOME}/metadata"
export REINSTALL=0

# Load vendor reuse helpers from install.sh without executing main().
# shellcheck disable=SC1090
source <(
  sed -n '348,367p;499,646p' "$REPO_ROOT/install.sh"
)

mkdir -p "$tmpdir/checksums"
cat > "$tmpdir/checksums/checksums.txt" << 'EOF'
abc123  spinosa-vendor-darwin-arm64.tar.gz
def456  spinosa-framework-0.6.9.tar.gz
EOF

sha="$(vendor_tarball_sha_from_checksums "$tmpdir/checksums/checksums.txt" "darwin-arm64")"
[[ "$sha" == "abc123" ]] || { echo "FAIL tarball sha lookup: $sha"; exit 1; }

mkdir -p "${SPINOSA_HOME}/vendor/spinosa-darwin-arm64"
write_vendor_metadata "darwin-arm64" "abc123"
[[ "$(read_vendor_metadata_field platform_suffix)" == "darwin-arm64" ]] || { echo "FAIL metadata suffix"; exit 1; }
[[ "$(read_vendor_metadata_field vendor_tarball_sha256)" == "abc123" ]] || { echo "FAIL metadata sha"; exit 1; }
[[ "$(read_vendor_metadata_field pip_fingerprint)" == "$(vendor_pip_fingerprint)" ]] || { echo "FAIL metadata pip fingerprint"; exit 1; }

vendor_bundle_can_reuse "$tmpdir/checksums/checksums.txt" "darwin-arm64" "/no/such/vendor" "$REPO_ROOT" && {
  echo "FAIL expected missing vendor dir to block reuse"
  exit 1
}

write_vendor_metadata "darwin-arm64" "stale-sha"
vendor_bundle_can_reuse "$tmpdir/checksums/checksums.txt" "darwin-arm64" "${SPINOSA_HOME}/vendor/spinosa-darwin-arm64" "$REPO_ROOT" && {
  echo "FAIL expected stale tarball sha to block reuse"
  exit 1
}

REINSTALL=1
write_vendor_metadata "darwin-arm64" "abc123"
vendor_bundle_can_reuse "$tmpdir/checksums/checksums.txt" "darwin-arm64" "${SPINOSA_HOME}/vendor/spinosa-darwin-arm64" "$REPO_ROOT" && {
  echo "FAIL expected REINSTALL=1 to block reuse"
  exit 1
}

printf 'install vendor reuse tests passed\n'