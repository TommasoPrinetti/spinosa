#!/usr/bin/env bash
# Patch ~/.spinosa/versions/<current package.json version> from the local repo
# so the global `spinosa` command runs this checkout directly.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(awk -F'"' '/"version":/ { print $4; exit }' "$ROOT/package.json")"
SPINOSA_HOME="${SPINOSA_HOME:-$HOME/.spinosa}"
TARGET="${SPINOSA_HOME}/versions/${VERSION}"
# Real installs put the user-facing shim in ~/.local/bin (see env.sh / install.sh).
# ~/.spinosa/bin/spinosa is the home-local copy; PATH uses SPINOSA_BIN_DIR.
if [[ -z "${SPINOSA_BIN_DIR:-}" && -f "${SPINOSA_HOME}/env.sh" ]]; then
  # shellcheck disable=SC1090
  # Only pull BIN_DIR — do not source the whole file (would mutate caller PATH).
  SPINOSA_BIN_DIR="$(
    awk -F= '/^export SPINOSA_BIN_DIR=/ {
      gsub(/"/, "", $2)
      print $2
      exit
    }' "${SPINOSA_HOME}/env.sh"
  )"
fi
SPINOSA_BIN_DIR="${SPINOSA_BIN_DIR:-$HOME/.local/bin}"
BUN="${SPINOSA_HOME}/bin/bun"
if [[ ! -x "$BUN" ]]; then
  BUN="$(command -v bun)"
fi
[[ -n "$BUN" && -x "$BUN" ]] || { echo "Error: bun not found" >&2; exit 1; }

echo "→ Patching ${SPINOSA_HOME} with local repo v${VERSION}"
echo "  Shim dir: ${SPINOSA_BIN_DIR}"

mkdir -p "${SPINOSA_HOME}/versions" "${SPINOSA_HOME}/bin" "${SPINOSA_HOME}/metadata" "${SPINOSA_BIN_DIR}"
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
install -m 755 "${ROOT}/workspace-template/.bin/spinosa" "${SPINOSA_BIN_DIR}/spinosa"

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
echo "  Shim: ${SPINOSA_BIN_DIR}/spinosa"
echo "  Run: spinosa version"
echo "  Run: spinosa upgrade --check"
echo "  If command not found: source ${SPINOSA_HOME}/env.sh  (or open a new shell)"
