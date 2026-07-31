# Release sign-off template

Copy to `dist/vX.Y.Z/SIGNOFF.md` when cutting a release candidate.

```markdown
## Release vX.Y.Z — test sign-off

- [ ] Tester / date:
- [ ] macOS arm64 + system Bash version:
- [ ] Linux distro + arch (or N/A with reason):
- [ ] `bun run quality` passed
- [ ] Archive structure smoke: `bun script/smoke-install.ts --archive dist/vX.Y.Z/spinosa-vX.Y.Z.tar.gz --structure`
- [ ] Full archive smoke (release default): `bun script/smoke-install.ts --archive dist/vX.Y.Z/spinosa-vX.Y.Z.tar.gz`
- [ ] `spinosa version` / `doctor`
- [ ] TUI first frame + opens invoking project directory
- [ ] Upgrade from 1.0.0 workspace (Pilosa agents retired, corpus intact)
- [ ] Upgrade from previous beta
- [ ] GitHub: 3 immutable assets + 2 rolling channel assets
- [ ] CHANGELOG updated
- [ ] Open issues triaged (fixed / deferred / non-blocking)

Machine(s):
```
