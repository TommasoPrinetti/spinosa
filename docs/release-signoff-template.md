# Release sign-off template

Copy to `dist/vX.Y.Z/SIGNOFF.md` when cutting a release candidate.

```markdown
## Release vX.Y.Z — test sign-off

- [ ] Tester / date:
- [ ] macOS arm64 virgin install + system Bash version:
- [ ] macOS x64 virgin install (or N/A with reason):
- [ ] Linux arm64 glibc virgin install (or N/A with reason):
- [ ] Linux x64 glibc virgin install (or N/A with reason):
- [ ] `bun run quality` passed
- [ ] `bun run quality:binary` passed (host build + binary smoke)
- [ ] Installer HTTP smoke: `bun script/smoke-install.ts --dist dist/vX.Y.Z`
- [ ] Immutable assets exactly: install.sh + four binaries + checksums.txt + build-manifest.json (no tar.gz)
- [ ] `spinosa version` / `doctor` (Distribution: binary)
- [ ] Workspace create + update from embedded templates
- [ ] Source→binary migration from 1.0.3-beta.9 (metadata + workspaces preserved; managed launchers migrated)
- [ ] Binary→binary upgrade + failed-activation rollback
- [ ] Feature smoke: TUI / PDF / OCR / MarkItDown / watcher
- [ ] Rolling channel: install.sh + checksums only
- [ ] CHANGELOG section for this version
- [ ] Open issues triaged (fixed / deferred / non-blocking)
- [ ] Stable soak complete (stable only)

Machine(s):
```
