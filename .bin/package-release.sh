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
# The framework archive is built from .pilosa/framework-files.tsv.
# install.sh is published as a separate release asset.

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

# ── Validate release assets ─────────────────────────────────────────────────
if [[ ! -f "${REPO_ROOT}/install.sh" ]]; then
  echo "Error: install.sh not found at repo root"
  exit 1
fi

# ── Create output directory ─────────────────────────────────────────────────
mkdir -p "$DIST"

# ── Copy framework-owned files ──────────────────────────────────────────────
echo "Copying framework files..."

excluded_count=0
copied_count=0
missing_count=0

while IFS=$'\t' read -r path role policy; do
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
    cp -a "$src"/. "${FRAMEWORK_DIR}/${path}/" 2>/dev/null || true
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
  rm -rf "$STAGE"
  exit 1
fi

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

# ── Bundle vendor binaries (Gum) ─────────────────────────────────────
echo "Bundling vendor binaries..."

GUM_VERSION="0.14.0"
VENDOR_DIR="${FRAMEWORK_DIR}/.bin/lib/vendor"
mkdir -p "$VENDOR_DIR"

bundle_platform_binary() {
  local name="$1" version="$2" url="$3" suffix="$4"
  local tmpdir
  tmpdir="$(mktemp -d)" || return 1
  echo "  Downloading ${name} ${suffix}..."
  if curl -fsSL "$url" -o "${tmpdir}/archive.tar.gz" 2>/dev/null; then
    local upstream_checksums_url="https://github.com/charmbracelet/${name}/releases/download/v${version}/checksums.txt"
    local upstream_checksums="${tmpdir}/upstream-checksums.txt"
    if ! curl -fsSL "$upstream_checksums_url" -o "$upstream_checksums" 2>/dev/null; then
      echo "    ERROR: Could not download upstream checksums for ${name} v${version}"
      rm -rf "$tmpdir"
      return 1
    fi

    local actual_hash
    actual_hash="$(sha256sum "${tmpdir}/archive.tar.gz" 2>/dev/null | awk '{print $1}' || shasum -a 256 "${tmpdir}/archive.tar.gz" 2>/dev/null | awk '{print $1}')"
    local archive_basename
    archive_basename="$(basename "$url")"
    local expected_entry
    expected_entry="$(grep "${archive_basename}" "$upstream_checksums" 2>/dev/null | head -1 || true)"

    if [[ -z "$expected_entry" ]]; then
      echo "    ERROR: ${archive_basename} not found in upstream checksums"
      rm -rf "$tmpdir"
      return 1
    fi

    local expected_hash
    expected_hash="$(printf '%s' "$expected_entry" | awk '{print $1}')"
    if [[ "$actual_hash" != "$expected_hash" ]]; then
      echo "    ERROR: Checksum mismatch for ${name} ${suffix}"
      echo "      Expected: ${expected_hash}"
      echo "      Got:      ${actual_hash}"
      rm -rf "$tmpdir"
      return 1
    fi
    echo "    Upstream checksum verified for ${name} ${suffix}"

    tar -xzf "${tmpdir}/archive.tar.gz" -C "$tmpdir" 2>/dev/null
    # Find the binary inside the extracted contents
    local bin_path
    bin_path="$(find "$tmpdir" -name "$name" -type f 2>/dev/null | head -1)"
    if [[ -n "$bin_path" ]]; then
      cp "$bin_path" "${VENDOR_DIR}/${name}-${suffix}"
      chmod +x "${VENDOR_DIR}/${name}-${suffix}"
      echo "    Bundled ${name}-${suffix}"
    else
      echo "    WARNING: ${name} binary not found in downloaded archive"
    fi
  else
    echo "    WARNING: Could not download ${name} ${suffix}"
  fi
  rm -rf "$tmpdir"
}

# Gum — all platforms
bundle_platform_binary "gum" "$GUM_VERSION" \
  "https://github.com/charmbracelet/gum/releases/download/v${GUM_VERSION}/gum_${GUM_VERSION}_Darwin_arm64.tar.gz" \
  "darwin-arm64"

bundle_platform_binary "gum" "$GUM_VERSION" \
  "https://github.com/charmbracelet/gum/releases/download/v${GUM_VERSION}/gum_${GUM_VERSION}_Darwin_x86_64.tar.gz" \
  "darwin-amd64"

bundle_platform_binary "gum" "$GUM_VERSION" \
  "https://github.com/charmbracelet/gum/releases/download/v${GUM_VERSION}/gum_${GUM_VERSION}_Linux_arm64.tar.gz" \
  "linux-arm64"

bundle_platform_binary "gum" "$GUM_VERSION" \
  "https://github.com/charmbracelet/gum/releases/download/v${GUM_VERSION}/gum_${GUM_VERSION}_Linux_x86_64.tar.gz" \
  "linux-amd64"

bundle_platform_binary "gum" "$GUM_VERSION" \
  "https://github.com/charmbracelet/gum/releases/download/v${GUM_VERSION}/gum_${GUM_VERSION}_Linux_i386.tar.gz" \
  "linux-i386"

# ── Vendor binary checksums ─────────────────────────────────────────────────
echo "Computing vendor binary checksums..."

CHECKSUMS_FILE="${FRAMEWORK_DIR}/metadata/vendor-checksums.txt"
printf '# Pilosa vendor binary checksums (SHA-256)\n' > "$CHECKSUMS_FILE"
printf '# Generated by package-release.sh\n' >> "$CHECKSUMS_FILE"

for vendor_bin in "$VENDOR_DIR"/*; do
  [[ -f "$vendor_bin" ]] || continue
  bin_file="$(basename "$vendor_bin")"
  # Parse "gum-darwin-arm64" → name="gum" suffix="darwin-arm64"
  # Parse "pilosa-vendor-darwin-arm64.tar.gz" → name="pilosa" suffix="vendor-darwin-arm64"
  if [[ "$bin_file" == *.tar.gz ]]; then
    bin_name="${bin_file%%-*}"
    bin_suffix="${bin_file#*-}"
    bin_suffix="${bin_suffix%.tar.gz}"
  else
    bin_name="${bin_file%%-*}"
    bin_suffix="${bin_file#*-}"
  fi
  hash="$(sha256sum "$vendor_bin" 2>/dev/null | awk '{print $1}' || shasum -a 256 "$vendor_bin" 2>/dev/null | awk '{print $1}')"
  printf '%s  %s  %s\n' "$hash" "$bin_name" "$bin_suffix" >> "$CHECKSUMS_FILE"
  echo "  ${bin_file}: ${hash:0:16}..."
done

# ── Release date ────────────────────────────────────────────────────────────
TODAY="$(date +%Y-%m-%d)"
echo "$TODAY" > "${FRAMEWORK_DIR}/metadata/release-date"
echo "  Release date: ${TODAY}"

# ── Vendor versions ──────────────────────────────────────────────────────────
VERSIONS_FILE="${FRAMEWORK_DIR}/metadata/vendor-versions.txt"
printf 'gum %s\n' "$GUM_VERSION" > "$VERSIONS_FILE"
printf 'python 3.11.15\n' >> "$VERSIONS_FILE"
echo "  Vendor versions recorded"

echo "  Vendor binaries bundled"
echo ""

# ── Create tarball ──────────────────────────────────────────────────────────
echo "Creating archive..."

tar -czf "${DIST}/${FRAMEWORK_ARCHIVE}" -C "$STAGE" "pilosa-framework-${VERSION}" --no-xattrs 2>/dev/null

# ── Stage install.sh ────────────────────────────────────────────────────────
echo "Staging install.sh..."

cp "${REPO_ROOT}/install.sh" "${DIST}/install.sh"

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
