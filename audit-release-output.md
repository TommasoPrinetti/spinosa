## file
script/release.sh:60-66:redundant-tag-push | impact:medium | category:dup
`gh release create "$TAG"` on line 70 automatically creates the git tag from HEAD if it doesn't exist and pushes it (confirmed by gh CLI source at `create.go:86-87`: "If a matching git tag does not yet exist, one will automatically get created"). The manual `git tag "$TAG"` (line 61), existence check (line 60), and `git push origin "refs/tags/${TAG}"` (line 66) are 100% redundant. Only `--verify-tag` would make pre-existence matter, but the script doesn't use it. Removing these 7 lines would simplify without changing behavior.

script/release.sh:18:version-regex-drift-vs-install.sh | impact:medium | category:dup
release.sh line 18: `'^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$'`
install.sh line 220: `^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?(\+[a-zA-Z0-9.]+)?$`
Differences: (a) release.sh character class `[0-9A-Za-z]` vs install.sh `[a-zA-Z0-9]` — functionally equivalent but invites divergence. (b) install.sh allows build metadata suffix `(\+[a-zA-Z0-9.]+)?` — release.sh rejects it. (c) release.sh rejects versions without semver tags (e.g. `latest`) — install.sh explicitly handles `latest`. A shared regex constant would prevent drift.

script/release.sh:47-48-vs-55-56:pinned-tag-dual-mutation | impact:low | category:over
Lines 47-48 modify `dist/v${VERSION}/install.sh` setting PINNED_TAG="${TAG}" (e.g. `v0.8.0-beta.30`). Lines 55-56 modify `dist/${CHANNEL}/install.sh` setting PINNED_TAG="${CHANNEL}" (e.g. `beta`). This is intentional-by-design (version copy is immutable-pinned, channel copy is rolling), but the sed block is duplicated verbatim with only the DIST path and TAG value differing. This is a copy-paste pattern that should be a loop or function: `for dist in "v${VERSION}:${TAG}" "${CHANNEL}:${CHANNEL}"; do ... done`.

script/release.sh:49-57:per-folder-checksums-txt | impact:low | category:dup
Each dist subfolder generates its own `checksums.txt` containing SHA256 of that folder's `install.sh` only (one file, one checksum). This is correct because the install.sh files differ (different PINNED_TAG), but calling it "checksums" (plural) for a single-file checksum is misleading — it's just one SHA. The same `shasum -a 256 ... | awk ...` pipeline appears at lines 49 and 57. Could be DRY'd up. Also, uploading just install.sh + checksums.txt as release assets (lines 74-75) means the tarball source-archive from GitHub auto-generate is the only other artifact — checksums.txt doesn't cover it.

script/release.sh:95:unvalidated-verify | impact:medium | category:break
Line 95: `curl -fsSL "..." | grep PINNED_VERSION`. With `set -o pipefail` (line 7), grep failure does abort the script, so the check IS enforced. But: (a) it only checks the CHANNEL endpoint, not the version-specific immutable release — a failure in the primary release (line 70-75) would be invisible as long as the channel upload succeeds. (b) on failure, the bash ERR trace is the only output — no user-friendly error message. (c) it fetches over the network at the very end, making the script depend on internet for completion even after all release work is done.

script/release.sh:no-branch-check | impact:high | category:break
RELEASE_GUIDE.md section "Prerequisites" says "On the correct branch: `beta` for beta releases, `main` for stable releases" but the script never enforces this. Running `bash script/release.sh v0.8.0-beta.30` while on `main` would create a beta tag on the wrong branch. The GitHub auto-generated tarball would reflect main, not beta, producing a broken release. The fix: add `git branch --show-current` check before line 34.

script/release.sh:70-75:missing-verify-tag | impact:low | category:over
`gh release create` accepts `--verify-tag` to abort if the tag doesn't already exist remotely. The script manually creates/pushes the tag (lines 60-66), then calls `gh release create` without `--verify-tag`. If someone deletes the script's manual tag push (see redundancy above) and runs the script twice, a second run with the same tag would re-create the release without warning. Adding `--verify-tag` would prevent accidental re-release of an existing tag.

script/release.sh:no-package-json-cross-check | impact:high | category:break
The RELEASE_GUIDE.md pre-release checklist (lines 70-77) says to verify `"$(jq -r '.version' package.json)"` matches the tag, but the script doesn't automate this. Currently `package.json` version is `0.8.0-beta.30` while the last release assets show `dist/v0.8.0-beta.18/` exists — if the tag and package.json drift, the release proceeds silently. A check like `[ "$VERSION" = "$(jq -r '.version' package.json)" ]` before line 34 would catch it.

script/release.sh:no-rollback-on-failure | impact:medium | category:dead
If `gh release create` (line 70) fails after the tag is pushed (line 66), the tag is orphaned on the remote — no cleanup step exists. Similarly, if the channel release upload (line 83) fails after the channel tag is force-pushed (line 81), the rolling channel tag points at a release with corrupted/missing assets. The script should wrap each risky section with trap/cleanup or only push tags after the release succeeds.

install.sh:220:version-regex-additional-features | impact:low | category:dup
install.sh's regex allows build metadata `(\+[a-zA-Z0-9.]+)?` which release.sh rejects. If a build-metadata version is published (e.g. `1.0.0+20240101`), release.sh would reject it (cannot tag/release) but install.sh would accept it (can install). This means the two halves of the release pipeline disagree on what a valid version looks like — install.sh can install versions that the release script cannot publish.
