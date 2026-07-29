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
| WP-02 Deterministic publish manifests | Done 2026-07-29 | 2026-07-29 | Generated package smoke/pack and manifest checks passed | — |
| WP-03 Bun-only kernel launcher | Done 2026-07-29 | 2026-07-29 | Launcher/layout tests, current-platform smoke, Bun/npm pack inspection passed | — |
| WP-04 Platform package generation | Done 2026-07-29 | 2026-07-29 | Nine-target build, manifest verifier, native dependency and registry-gate tests passed | — |
| WP-05 Packed-install tests | Done 2026-07-29 | 2026-07-29 | Ten-package pack audit and isolated offline install smoke passed | — |
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

## WP-02 implementation status (2026-07-29)

- Changed: centralized generated npm metadata and the nine-target matrix; added README/LICENSE/file allowlists; enforced exact platform versions; added manifest validation for forbidden workspace, catalog, local-path, and Git dependencies.
- Why it works: build and publish now consume the same package constructors and approved target list, so manifest metadata and package boundaries cannot drift independently.
- Proof / validation: `bun test --config /dev/null script/npm-release-config.test.ts` (6 pass); single-platform kernel build and binary smoke test; `bun run release:validate-manifest --allow-partial`; `bun pm pack`; `npm pack --dry-run --json`; kernel typecheck.
- How to test: build the current platform with `bun run --cwd packages/spinosa-kernel build --single --skip-install --skip-embed-web-ui`, run the partial validator, then inspect the dry-run pack file list. Full release builds must pass `bun run release:validate-manifest` without `--allow-partial`.

## WP-03 implementation status (2026-07-29)

- Changed: replaced the Node launcher and npm-downloading postinstall with a Bun launcher that selects the exact approved platform package already present in `node_modules`; removed the lifecycle hook from generated manifests; made umbrella staging copy the complete `bin/` directory; restored launcher executable mode; updated distribution tests to exercise an isolated installed-package layout.
- Why works: package selection is centralized in a pure target resolver and the launcher only walks installed `node_modules` ancestors. Unsupported targets and missing packages fail with explicit diagnostics; no environment override, cached binary, package-manager subprocess, or runtime network fallback remains.
- Proof / validation: `bun test --config /dev/null packages/spinosa-kernel/test/distribution/package-layout.test.ts packages/spinosa-kernel/test/platform-package.test.ts script/npm-release-config.test.ts` (23 pass, 70 assertions); `bun run --cwd packages/spinosa-kernel build --single --skip-install --skip-embed-web-ui` (Darwin arm64 smoke reported `1.0.2-beta.3`); kernel and repository typechecks; frozen install; version/package-boundary/partial-manifest gates; `bun pm pack` and `npm pack --dry-run --json` both contained only `LICENSE`, `README.md`, `bin/platform.ts`, executable `bin/spinosa`, and `package.json`.
- How to test: run the focused tests and current-platform build above, then prepare the umbrella directory with `createKernelPackageManifest`, pack it with Bun or npm, and confirm there is no `scripts.postinstall`, `postinstall.mjs`, Node shebang, or runtime install path.

## WP-04 implementation status (2026-07-29)

- Changed: added fail-closed complete-platform-set checks to build and publish; added the `build:kernel:all` and `release:verify-platform-set` release commands; made Linux manifests explicitly declare `glibc` or `musl`; removed the universal Darwin-only Sharp dependency; pinned and overrode `onnxruntime-node` to `1.23.2`, whose npm tarball contains both advertised Darwin architectures; made cross-target dependency preparation use the frozen root lockfile; added an exact-version public-npm registry barrier before umbrella publication.
- Why works: the same canonical nine-target list now drives naming, manifests, build completion, local verification, publish staging, and registry readiness. A missing/extra artifact or unavailable/mismatched registry version stops the umbrella release. Frozen all-platform installation applies the repository lockfile and patches before compilation, while the ONNX pin prevents the incomplete `1.27.0` Darwin package from breaking x64 builds.
- Proof / validation: `bun test --config /dev/null script/npm-release-config.test.ts script/npm-registry.test.ts packages/spinosa-kernel/test/platform-package.test.ts packages/spinosa-kernel/test/distribution/package-layout.test.ts` (29 pass, 86 assertions); `bun run build:kernel:all` generated all nine packages and smoke-tested Darwin arm64 at `1.0.2-beta.3`; `bun run release:verify-platform-set` validated nine manifests; artifact inspection confirmed Darwin Mach-O and Linux glibc/musl ELF interpreters; repository typecheck, frozen install, version/package-boundary gates, and `git diff --check` passed.
- How to test: run `bun install --frozen-lockfile`, `bun run build:kernel:all`, `bun run release:verify-platform-set`, the focused tests above, and `bun run typecheck`. Registry-gate unit tests use injected lookups and do not publish or require npm credentials.
- Limitation: `build:kernel:all` explicitly skips the legacy embedded web UI because this repository has no buildable `packages/app`. It validates the complete kernel/native package matrix; restoring an embedded web application remains a separate production-gate item before target-native release acceptance.

## WP-05 implementation status (2026-07-29)

- Changed: added reusable side-effect-free umbrella staging, `script/test-packages.ts`, the `test:packed-install` command, and an npm package gate workflow. The harness packs all nine platform packages plus the umbrella, enforces exact archive allowlists, installs only local compatible tarballs in an external temporary project with an unreachable registry and fresh Bun cache, isolates HOME/Spinosa/XDG state, audits installed symlinks, removes non-selected compatible variants, and runs version, help, and readiness-confirmed headless server smokes.
- Why works: the test consumes the same staged bytes that publishing uses and has no registry or monorepo fallback available. Any missing package, manifest drift, unexpected file, external symlink, source-tree dependency, launcher selection failure, user-state dependency, or startup regression makes the one-command gate fail.
- Proof / validation: `bun run test:packed-install` rebuilt and validated all nine platform manifests, packed all ten public packages, installed `@spinosa/kernel@1.0.2-beta.3` with the compatible local platform tarball in a temporary empty project, and passed `spinosa --version`, `spinosa --help`, and `spinosa serve --port 0` startup smoke; focused tests (29 pass, 86 assertions), repository typecheck, frozen install, version gate, and `git diff --check` passed.
- How to test: run `bun run test:packed-install`. CI runs the same command in `.github/workflows/npm-package-gate.yml` without npm credentials.
