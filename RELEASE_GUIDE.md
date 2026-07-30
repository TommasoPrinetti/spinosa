# Spinosa Release Guide

## Quick start

```bash
export GH_TOKEN=$(gh auth token)   # auto-detected if gh is logged in

# Beta release (from beta branch)
bun run release:beta:patch

# Stable release (from main branch)
bun run release:stable:patch

# Preview without side effects
bun run release beta patch --dry-run
```

Requirements: clean tree, branch `main` or `beta`, `gh` authenticated.

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
| `bun run release:republish -- vX.Y.Z` | Republish an existing version |

---

## Pipeline

One orchestrator: `script/release/index.ts`

```text
Spinosa release → v1.0.3-beta.1 (beta)
────────────────────────────────────────
… preflight
✓ preflight (42.1s)
… bump
✓ bump (1.2s) — 1.0.3-beta.0 → 1.0.3-beta.1
… build
✓ build (3.4s)
… verify-local
✓ verify-local (0.2s)
… git-tag
✓ git-tag (1.8s)
… publish-version
✓ publish-version (4.5s)
… channel
✓ channel (2.1s)
… verify-remote
✓ verify-remote (1.3s)
────────────────────────────────────────
✓ Released Spinosa v1.0.3-beta.1 (beta)
```

State is tracked in `dist/v{VERSION}/.release-state.json` so releases can be resumed.

### Stages

1. **preflight** — branch, clean tree, `bun run quality`
2. **bump** — sync `package.json` + `install.sh`, commit, push
3. **build** — stage installers, tarball, checksums
4. **verify-local** — pins and checksums
5. **git-tag** — push `v{VERSION}` tag
6. **publish-version** — GitHub release + assets
7. **channel** — sync rolling `beta`/`stable` tag + installer
8. **verify-remote** — live installer pin check

---

## Recovery

If a release fails mid-way:

```bash
export GH_TOKEN=$(gh auth token)
bun run release:resume
```

Resume a specific version from a stage:

```bash
bun run release resume 1.0.3-beta.1 --from channel
```

Republish without bumping:

```bash
bun run release:republish -- v1.0.3-beta.1
```

---

## What gets published

| Release | Tag | Assets |
| ------- | --- | ------ |
| Immutable version | `vX.Y.Z` | `install.sh`, tarball, `checksums.txt` |
| Rolling channel | `stable` or `beta` | `install.sh`, `checksums.txt` |

Beta never moves the `stable` rolling tag.

Version source of truth: root `package.json`. `bun script/set-version.ts` syncs `install.sh` `PINNED_VERSION`.

---

## Gotchas

- Commit before releasing — tarball is built from `HEAD`.
- `dist/` is gitignored; state file lives at `dist/v{VERSION}/.release-state.json`.
- Push beta with `git push origin HEAD:refs/heads/beta` if a local `beta` tag causes ref ambiguity.
- Docs website deploys via GitHub Actions on `main` only (not beta).
