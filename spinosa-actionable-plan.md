# Spinosa — Whole-System Actionable Plan

> Derived from the Whole-System Audit. Organized by concern group, not phase.
> Each item lists files, line numbers, and concrete implementation steps.

---

## 1. DATA SAFETY & CORRECTNESS

Critical bugs that can lose data or produce untruthful outcomes.

### 1.1 Atomic ingestion overwrite

| | |
|---|---|
| **Files** | `packages/tui/src/spinosa-core/commands/add.ts:227-234` |
| | `packages/tui/src/spinosa-core/import/frontmatter.ts:86-92` |
| **Problem** | `removeConvertedOutput()` deletes existing output before the replacement conversion succeeds. Corrupt conversion can destroy valid searchable evidence. |
| **Fix** | Convert to staging file, validate, then atomically rename: |
| | `writeFileSync(tmpFile, text)` → `renameSync(tmpFile, destFile)` → `removeConvertedOutput(destFile)` |
| | Also applies to `processMarkitdown()` and `processOcr()` in `pipeline.ts`. |

### 1.2 Legacy-workspace edit preservation

| | |
|---|---|
| **File** | `packages/tui/src/spinosa-core/commands/update.ts:310-319` |
| **Problem** | `replace_if_unmodified` treats missing checksum as "unmodified". Legacy workspaces without stored checksums get silently overwritten. |
| **Fix** | Change logic: `if (storedHash === undefined) { skipped++; continue }` — missing provenance means "ownership unknown, preserve". |

### 1.3 Upgrade success boundary

| | |
|---|---|
| **File** | `packages/tui/src/spinosa-core/commands/upgrade.ts:251-261` |
| **Problem** | Post-install version verification and workspace discovery are in the success-critical path. Either can throw after a successful install, causing false failure reports. |
| **Fix** | Wrap post-install steps in separate try/catch. Installation success is final; workspace discovery is best-effort. |

### 1.4 Stale-lock recovery

| | |
|---|---|
| **File** | `packages/tui/src/spinosa-core/commands/update.ts:496-505` |
| **Problem** | Update lock is bare `mkdirSync` with no PID, timestamp, owner, timeout, or stale recovery. A crashed update permanently locks the workspace. |
| **Fix** | Extract `acquireRegistryFileLock` from `registry.ts:44-66` into a shared primitive. Use same pattern for update lock. |

### 1.5 Collision-safe output names

| | |
|---|---|
| **File** | `packages/tui/src/spinosa-core/extension/classifier.ts:180-186` |
| **Problem** | `ocrOutputRelPath` strips extension and appends `.md`. `scan.png` and `scan.jpg` both become `scan.md`, causing silent overwrites. |
| **Fix** | Include original extension in output: `${stem}__${ext}.md` (same pattern as `markitdownOutputRelPath`). |

### 1.6 Truthful import and recovery outcomes

| | |
|---|---|
| **Files** | `pipeline.ts:178-316`, `pipeline.ts:519-635`, `classifier.ts:122` |
| **Problems** | • `binary_copyable` classified but silently omitted from results<br>• Directory `--overwrite` doesn't apply to converted outputs<br>• Unconverted binary fallback counted as "recovered" (not searchable)<br>• Scanned PDFs with `/Font` header misclassified as text PDFs<br>• `safeCopyAsync` failures not surfaced |
| **Fix** | Add `binary_copyable` to `CopyResult`. Pass `overwrite` through to phase runners. Don't count source-copy fallback as recovery. Add heuristics for scanned-PDF detection in `pdf.ts`. Surface safe-copy failure reasons. |

---

## 2. TUI FLOW MODIFICATIONS

Changes to routing, navigation, lifecycle, and how the user moves through the application.

### 2.1 Investigation Home

|                |                                                                                                                                                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **New**        | `packages/tui/src/component/dialog-spinosa-home.tsx`                                                                                                                                                             |
| **What**       | Landing screen showing workspace health, recent findings, outstanding reviews, suggested next questions. Replaces the generic startup-hub.                                                                       |
| **Components** | • Corpus health (file count, freshness)<br>• Recent verified findings from `agent_reports/`<br>• Last investigation summary<br>• New/changed sources<br>• Outstanding review items<br>• Suggested next questions |
| **Actions**    | Quick Answer · Evidence Review · Deep Synthesis · Explore Connections                                                                                                                                            |

### 2.2 Recent workspace resume

| | |
|---|---|
| **Files** | `packages/tui/src/routes/spinosa/startup-hub.tsx` (or equivalent) |
| **Problem** | Every launch shows the workspace picker even when one obvious workspace exists. |
| **Fix** | If exactly one workspace with `lastAccessed < 7 days`, resume directly. Picker becomes a "switch/manage" action. |

### 2.3 Route timeline with cancel/resume

| | |
|---|---|
| **New** | Module + UI for active investigation tracking |
| **What** | Show current investigation stage, duration estimate, model cost, sources searched, partial vs. verified-final status. Allow pause/cancel/resume. |
| **Data** | Read from agent route journal (`.spinosa/route-journal.json`) |

### 2.4 Snoozable upgrades

| | |
|---|---|
| **File** | `packages/tui/src/spinosa-core/commands/upgrade.ts:180-190` |
| **Problem** | Declining upgrade causes another network request on next launch. |
| **Fix** | Offer: Upgrade now · Remind tomorrow · Remind next week · Skip this version. Store snoozed versions in version cache. |

### 2.5 Unified workspace browser

| | |
|---|---|
| **Files** | Two separate picker implementations exist |
| **What** | Consolidate into one component with search, filters, pinning, tags, missing-path detection, corpus size/freshness, last research activity, bulk migration/update, stale/incompatible state indicators. |

### 2.6 Onboarding simplification

| | |
|---|---|
| **Files** | Wizard pipeline (onboarding screen, add-files wizard) |
| **What** | Reduce from ~11 wizard stages to 3: (1) Choose sources, (2) Review import, (3) Start researching. Converters, OCR engines, provider details under "Advanced". |

---

## 3. UI COMPONENTS

Individual UI elements and rendering fixes.

### 3.1 Remove workspace-picker stderr logging

| | |
|---|---|
| **File** | `packages/tui/src/component/dialog-spinosa-workspace-picker.tsx:87-113` |
| **Problem** | `console.error(...)` logs workspace paths, names, versions, statuses to stderr. Leaks local info and corrupts terminal rendering. |
| **Fix** | Remove all `console.error` calls in the resource fetcher. Replace with opt-in file logging if diagnostics needed. |

### 3.2 Interactive verified report viewer

| | |
|---|---|
| **New** | Component for browsing verified reports interactively |
| **UX** | Claim → quoted evidence → original page/source → verifier decision. Render as expandable cards. |
| **Parse** | `agent_reports/*.md` frontmatter + verification state |

### 3.3 Trust Center dialog

|           |                                                                                                                                                                                                                                                           |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **New**   | `packages/tui/src/component/dialog-trust-center.tsx`                                                                                                                                                                                                      |
| **Shows** | • Current provider and destination<br>• What context may leave device<br>• Agent read/write scopes<br>• Network policy<br>• Persistent permissions and revoke controls<br>• Credential backend<br>• Update signature status<br>• Diagnostic-log retention |

### 3.4 Source-quality review queue UI

| | |
|---|---|
| **New** | Post-import dialog showing review items |
| **Data** | Generate `.spinosa/import-review.ndjson` with per-file entries |
| **Categories** | Low OCR confidence · Blank pages · Noisy extraction · Unsupported files · Destination collisions · Suspected duplicates · Failed sources |

### 3.5 Accessibility pass

|                  |                                                                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Existing**     | Various components                                                                                                                                                  |
| **Requirements** | Every action needs: keyboard focus + shortcut, icon + textual status, responsive compact rendering, high-contrast/reduced-decoration mode, visible shortcut legend. |
| **Watch for**    | Dense fixed-width tables, Unicode charts, color-only status indicators, mouse-only controls.                                                                        |

---

## 4. UX & PERSONA

Changes to the user-facing model, information architecture, and persona support.

### 4.1 Operating profiles for privacy-sensitive users

|              |                                                                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **New**      | Profile selector during onboarding / Trust Center                                                                                                                   |
| **Profiles** | • Local conversion + local model<br>• Remote model with context egress (visible warning)<br>• External web retrieval enabled/disabled<br>• Sharing enabled/disabled |

### 4.2 Workspace Health / Action Center

|           |                                                                                      |
| --------- | ------------------------------------------------------------------------------------ |
| **New**   | Panel in Investigation Home                                                          |
| **Shows** | Source quality, framework update status, missing files, trust status, provider info. |

### 4.3 Large-workspace operator features

| | |
|---|---|
| **Existing** | Picker component |
| **Add** | Search/filters, pinning/tags, missing-path detection, corpus size/freshness, last research activity (not just filesystem access), bulk migrate/update, stale/incompatible states. |

### 4.4 Cumulative investigation model

| | |
|---|---|
| **New** | Multiple features across Phase 2 |
| **Features** | • Save/rerun questions when sources change<br>• Create sub-corpora / source collections<br>• Bookmark/exclude evidence<br>• Compare report versions<br>• Detect contradictions and corpus silence<br>• Export report + evidence + verification record<br>• Build reproducibility manifests<br>• Review unresolved entities and dictionary aliases |

---

## 5. INGESTION & PIPELINE

Changes to how files enter the system.

### 5.1 Source manifest

| | |
|---|---|
| **New** | `packages/tui/src/spinosa-core/import/manifest.ts` |
| **Persist** | `.spinosa/source-manifest.json` tracking per source: |
| **Fields** | Stable source ID, original path + aliases, size/mtime/SHA-256, converter + version, output paths + content hashes, page count, OCR quality, imported/last-checked timestamps, status, error code. |
| **Benefits** | Correct new/changed/moved/deleted detection, incremental re-import, exact/near-duplicate detection, reproducible reports. |

### 5.2 Import review queue generation

| | |
|---|---|
| **New** | Post-import analysis step |
| **Checks** | Low OCR confidence, blank/low-text pages, noisy extraction, unsupported files, destination collisions, suspected duplicates, failed or partially searchable sources. |

### 5.3 Pipeline deduplication

| | |
|---|---|
| **Files** | `pipeline.ts` (~701 lines) vs. `add.ts` (~320 lines) vs. onboard |
| **Problem** | Three parallel implementations of the scan→classify→copy/convert flow. |
| **Fix** | `add.ts` should call `pipeline.ts` functions. `onboard` should call `pipeline.ts`. Delete inlined duplication. Estimated ~800 lines removed. |

---

## 6. ARCHITECTURE & SHARED PRIMITIVES

Cross-cutting refactoring that supports multiple fixes.

### 6.1 Shared lock primitive

| | |
|---|---|
| **Source** | Extract from `registry.ts:44-66` |
| **Target** | Shared util module (`utils/lock.ts`) |
| **Include** | PID, timestamp, mtime-based stale detection, configurable timeout, clean release. |
| **Consumers** | `update.ts` (update lock), `registry.ts` (registry lock), any future lock. |

### 6.2 Shared command result envelope

| | |
|---|---|
| **New** | `packages/tui/src/spinosa-core/commands/result.ts` |
| **Shape** | `{ success, command, stage, data, error?: { code, message, retryable }, warnings? }` |
| **Migrate** | `add.ts`, `update.ts`, `upgrade.ts`, `doctor.ts` to use the envelope. |

### 6.3 Structured error types

| | |
|---|---|
| **New** | Error classes or tagged unions for known failure modes |
| **Categories** | IngestionError, LockError, UpgradeError, ConfigError, NetworkError. Each with code, retryable flag, user-safe message. |

### 6.4 `bun run verify` script

| | |
|---|---|
| **File** | `package.json` (root) |
| **Script** | `"verify": "bun run typecheck && bun run test && shellcheck workspace-template/.bin/spinosa install.sh && bash -n workspace-template/.bin/spinosa"` |
| **Gate** | Required before any release. |

---

## 7. SECURITY & PRIVACY

Trust boundaries, credential handling, and data egress visibility.

### 7.1 Privacy language update

| | |
|---|---|
| **Files** | `README.md`, `SECURITY.md`, config comments |
| **Current** | "No cloud, no uploads" — too broad, misleads users about remote providers. |
| **Replace** | "Files and conversion remain local. When using a remote model, prompts and selected source context are sent to that provider." |

### 7.2 Agent permission parity tests

| | |
|---|---|
| **Files** | `workspace-template/.agents/agents/*.md` vs. `.opencode/agents/*.md` vs. `.claude/agents/*.md` vs. `.codex/agents/*.toml` |
| **Problem** | Canonical agents describe scoped writes; OpenCode mirror broadly allows `edit: allow`. |
| **Fix** | Add automated tests comparing permission scopes. Canonical is authoritative; mirrors must not grant broader permissions. |

### 7.3 Credential hardening

| | |
|---|---|
| **File** | `packages/core/src/credential/sql.ts` |
| **Problem** | Credentials stored as plaintext JSON in SQLite. |
| **Minimum** | Enforce restrictive directory/database permissions (`chmod 0700` on metadata dir). |
| **Target** | Use macOS Keychain (or `safeStorage` in Electron) with opaque database references. |

### 7.4 Shell access isolation awareness

| | |
|---|---|
| **File** | `packages/core/src/tool/bash.ts:66-91` |
| **Problem** | External-path detection is advisory only, bypassable through traversal, variables, substitution, redirection. |
| **Document** | Current behavior is UX helper, not a security boundary. |
| **Future** | Strong isolation requires sandboxed child execution with explicit mounts and network policy. |

### 7.5 Agent protocol: evolution as proposal-only

| | |
|---|---|
| **Files** | Orchestrator framework (AGENTS.md protocol) |
| **Current** | Evaluator → Evolver changes framework behavior without mandatory user approval. |
| **Fix** | Evolution flow: (1) Show rationale, (2) Show diff, (3) Validate mirrors, (4) Request approval (question tool), (5) Snapshot, (6) Apply, (7) Test, (8) Offer rollback. |

---

## 8. AGENT PROTOCOL & ORCHESTRATION

Changes to how agents communicate and verify.

### 8.1 Explicit verification modes

| | |
|---|---|
| **Files** | Workflow classification references, goal artifact template |
| **Problem** | Verifier is required for every substantive route, but can't handle maintenance/process/framework claims. |
| **Fix** | Introduce modes: `corpus` (claims in `raw/`), `workspace` (config/setup), `process` (orchestration/agents). Goal artifact declares mode and permitted source roots. |

### 8.2 Route journal for deterministic recovery

| | |
|---|---|
| **New** | `.spinosa/route-journal.json` |
| **Tracks** | Current phase, stage attempts, inputs + artifact hashes, output status, agent/model used, cancellation state, retryability, final verification status. |
| **Benefits** | Recovery is deterministic (not inferred from missing artifacts). Evaluator can audit accurately. |

### 8.3 Pointer-only report delivery

| | |
|---|---|
| **Files** | Orchestrator contract, verifier close step |
| **Problem** | Protocol returns only a report path pointer. Users receive no executive summary inline. |
| **Fix** | Return short verified executive answer + canonical report link. |

---

## 9. CLI & RELEASE ENGINEERING

Command-line interface, installation, and release infrastructure.

### 9.1 Active version pointer

| | |
|---|---|
| **File** | `workspace-template/.bin/spinosa:26-34` |
| **Problem** | Launcher scans version directories with shell `sort -V`. Heuristic, not authoritative. |
| **Fix** | Use atomic `active_version` pointer file, set only after installation verification. |

### 9.2 Uniform JSON output

| | |
|---|---|
| **Files** | All CLI commands |
| **Problem** | `upgrade --json` may emit progress to stderr without structured stdout result. |
| **Fix** | Every command needs the shared result envelope, even in JSON mode. No stderr progress when `--json`. |

### 9.3 Transactional release publication

| | |
|---|---|
| **Files** | `.github/workflows/` (currently empty), `RELEASE_GUIDE.md` |
| **Problem** | Release script can push tags before later GitHub operations succeed. No automated CI. |
| **Fix** | Create `ci.yml` (lint + test + typecheck on push/PR) and `release.yml` (clean-room install → N→N+1 upgrade → workspace migration → rollback → beta canary → rolling tag). |

### 9.4 Fail-open upgrade check

| | |
|---|---|
| **File** | `packages/tui/src/spinosa-core/commands/upgrade.ts:284-346` |
| **Problem** | Network failure on upgrade check can delay launch. |
| **Fix** | Wrap network portion in a 5-second timeout. Network errors are non-blocking. |

---

## 10. RELATED FILE INDEX

| File | Purpose | Key Lines |
|------|---------|-----------|
| `packages/tui/src/spinosa-core/commands/add.ts` | Single-file and directory import | 227, 255, 260 |
| `packages/tui/src/spinosa-core/commands/update.ts` | Workspace framework sync | 310, 496 |
| `packages/tui/src/spinosa-core/commands/upgrade.ts` | Version download + install | 251, 263, 284 |
| `packages/tui/src/spinosa-core/import/frontmatter.ts` | YAML frontmatter + output management | 86 |
| `packages/tui/src/spinosa-core/import/pipeline.ts` | Full directory import pipeline | 178, 519, 588 |
| `packages/tui/src/spinosa-core/extension/classifier.ts` | File classification by extension | 122, 180 |
| `packages/tui/src/spinosa-core/extension/pdf.ts` | PDF text-vs-scanned detection | 48 |
| `packages/tui/src/spinosa-core/scan/scanner.ts` | Source directory scanning | 74 |
| `packages/tui/src/spinosa-core/workspace/registry.ts` | Workspace registry + lock primitive | 50 |
| `packages/tui/src/component/dialog-spinosa-workspace-picker.tsx` | Workspace selection dialog | 87 |
| `packages/core/src/tool/bash.ts` | Shell execution with advisory path detection | 66 |
| `packages/core/src/credential/sql.ts` | Credential table schema (plaintext JSON) | 5 |
| `workspace-template/.agents/agents/spinosa-searcher.md` | Canonical searcher permissions | 10 |
| `workspace-template/.opencode/agents/spinosa-searcher.md` | OpenCode searcher permissions | 5 |
| `workspace-template/.bin/spinosa` | Bootstrap shell launcher | 26 |
| `.github/workflows/` | CI/CD (currently empty) | — |

---

## Task count summary by group

| Group | Tasks | Priority |
|-------|-------|----------|
| 1. Data Safety | 6 (1.1–1.6) | P0–P1 |
| 2. TUI Flow | 6 (2.1–2.6) | P1–P2 |
| 3. UI Components | 5 (3.1–3.5) | P1–P2 |
| 4. UX & Personas | 4 (4.1–4.4) | P1–P2 |
| 5. Ingestion | 3 (5.1–5.3) | P1–P2 |
| 6. Architecture | 4 (6.1–6.4) | P1 |
| 7. Security/Privacy | 5 (7.1–7.5) | P1 |
| 8. Agent Protocol | 3 (8.1–8.3) | P2 |
| 9. CLI/Release | 4 (9.1–9.4) | P1 |
| **Total** | **40** | |

---

*Generated from the Whole-System Audit. No files in the repository were changed by this document.*
