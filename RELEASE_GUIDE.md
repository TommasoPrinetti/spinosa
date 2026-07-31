# Spinosa Release Guide

## Quick start

```bash
export GH_TOKEN=$(gh auth token)   # auto-detected if gh is logged in

# Beta release (from beta branch only)
bun run release:beta:patch

# Stable release (from main branch only — after beta→main promotion PR)
bun run release:stable:patch

# Preview without side effects
bun run release beta patch --dry-run
```

Requirements: clean tree, matching branch (`beta` for beta, `main` for stable), `gh` authenticated.

---

## Commands

| Command | Purpose |
| ------- | ------- |
| `bun run release:beta:patch` | Bump beta prerelease and publish |
| `bun run release:beta:minor` | Bump beta minor series |
| `bun run release:stable:patch` | Stable patch release |
| `bun run release:validate` | Preflight only (branch + quality) |
| `bun run release plan beta patch` | Show version bump without publishing |
| `bun run release:resume` | Resume the latest incomplete release |
| `bun run release:republish -- vX.Y.Z` | Republish only when checksums match (immutable) |

---

## Pipeline

One orchestrator: `script/release/index.ts`

```text
preflight → bump → build → verify-local → smoke → git-tag → publish-version → channel → verify-remote
```

State is tracked in `dist/v{VERSION}/.release-state.json` so releases can be resumed.

### Stages

1. **preflight** — channel↔branch enforcement, clean tree, `bun run quality`
2. **bump** — sync versions, commit, push; refresh release-state SHA to post-bump HEAD
3. **build** — stage installers/tarball/checksums from the release-state SHA (not a drifting HEAD)
4. **verify-local** — pins and checksums
5. **smoke** — extract local tarball and assert key paths (fast). Set `SPINOSA_SMOKE_FULL=1` for frozen install + `version`/`doctor` + cwd inside the archive
6. **git-tag** — tag must equal HEAD/state SHA
7. **publish-version** — create immutable GitHub release (refuse checksum clobber)
8. **channel** — sync rolling `beta`/`stable` tag + installer (clobber allowed only here)
9. **verify-remote** — live installer pin check; `SPINOSA_SMOKE_REMOTE=1` downloads the published archive (structure-only unless `SPINOSA_SMOKE_FULL=1`)

---

## Quality gates

| Command | When | What |
| ------- | ---- | ---- |
| `bun run quality` | Every beta cut / `release:validate` | Parallel: product typechecks, shellcheck, release-critical unit/TUI tests, installer bats, repo smoke |
| `bun run smoke` | Local iteration | Repo-root `version`/`doctor` + cwd (same as quality’s smoke) |
| `bun run quality:full` | Before stable / deep sweep | Full typecheck-all, knip, syncpack, depcruise, all core+tui spinosa tests |
| `SPINOSA_SMOKE_FULL=1` | Before stable / archive confidence | Full tarball install+launch smoke |

Quality is **local only** — no GitHub Actions quality workflow.

---

## What gets published

| Release | Tag | Assets |
| ------- | --- | ------ |
| Immutable version | `vX.Y.Z` | `install.sh`, `spinosa-vX.Y.Z.tar.gz`, `checksums.txt` (3) |
| Rolling channel | `stable` or `beta` | `install.sh`, `checksums.txt` (2) |

The tarball is a **full source archive** (`git archive <sha>`). This is intentional: users get the same tree CI builds from. Runtime size and unused paths (tests, website, release tooling) are accepted for stable until a curated allowlist ships.

Beta never moves the `stable` rolling tag.

Version source of truth: root `package.json`. `bun script/set-version.ts` syncs `install.sh` `PINNED_VERSION` and Spinosa product package versions. Add a `## [version]` section to `CHANGELOG.md` before releasing.

---

## Platform matrix (required before stable)

| Target | Status |
| ------ | ------ |
| macOS arm64 (system Bash 3.2+) | Required |
| macOS Intel | Unsupported unless explicitly tested |
| Ubuntu x64 | Required |
| Linux arm64 | Best-effort; document if untested |
| musl (if installer ships musl Bun) | Smoke install once per major |

Record results in the sign-off checklist (`workspace-template/docs/reference/testsuite.md`).

---

## Stable promotion

1. Freeze `beta` at the candidate commit.
2. Open a reviewable `beta` → `main` pull request.
3. Require local `bun run quality`, structure archive smoke (or `SPINOSA_SMOKE_FULL=1`), and migration notes.
4. Merge, then cut `bun run release:stable:patch` **from `main`**.

---

## Recovery

```bash
export GH_TOKEN=$(gh auth token)
bun run release:resume
bun run release resume 1.0.3-beta.1 --from smoke
```

---

## Gotchas

- Commit before releasing — tarball is built from the release-state SHA after bump.
- `dist/` is gitignored; state file lives at `dist/v{VERSION}/.release-state.json`.
- Push beta with `git push origin HEAD:refs/heads/beta` if a local `beta` tag causes ref ambiguity.
- Docs website deploys via GitHub Actions on `main` only (not beta).
- Quality is **local only** (`bun run quality` / `quality:full`) — no GitHub Actions quality workflow.
- Default release archive smoke is structure-only; set `SPINOSA_SMOKE_FULL=1` when you need install+launch inside the tarball.
