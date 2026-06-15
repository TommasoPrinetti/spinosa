#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMPDIR="$(mktemp -d)"
PASSED=0
FAILED=0

cleanup() {
  rm -rf "$TMPDIR"
}
trap cleanup EXIT

pass() { echo "  ✓ $1"; PASSED=$((PASSED + 1)); }
fail() { echo "  ✗ $1"; FAILED=$((FAILED + 1)); }

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

make_bad_symlink_archive() {
  local archive="$1"
  local src="$TMPDIR/bad-archive-src"
  rm -rf "$src"
  mkdir -p "$src"
  printf 'ok\n' > "$src/file.txt"
  ln -s /etc/passwd "$src/absolute-link"
  tar -czf "$archive" -C "$src" .
}

echo "Spinosa Security Regression Tests"
echo ""

echo "Test 1: CLI safe_untar rejects absolute symlink archive"
make_bad_symlink_archive "$TMPDIR/bad.tgz"
sed '/^case "${1:-}" in$/,$d' "$REPO_ROOT/.bin/spinosa" > "$TMPDIR/spinosa-stripped.sh"
if bash -c "source '$TMPDIR/spinosa-stripped.sh'; safe_untar '$TMPDIR/bad.tgz' '$TMPDIR/out-cli'" >/dev/null 2>"$TMPDIR/cli-safe.err"; then
  fail "CLI safe_untar accepted unsafe symlink"
else
  if grep -q "unsafe symlink" "$TMPDIR/cli-safe.err"; then
    pass "CLI safe_untar rejects unsafe symlink"
  else
    fail "CLI safe_untar failed without expected message"
  fi
fi

echo ""
echo "Test 2: installer safe_untar rejects absolute symlink archive"
sed '/^main "$@"$/,$d' "$REPO_ROOT/install.sh" > "$TMPDIR/install-stripped.sh"
if bash -c "source '$TMPDIR/install-stripped.sh'; safe_untar '$TMPDIR/bad.tgz' '$TMPDIR/out-install'" >/dev/null 2>"$TMPDIR/install-safe.err"; then
  fail "installer safe_untar accepted unsafe symlink"
else
  if grep -q "unsafe symlinks" "$TMPDIR/install-safe.err"; then
    pass "installer safe_untar rejects unsafe symlink"
  else
    fail "installer safe_untar failed without expected message"
  fi
fi

echo ""
echo "Test 3: dashboard menu fails closed on EOF"
if bash -c "source '$TMPDIR/spinosa-stripped.sh'; NUMBERED=1; select_menu 'Choose' 'one' </dev/null" >"$TMPDIR/menu.out" 2>"$TMPDIR/menu.err"; then
  fail "select_menu accepted EOF"
else
  if grep -q "Cannot read from terminal" "$TMPDIR/menu.err" && ! grep -q "one" "$TMPDIR/menu.out"; then
    pass "select_menu rejects noninteractive EOF"
  else
    fail "select_menu EOF behavior unexpected"
  fi
fi

echo ""
echo "Test 4: upgrade installer fallback is pinned-only"
if grep -q "raw.githubusercontent.com/TommasoPrinetti/spinosa/main/install.sh" "$REPO_ROOT/.bin/spinosa"; then
  fail "upgrade still falls back to raw main installer"
else
  pass "upgrade has no raw main installer fallback"
fi

echo ""
echo "Test 5: installer does not source shell config"
if grep -q 'source "${config_file}"' "$REPO_ROOT/install.sh"; then
  fail "installer still sources user shell config"
else
  pass "installer no longer sources user shell config"
fi

echo ""
echo "Test 6: installer exposes no-launch option"
HELP_OUTPUT="$(bash "$REPO_ROOT/install.sh" --help 2>/dev/null || true)"
if echo "$HELP_OUTPUT" | grep -q -- "--no-launch"; then
  pass "installer supports --no-launch"
else
  fail "installer missing --no-launch"
fi

echo ""
echo "Test 7: malformed release dates fail --min-days"
FAKE_BIN="$TMPDIR/fake-bin"
mkdir -p "$FAKE_BIN"
cat > "$FAKE_BIN/curl" <<'EOF'
#!/bin/sh
printf '{"published_at": "not-a-date"}\n'
EOF
chmod +x "$FAKE_BIN/curl"
MIN_DAYS_OUTPUT="$(PATH="$FAKE_BIN:$PATH" bash "$REPO_ROOT/install.sh" --version 0.1.0 --min-days 1 --dry-run 2>&1 || true)"
if echo "$MIN_DAYS_OUTPUT" | grep -q "Cannot enforce --min-days"; then
  pass "malformed release date aborts --min-days"
else
  fail "malformed release date did not abort --min-days"
fi

echo ""
echo "Test 8: package-release rejects unsafe version before packaging"
PKG_OUTPUT="$(bash "$REPO_ROOT/.bin/package-release.sh" '../bad' 2>&1 || true)"
if echo "$PKG_OUTPUT" | grep -q "invalid version"; then
  pass "package-release rejects invalid version"
else
  fail "package-release accepted invalid version"
fi

echo ""
echo "Test 9: package-release uses explicit checksum assets"
if grep -q 'shasum -a 256 \* > checksums.txt' "$REPO_ROOT/.bin/package-release.sh"; then
  fail "package-release still checksums wildcard dist contents"
else
  pass "package-release no longer checksums wildcard dist contents"
fi

echo ""
echo "Test 10: publish-release requires explicit asset replacement"
if grep -q -- "--replace-assets" "$REPO_ROOT/.bin/publish-release.sh" && \
   grep -q "already exists. Re-run with --replace-assets" "$REPO_ROOT/.bin/publish-release.sh"; then
  pass "publish-release gates clobber behind --replace-assets"
else
  fail "publish-release clobber is not gated"
fi

echo ""
echo "Test 11: FIFO paths are reserved with mktemp -d"
if grep -q "mktemp -u" "$REPO_ROOT/.bin/spinosa"; then
  fail "spinosa still uses mktemp -u"
else
  pass "spinosa no longer uses mktemp -u"
fi

echo ""
echo "Test 12: temporary launcher scripts self-clean"
if grep -q 'trap .*rm -f "$0" "$_prompt"' "$REPO_ROOT/.bin/spinosa"; then
  pass "launcher scripts include self-clean trap"
else
  fail "launcher scripts do not self-clean"
fi

echo ""
echo "Test 13: installer verifies vendor tarball and honors --no-launch"
case "$(uname -s)" in
  Darwin) os="darwin" ;;
  Linux) os="linux" ;;
  *) os="unknown" ;;
esac
case "$(uname -m)" in
  arm64|aarch64) arch="arm64" ;;
  x86_64|amd64) arch="amd64" ;;
  i386|i686) arch="i386" ;;
  *) arch="unknown" ;;
esac
suffix="${os}-${arch}"
release_dir="$TMPDIR/release"
framework_stage="$TMPDIR/framework-stage/spinosa-framework-0.1.0"
vendor_stage="$TMPDIR/vendor-stage/spinosa-vendor-${suffix}"
mkdir -p "$framework_stage/.bin" "$framework_stage/.spinosa" "$framework_stage/metadata" "$vendor_stage"
cat > "$framework_stage/.bin/spinosa" <<'EOF'
#!/usr/bin/env bash
case "${1:-}" in
  help) echo "fake spinosa help"; exit 0 ;;
  *) echo "fake spinosa"; exit 0 ;;
esac
EOF
chmod +x "$framework_stage/.bin/spinosa"
printf 'path\trole\tpolicy\n.bin/spinosa\tframework\treplace\n' > "$framework_stage/.spinosa/framework-files.tsv"
printf '0.1.0\n' > "$framework_stage/metadata/version"
printf '# no platform binary checksums in this fixture\n' > "$framework_stage/metadata/vendor-checksums.txt"
printf '#!/bin/sh\necho rapidocr\n' > "$vendor_stage/rapidocr-cli"
printf '#!/bin/sh\necho markitdown\n' > "$vendor_stage/markitdown-cli"
chmod +x "$vendor_stage/rapidocr-cli" "$vendor_stage/markitdown-cli"
mkdir -p "$release_dir"
tar -czf "$release_dir/spinosa-framework-0.1.0.tar.gz" -C "$TMPDIR/framework-stage" "spinosa-framework-0.1.0"
tar -czf "$release_dir/spinosa-vendor-${suffix}.tar.gz" -C "$TMPDIR/vendor-stage" "spinosa-vendor-${suffix}"
{
  printf '%s  %s\n' "$(sha256_file "$release_dir/spinosa-framework-0.1.0.tar.gz")" "spinosa-framework-0.1.0.tar.gz"
  printf '%s  %s\n' "$(sha256_file "$release_dir/spinosa-vendor-${suffix}.tar.gz")" "spinosa-vendor-${suffix}.tar.gz"
} > "$release_dir/checksums.txt"
fake_curl_bin="$TMPDIR/fake-install-bin"
mkdir -p "$fake_curl_bin"
cat > "$fake_curl_bin/curl" <<'EOF'
#!/bin/sh
out=""
url=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift 2 ;;
    http*) url="$1"; shift ;;
    *) shift ;;
  esac
done
case "$url" in
  *spinosa-framework-0.1.0.tar.gz) cp "$SPINOSA_FAKE_RELEASE/spinosa-framework-0.1.0.tar.gz" "$out" ;;
  *spinosa-vendor-*.tar.gz)
    file="${url##*/}"
    cp "$SPINOSA_FAKE_RELEASE/$file" "$out"
    ;;
  *checksums.txt) cp "$SPINOSA_FAKE_RELEASE/checksums.txt" "$out" ;;
  *) printf '{"published_at": "2026-01-01T00:00:00Z"}\n' ;;
esac
EOF
chmod +x "$fake_curl_bin/curl"
fake_home="$TMPDIR/fake-install-home"
INSTALL_OUTPUT="$(HOME="$fake_home" SPINOSA_HOME="$fake_home/.spinosa" SPINOSA_BIN_DIR="$fake_home/.local/bin" SPINOSA_FAKE_RELEASE="$release_dir" PATH="$fake_curl_bin:$PATH" bash "$REPO_ROOT/install.sh" --version 0.1.0 --yes --no-launch --no-modify-path 2>&1 || true)"
if echo "$INSTALL_OUTPUT" | grep -q "Spinosa vendor checksum verified" && \
   echo "$INSTALL_OUTPUT" | grep -q "Run Spinosa with:" && \
   ! echo "$INSTALL_OUTPUT" | grep -q "Launching Spinosa dashboard" && \
   [[ -x "$fake_home/.spinosa/vendor/spinosa-${suffix}/rapidocr-cli" ]]; then
  pass "installer verifies vendor tarball and skips dashboard launch"
else
  fail "offline installer fixture failed"
fi

echo ""
echo "Results: $PASSED passed, $FAILED failed"
if [[ "$FAILED" -gt 0 ]]; then
  exit 1
fi
