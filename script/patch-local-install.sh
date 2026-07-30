#!/usr/bin/env bash
# Patch ~/.spinosa/versions/<current package.json version> from the local repo
# so the global `spinosa` command runs this checkout directly.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(awk -F'"' '/"version":/ { print $4; exit }' "$ROOT/package.json")"
SPINOSA_HOME="${SPINOSA_HOME:-$HOME/.spinosa}"
TARGET="${SPINOSA_HOME}/versions/${VERSION}"
BUN="${SPINOSA_HOME}/bin/bun"
if [[ ! -x "$BUN" ]]; then
  BUN="$(command -v bun)"
fi
[[ -n "$BUN" && -x "$BUN" ]] || { echo "Error: bun not found" >&2; exit 1; }

echo "→ Patching ${SPINOSA_HOME} with local repo v${VERSION}"

mkdir -p "${SPINOSA_HOME}/versions" "${SPINOSA_HOME}/bin" "${SPINOSA_HOME}/metadata"
rsync -a --delete \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude 'dist/' \
  --exclude '.trash/' \
  --exclude '.cursor/' \
  --exclude 'terminals/' \
  "$ROOT/" "$TARGET/"

mkdir -p "${TARGET}/metadata" "${TARGET}/workspace-template/.bin"
printf '%s\n' "$VERSION" > "${TARGET}/metadata/version"
install -m 755 "${ROOT}/workspace-template/.bin/spinosa" "${TARGET}/workspace-template/.bin/spinosa"
install -m 755 "${ROOT}/workspace-template/.bin/spinosa" "${SPINOSA_HOME}/bin/spinosa"

link_workspace_packages() {
  local root="$1" nm="${1}/node_modules/@spinosa"
  mkdir -p "$nm"
  for _pkg in "$root"/packages/*/; do
    [[ -f "${_pkg}package.json" ]] || continue
    _scoped="$(awk -F'"' '/"name":/ { print $4; exit }' "${_pkg}package.json")"
    [[ "$_scoped" == @spinosa/* ]] || continue
    _short="${_scoped#@spinosa/}"
    ln -sfn "../../packages/$(basename "$_pkg")" "${nm}/${_short}"
  done
}

echo "→ Installing dependencies in ${TARGET}"
(cd "$TARGET" && "$BUN" install --no-summary)
link_workspace_packages "$TARGET"

printf '%s %s\n' "$VERSION" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "${TARGET}/.spinosa-install-complete"

bun "$ROOT/script/patch-local-install-metadata.ts" "$VERSION"

echo "→ Verifying patched runtime"
SPINOSA_HOME="$SPINOSA_HOME" SPINOSA_TEMPLATE_ROOT="$TARGET" \
  "$BUN" run "${TARGET}/packages/spinosa-kernel/src/index.ts" version

echo "✓ Patched ${SPINOSA_HOME} to local v${VERSION}"
echo "  Run: spinosa version"
echo "  Run: spinosa upgrade --check"
