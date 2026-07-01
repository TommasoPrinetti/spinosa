#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SPINOSA_LOG_COMPONENT="package-release"
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/lib/spinosa/logging_bootstrap.sh" "$@"

# ── package-release.sh — Build framework release bundle ─────────────────────
# Usage: bash .bin/package-release.sh <version>
#
# Creates dist/v<version>/ with:
#   - spinosa-framework-<version>.tar.gz
#   - install.sh
#   - checksums.txt
#
# The framework archive is built from .spinosa/framework-files.tsv.
# install.sh is published as a separate release asset.

if [[ -z "${1:-}" ]]; then
  echo "Usage: bash .bin/package-release.sh <version>"
  echo "Example: bash .bin/package-release.sh 0.1.0"
  exit 1
fi

VERSION="$1"
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: invalid version: $VERSION (use X.Y.Z)"
  exit 1
fi
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST="${REPO_ROOT}/dist/v${VERSION}"
FRAMEWORK_ARCHIVE="spinosa-framework-${VERSION}.tar.gz"
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/spinosa-pkg.XXXXXX")"
FRAMEWORK_DIR="${STAGE}/spinosa-framework-${VERSION}"
MANIFEST="${REPO_ROOT}/.spinosa/framework-files.tsv"

# Ensure stage is cleaned on any exit (errors, interrupts, etc.)
trap 'rm -rf "$STAGE" 2>/dev/null || true' EXIT

echo "Packaging Spinosa Framework v${VERSION}"
echo "  Source: ${REPO_ROOT}"
echo "  Output: ${DIST}"
echo "  Stage:  ${STAGE}"
echo ""

# ── Validate manifest exists ────────────────────────────────────────────────
if [[ ! -f "$MANIFEST" ]]; then
  echo "Error: Framework manifest not found: $MANIFEST"
  exit 1
fi

# ── Validate release assets ─────────────────────────────────────────────────
if [[ ! -f "${REPO_ROOT}/install.sh" ]]; then
  echo "Error: install.sh not found at repo root"
  exit 1
fi

sha256_artifact() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    echo "Error: no SHA-256 tool found" >&2
    return 1
  fi
}
# ── Create clean output directory ────────────────────────────────────────────
case "$DIST" in
  "$REPO_ROOT"/dist/v*) rm -rf "$DIST" ;;
  *) echo "Error: unsafe dist path: $DIST"; exit 1 ;;
esac
mkdir -p "$DIST"

# ── Copy framework-owned files ──────────────────────────────────────────────
echo "Copying framework files..."

excluded_count=0
copied_count=0
missing_count=0

while IFS=$'\t' read -r path role _policy; do
  # Skip header
  [[ "$path" == "path" ]] && continue

  src="${REPO_ROOT}/${path}"

  # Skip user-owned and generated workspace state. These are never release input.
  if [[ "$role" == "user_state" || "$role" == "generated_state" ]]; then
    excluded_count=$((excluded_count + 1))
    continue
  fi

  if [[ -d "$src" ]]; then
    mkdir -p "${FRAMEWORK_DIR}/${path}"
    # Copy directory contents
    cp -a "$src"/. "${FRAMEWORK_DIR}/${path}/"
    copied_count=$((copied_count + 1))
  elif [[ -f "$src" ]]; then
    mkdir -p "$(dirname "${FRAMEWORK_DIR}/${path}")"
    cp -a "$src" "${FRAMEWORK_DIR}/${path}"
    copied_count=$((copied_count + 1))
  else
    echo "  ERROR: required manifest path not found: $path"
    missing_count=$((missing_count + 1))
  fi
done < "$MANIFEST"

echo "  Copied: $copied_count paths"
echo "  Excluded: $excluded_count user/generated paths"

if [[ "$missing_count" -gt 0 ]]; then
  echo ""
  echo "Aborted: $missing_count required manifest paths missing."
  exit 1
fi

# ── Clean macOS junk from staged files ──────────────────────────────────────
echo "Cleaning .DS_Store and AppleDouble files..."
find "$FRAMEWORK_DIR" -name ".DS_Store" -delete 2>/dev/null || true
find "$FRAMEWORK_DIR" -name "._*" -delete 2>/dev/null || true

# ── Add metadata ────────────────────────────────────────────────────────────
echo "Writing metadata..."

mkdir -p "${FRAMEWORK_DIR}/metadata"
echo "$VERSION" > "${FRAMEWORK_DIR}/metadata/version"
cp "$MANIFEST" "${FRAMEWORK_DIR}/metadata/framework-files.tsv"

# Also place the manifest at .spinosa/ so the installed CLI can find it
mkdir -p "${FRAMEWORK_DIR}/.spinosa"
cp "$MANIFEST" "${FRAMEWORK_DIR}/.spinosa/framework-files.tsv"

# ── Exclusion verification ──────────────────────────────────────────────────
echo "Verifying exclusions..."

bad_files=0

# Check for .DS_Store
if find "$FRAMEWORK_DIR" -name ".DS_Store" -print -quit 2>/dev/null | grep -q .; then
  echo "  ERROR: Found .DS_Store in bundle"
  find "$FRAMEWORK_DIR" -name ".DS_Store"
  bad_files=$((bad_files + 1))
fi

# Check for .git
if [[ -d "${FRAMEWORK_DIR}/.git" ]]; then
  echo "  ERROR: Found .git/ in bundle"
  bad_files=$((bad_files + 1))
fi

# Check for node_modules
if find "$FRAMEWORK_DIR" -type d -name "node_modules" -print -quit 2>/dev/null | grep -q .; then
  echo "  ERROR: Found node_modules/ in bundle"
  find "$FRAMEWORK_DIR" -type d -name "node_modules"
  bad_files=$((bad_files + 1))
fi

# Check for .env files
if find "$FRAMEWORK_DIR" -name ".env*" -print -quit 2>/dev/null | grep -q .; then
  echo "  ERROR: Found .env* in bundle"
  find "$FRAMEWORK_DIR" -name ".env*"
  bad_files=$((bad_files + 1))
fi

# Check for raw/ content beyond AGENTS.md and .gitkeep
raw_contents="$(find "${FRAMEWORK_DIR}/raw/" -mindepth 1 -not -name "AGENTS.md" -not -name ".gitkeep" 2>/dev/null || true)"
if [[ -n "$raw_contents" ]]; then
  echo "  ERROR: Found unexpected files in raw/:"
  echo "$raw_contents"
  bad_files=$((bad_files + 1))
fi

# Check for generated maps (keep only template)
map_contents="$(find "${FRAMEWORK_DIR}/maps/" -name "*.md" -not -name "AGENTS.md" -not -name "map_template.md" 2>/dev/null || true)"
if [[ -n "$map_contents" ]]; then
  echo "  ERROR: Found generated maps in bundle:"
  echo "$map_contents"
  bad_files=$((bad_files + 1))
fi

# Check for generated system files
for f in dictionary.md workspace_index.md; do
  if [[ -f "${FRAMEWORK_DIR}/system/${f}" ]]; then
    echo "  ERROR: Found generated system/${f} in bundle"
    bad_files=$((bad_files + 1))
  fi
done

if [[ $bad_files -gt 0 ]]; then
  echo ""
  echo "Aborted: $bad_files exclusion violations found."
  exit 1
fi

echo "  All exclusions OK"

# ── Release date ────────────────────────────────────────────────────────────
TODAY="$(date +%Y-%m-%d)"
echo "$TODAY" > "${FRAMEWORK_DIR}/metadata/release-date"
echo "  Release date: ${TODAY}"

# ── Vendor versions ──────────────────────────────────────────────────────────
VERSIONS_FILE="${FRAMEWORK_DIR}/metadata/vendor-versions.txt"
printf 'python 3.11.15\n' > "$VERSIONS_FILE"
echo "  Vendor versions recorded"

# ── Vendor binary checksums ─────────────────────────────────────────────────────
echo "Computing vendor binary checksums..."
CHECKSUMS_FILE="${FRAMEWORK_DIR}/metadata/vendor-checksums.txt"
: > "$CHECKSUMS_FILE"
printf '# vendor-checksums.txt -- platform-pinned binary checksums\n' >> "$CHECKSUMS_FILE"
printf '# format: <sha256> <relative_path_in_vendor_dir> <platform_suffix>\n' >> "$CHECKSUMS_FILE"

shopt -s nullglob
for tarball in "${REPO_ROOT}/.bin/lib/vendor"/spinosa-vendor-*.tar.gz; do
  basename="$(basename "$tarball")"
  suffix="${basename#spinosa-vendor-}"
  suffix="${suffix%.tar.gz}"

  vtmp="$(mktemp -d "${TMPDIR:-/tmp}/vendor-checksum.XXXXXX")"
  tar -xzf "$tarball" -C "$vtmp" --strip-components=1

  for binary in rapidocr-cli markitdown-cli python/bin/python3; do
    if [[ -f "${vtmp}/${binary}" ]]; then
      printf '%s  %s  %s\n' \
        "$(sha256_artifact "${vtmp}/${binary}")" \
        "$binary" \
        "$suffix" >> "$CHECKSUMS_FILE"
    fi
  done

  rm -rf "$vtmp"
done
shopt -u nullglob

echo "  Vendor binary checksums recorded ($(wc -l < "$CHECKSUMS_FILE") entries across all platforms)"
echo ""

# ── Create tarball ──────────────────────────────────────────────────────────
echo "Creating archive..."

COPYFILE_DISABLE=1 tar --no-xattrs -czf "${DIST}/${FRAMEWORK_ARCHIVE}" -C "$STAGE" "spinosa-framework-${VERSION}" 2>/dev/null

# ── Stage install.sh ────────────────────────────────────────────────────────
echo "Staging install.sh..."

cp "${REPO_ROOT}/install.sh" "${DIST}/install.sh"

# Basic validation that we copied a plausible installer (guards against drift or bad source at release time).
if ! head -5 "${DIST}/install.sh" | grep -q 'auto-re-execs with bash'; then
  echo "Error: staged install.sh does not appear to be the Spinosa installer"
  exit 1
fi
echo "  install.sh staged and validated"

# ── Stage vendor tarballs ───────────────────────────────────────────────────
echo "Staging vendor tarballs..."

checksum_assets=("${DIST}/${FRAMEWORK_ARCHIVE}" "${DIST}/install.sh")
shopt -s nullglob
vendor_tarballs=("${REPO_ROOT}/.bin/lib/vendor"/spinosa-vendor-*.tar.gz)
shopt -u nullglob
[[ ${#vendor_tarballs[@]} -gt 0 ]] || { echo "Error: no spinosa-vendor tarballs found in .bin/lib/vendor"; exit 1; }
for tarball in "${vendor_tarballs[@]}"; do
  cp "$tarball" "${DIST}/$(basename "$tarball")"
  checksum_assets+=("${DIST}/$(basename "$tarball")")
done

# ── Generate checksums ─────────────────────────────────────────────────────
echo "Generating checksums..."

checksums_tmp="${DIST}/checksums.txt.tmp"
: > "$checksums_tmp"
for asset in "${checksum_assets[@]}"; do
  printf '%s  %s\n' "$(sha256_artifact "$asset")" "$(basename "$asset")" >> "$checksums_tmp"
done
mv "$checksums_tmp" "${DIST}/checksums.txt"

# ── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo "Release bundle ready:"
echo "  ${DIST}/${FRAMEWORK_ARCHIVE}"
echo "  ${DIST}/checksums.txt"
ls -lh "${DIST}/${FRAMEWORK_ARCHIVE}"
echo ""

# ── Cleanup ─────────────────────────────────────────────────────────────────
rm -rf "$STAGE" 2>/dev/null || true
trap - EXIT
