# Spinosa npm production stabilization

## Execution Directive (Standard)

Start with this file and continue the first non-done `WP-*` item. Keep changes non-destructive and update this rollup whenever an item changes status. For each completed item, record the exact implementation, causal rationale, validation commands, and reproducible test steps. Commit and push coherent checkpoints. Do not add legacy fallbacks or compatibility shims unless the owner, removal date, and tracking issue are recorded here.

## Metadata

- Created: 2026-07-29
- Scope: Bun/npm production distribution for Spinosa
- Baseline: `v1.0.2-beta.3`
- Branch: `release/npm-stabilization`
- Input: Spinosa npm Production Stabilization Plan supplied 2026-07-29
- Constraint: publish only explicitly approved packages; keep migration and release changes reversible
- Skill references: `skills/coding/SKILL.md`, `skills/coding/references/refactoring/workpackage-execution-directive.md`, `skills/coding/references/code-smells/smells/index.md`, `skills/coding/references/code-smells/smells/codex-code-smell.md`

## Background

The production path must become: pinned Bun installer → exact `@spinosa/kernel` version → Bun-selected platform package → installation validation → atomic activation.

## Goals

- Establish one canonical product version and npm release branch.
- Publish only `@spinosa/kernel` and tested platform packages.
- Remove Node, npm, source-tree, and runtime-network installation dependencies.
- Gate publishing with deterministic manifests, packed-install tests, and real platform validation.

## Non-goals

- Publishing `@spinosa/sdk` or `@spinosa/plugin` in the first release.
- Advertising Windows packages before target-native validation exists.
- Promoting an unsoaked build to `latest`.

## Rollup

| WP ID | Status | Last updated | Proof / validation pointer | Next action |
| --- | --- | --- | --- | --- |
| WP-00 Baseline and canonical version | Done 2026-07-29 | 2026-07-29 | `bun run check:versions` passed | — |
| WP-01 Public package boundary | Done 2026-07-29 | 2026-07-29 | `bun run release:list-packages` and config tests passed | — |
| WP-02 Deterministic publish manifests | Todo | 2026-07-29 | — | Normalize generated metadata and tarball contents |
| WP-03 Bun-only kernel launcher | Todo | 2026-07-29 | — | Remove Node/npm postinstall and network fallback |
| WP-04 Platform package generation | Todo | 2026-07-29 | — | Add matrix and registry assertions |
| WP-05 Packed-install tests | Todo | 2026-07-29 | — | Install local tarballs in an empty project |
| WP-06 Registry-based installer | Todo | 2026-07-29 | — | Replace source archive installation with `bun add --exact` |
| WP-07 Trusted npm publishing | Todo | 2026-07-29 | — | Add protected OIDC workflow and provenance |
| WP-08 Target-native validation | Todo | 2026-07-29 | — | Validate every advertised target |
| WP-09 Product identity cutover | Todo | 2026-07-29 | — | Enforce the OpenCode-reference allowlist |
| WP-10 Beta soak and promotion | Todo | 2026-07-29 | — | Soak exact registry bytes before `latest` |

## Required order

`WP-00 → WP-01 → WP-02 → WP-03 → WP-04 → WP-05 → WP-06 → WP-07 → WP-08 → WP-09 → WP-10`

## WP-00 implementation status (2026-07-29)

- Changed: created `release/npm-stabilization` from `v1.0.2-beta.3`; made the root version authoritative in `@spinosa/script`; aligned the kernel source manifest; added `check:versions`; documented the npm distribution model.
- Why it works: builds can no longer derive release versions from branch names or registry state, and the gate checks the installer, changelog, and product manifests against one version.
- Proof / validation: `git merge-base --is-ancestor v1.0.2-beta.3 HEAD`; `bun run check:versions`; `bun install --frozen-lockfile`; `bun run typecheck`.
- How to test: run the commands above from the repository root; any product-version drift exits non-zero with the mismatched file.

## WP-01 implementation status (2026-07-29)

- Changed: made all non-release workspaces private, removed stale public publish configuration, defined the exact kernel/macOS/Linux package set, added `release:list-packages`, and made kernel publishing reject a different generated set.
- Why it works: the approved list is a single executable boundary and both repository configuration and the publish entry point fail closed on unexpected packages.
- Proof / validation: `bun test --config /dev/null script/npm-release-config.test.ts` (3 pass); `bun run release:list-packages`; `bun run --cwd packages/spinosa-kernel typecheck`; `git diff --check`.
- How to test: run the commands above; making any workspace public or adding an unsupported package causes a non-zero exit.
