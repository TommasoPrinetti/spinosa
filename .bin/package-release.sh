#!/usr/bin/env bash
set -euo pipefail

# ── package-release.sh — Build framework release bundle ─────────────────────
# Usage: bash .bin/package-release.sh <version>
#
# Creates dist/v<version>/ with:
#   - pilosa-framework-<version>.tar.gz
#   - install.sh
#   - checksums.txt
#
# The bundle is built from .pilosa/framework-files.tsv, not from the working tree.

if [[ -z "${1:-}" ]]; then
  echo "Usage: bash .bin/package-release.sh <version>"
  echo "Example: bash .bin/package-release.sh 0.1.0"
  exit 1
fi

VERSION="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST="${REPO_ROOT}/dist/v${VERSION}"
FRAMEWORK_ARCHIVE="pilosa-framework-${VERSION}.tar.gz"
STAGE="$(mktemp -d)"
FRAMEWORK_DIR="${STAGE}/pilosa-framework-${VERSION}"
MANIFEST="${REPO_ROOT}/.pilosa/framework-files.tsv"

echo "Packaging Pilosa Framework v${VERSION}"
echo "  Source: ${REPO_ROOT}"
echo "  Output: ${DIST}"
echo "  Stage:  ${STAGE}"
echo ""

# ── Validate manifest exists ────────────────────────────────────────────────
if [[ ! -f "$MANIFEST" ]]; then
  echo "Error: Framework manifest not found: $MANIFEST"
  exit 1
fi

# ── Create output directory ─────────────────────────────────────────────────
mkdir -p "$DIST"

# ── Copy framework-owned files ──────────────────────────────────────────────
echo "Copying framework files..."

excluded_count=0
copied_count=0

while IFS=$'\t' read -r path role policy; do
  # Skip header
  [[ "$path" == "path" ]] && continue

  src="${REPO_ROOT}/${path}"

  # Skip user_state files — they are templates, not release content
  if [[ "$role" == "user_state" ]]; then
    excluded_count=$((excluded_count + 1))
    continue
  fi

  if [[ -d "$src" ]]; then
    mkdir -p "${FRAMEWORK_DIR}/${path}"
    # Copy directory contents
    cp -a "$src"/. "${FRAMEWORK_DIR}/${path}/" 2>/dev/null || true
    copied_count=$((copied_count + 1))
  elif [[ -f "$src" ]]; then
    mkdir -p "$(dirname "${FRAMEWORK_DIR}/${path}")"
    cp -a "$src" "${FRAMEWORK_DIR}/${path}"
    copied_count=$((copied_count + 1))
  else
    echo "  Warning: $path not found, skipping"
  fi
done < "$MANIFEST"

echo "  Copied: $copied_count paths"
echo "  Excluded: $excluded_count user_state paths"

# ── Clean macOS junk from staged files ──────────────────────────────────────
echo "Cleaning .DS_Store files..."
find "$FRAMEWORK_DIR" -name ".DS_Store" -delete 2>/dev/null || true

# ── Add metadata ────────────────────────────────────────────────────────────
echo "Writing metadata..."

mkdir -p "${FRAMEWORK_DIR}/metadata"
echo "$VERSION" > "${FRAMEWORK_DIR}/metadata/version"
cp "$MANIFEST" "${FRAMEWORK_DIR}/metadata/framework-files.tsv"

# Also place the manifest at .pilosa/ so the installed CLI can find it
mkdir -p "${FRAMEWORK_DIR}/.pilosa"
cp "$MANIFEST" "${FRAMEWORK_DIR}/.pilosa/framework-files.tsv"

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
  rm -rf "$STAGE"
  exit 1
fi

echo "  All exclusions OK"

# ── Create tarball ──────────────────────────────────────────────────────────
echo "Creating archive..."

tar -czf "${DIST}/${FRAMEWORK_ARCHIVE}" -C "$STAGE" "pilosa-framework-${VERSION}"

# ── Stage install.sh ────────────────────────────────────────────────────────
echo "Staging install.sh..."

if [[ -f "${REPO_ROOT}/install.sh" ]]; then
  cp "${REPO_ROOT}/install.sh" "${DIST}/install.sh"
else
  echo "  Warning: install.sh not found at repo root. Create it before releasing."
fi

# ── Generate checksums ─────────────────────────────────────────────────────
echo "Generating checksums..."

(cd "$DIST" && shasum -a 256 * > checksums.txt 2>/dev/null || sha256sum * > checksums.txt)

# ── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo "Release bundle ready:"
echo "  ${DIST}/${FRAMEWORK_ARCHIVE}"
echo "  ${DIST}/checksums.txt"
ls -lh "${DIST}/${FRAMEWORK_ARCHIVE}"
echo ""

# ── Cleanup ─────────────────────────────────────────────────────────────────
rm -rf "$STAGE"
