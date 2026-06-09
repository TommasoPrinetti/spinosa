# CLI Text Audit — Group Decision

**Date:** 2026-06-09
**Files audited:** `.bin/pilosa` (4461 lines), `install.sh` (875 lines), `README.md` (271 lines)
**Total strings:** ~310 user-facing
**Process:** 5-persona task force (Text Surveyor, Jargon Hunter, Tone Architect, User Advocate, Plain Language Editor) — position papers followed by deliberation

---

## UNANIMOUS DECISIONS (locked, no further debate)

These 5 replacements have consensus from ALL 5 personas:

| Current term | Replace with | Rationale |
|---|---|---|
| **shim** | **wrapper** | "Created shim" → "Created wrapper". Shim is developer-only vocabulary. |
| **handoff** | **launch** or **setup** | "Handoff targets" → "Available tools". "Handoff action" → "Launch method". "Startup handoff" → "Startup prompt". |
| **sidecars** | **backup copies** | "Sidecars written: N" → "Backup copies written: N". Sidecar is Kubernetes/aviation jargon. |
| **preflight** | **check** | "Environment preflight" → "Environment check". Aviation metaphor, not helpful. |
| "Sync agent and skill mirrors from canonical" | **"Sync helpers from original sources"** | Single worst string. 3 jargon terms in 7 words voted worst by all 5 personas. |

---

## PRIORITY MATRIX

### Tier 1 — Active user confusion (fix immediately)

| # | String | Location | Fix |
|---|--------|----------|-----|
| 1 | "hSync agent and skill mirrors from canonical" | help text L2700 | "Sync helpers from original sources" |
| 2 | "handoff targets" + "handoff action" + "startup handoff" | L1575, L2145, L2586 | "Available tools" / "Launch method" / "Startup prompt" |
| 3 | "LLM CLI" / "LLM CLIs" (20+ locations) | help, prompts, menus, README | "AI tool" — consensus, not "AI assistant" (User Advocate conceded) |
| 4 | "smoke test" | install.sh L806-810 | "basic test" — "Running basic test..." |
| 5 | "shim" | install.sh L792-798 | "wrapper" — "Created wrapper: /path" |
| 6 | "--gum" / "Gum" in help text | install.sh L125, pilosa L67-68 | Annotate first use: "Gum (interactive display tool)" |
| 7 | "sidecars" | update output L3329 | "backup copies" — "Backup copies written: N" |
| 8 | "preflight" | L1543 | "environment check" — "Running environment check" |

### Tier 2 — Friction (slows understanding)

| # | String | Location | Fix |
|---|--------|----------|-----|
| 9 | "onboarding"/"onboard" (10+ locations) | help, menus, prompts | "setup"/"prepare" — "pilosa prepare [dir]" |
| 10 | "agent" / "sub-agents" (user-facing) | README L18, help text, sync output | "helper" / "specialists" (Text Surveyor preferred "specialist"; merged) |
| 11 | "orchestrator" | README L18 | "router" — "Routes questions to specialist helpers" |
| 12 | "canonical" / "canonical sources" | help text, README | "original sources" or "primary sources" |
| 13 | "mirrors" / "vendor mirrors" / "agent mirrors" | help text, info, sync output | "platform copies" — Uniform term |
| 14 | "corpus folder" vs "source folder" | L2839 vs L2502 | Pick ONE: "source folder" wins. Replace all "corpus" in user text. |
| 15 | "workspace integrity" | help text L17, L2698 | "workspace structure" or "workspace setup" |

### Tier 3 — Polish (worthwhile, not blocking)

| # | String | Location | Fix |
|---|--------|----------|-----|
| 16 | "retired files" | update output L3126-3144 | "old files" — "Old files removed: N" |
| 17 | "pinned stable version" | install.sh L34, README L28 | "specific version" — "Version 0.5.0 (stable)" |
| 18 | "vendor bundle" | install.sh L780 | "bundled tools" |
| 19 | "MarkItDown" + "RapidOCR" (40+ messages) | progress, info, warnings | Add parenthetical on first use per interaction: "MarkItDown (document converter)" |
| 20 | "structural overview map" | L3459 | "overview map" |
| 21 | "group map subdirectories" | L3470 | "map folders" |
| 22 | "native-readable file" | L1522 (internal label) | "Markdown file" in user-facing output |
| 23 | "manifest" | L3041, L2960 | "file list" in user-facing messages |

---

## PUNCTUATION & TONE RULES (Tone Architect guide, uncontested)

| Message type | Rule | Example |
|---|---|---|
| `ok()` | NEVER end with period | "Source scan complete" ✓ (was mixed) |
| `info()` | NEVER end with period | "Downloading installer..." ✓ |
| `warn()` | ALWAYS end with period | "MarkItDown is not available." ✓ (was em-dash) |
| `note()` | ALWAYS end with period | "MarkItDown handles Office docs." ✓ |
| `die()` | ALWAYS end with period | "Framework not found." ✓ |
| `header()` | NEVER end with period | "Pilosa — New Workspace" ✓ |
| Spinner | NEVER end with period | "Scanning files" ✓ |

**Person rule:** Third-person in status messages. Second-person imperative in prompts only.

**Specific punctuation fixes flagged by Tone Architect (18 items):**

| File | Line | Current | Fix |
|---|---|---|---|
| `.bin/pilosa` | 3492 | `ok "Check passed."` | `ok "Check passed"` |
| `.bin/pilosa` | 2680 | `ok "Pilosa uninstalled."` | `ok "Pilosa uninstalled"` |
| `.bin/pilosa` | 3324 | `ok "Update complete."` | `ok "Update complete"` |
| `.bin/pilosa` | 1470 | "scanning" (lowercase spinner) | "Scanning" |
| `.bin/pilosa` | 4276 | "Could not download release installer." | Third-person: "Release installer download failed." |
| `install.sh` | 58 | `warn()` no `>&2` | Add `>&2` (match .bin/pilosa) |
| `install.sh` | 565 | `die "No Pilosa installation found"` | `die "No Pilosa installation found."` |
| `install.sh` | 570 | `die "Could not find installed framework"` | `die "Could not find installed framework."` |

---

## FIXES ORDERED BY FILE AND LINE

### `.bin/pilosa`

| Line(s) | Current | Replace with |
|---------|---------|-------------|
| 11-20 | `onboard` / `onboarding` | `prepare` / `setup` |
| 17 | `Validate workspace integrity and configuration` | `Check workspace structure and settings` |
| 19 | `Sync agent and skill mirrors from canonical` | `Sync helpers from original sources` |
| 1495 | `Environment preflight` | `Environment check` |
| 1575 | `Detected handoff targets: <list>` | `Available tools: <list>` |
| 2145-2155 | `Handoff action` | `Launch method` / `How to launch` |
| 2586 | `startup handoff` | `startup prompt` |
| 2601 | `Copy this prompt and paste it in your tool` | `Copy this prompt and paste it in your AI tool` (or keep — clear enough) |
| 2646 | pilosa uninstall help | Keep OK |
| 2698 | `Validate workspace integrity` | `Check workspace structure` |
| 2700 | `Sync agent and skill mirrors from canonical` | `Sync helpers from original sources` |
| 2839 | `Corpus folder` | `Source folder` |
| 2843 | `Corpus folder` (prompt) | `Source folder` |
| 3328-3330 | `Retired files removed` / `Sidecars written` | `Old files removed` / `Backup copies written` |
| 3492 | `Check passed.` | `Check passed` |
| 3512 | `pilosa sync` help text | Update for "Sync helpers from original sources" |
| 4056-4059 | `pilosa health` help | Keep, already clean |

### `install.sh`

| Line(s) | Current | Replace with |
|---------|---------|-------------|
| 125 | `--no-gum` | `--no-gum (Skip bundled display tool)` — expand help description |
| 792-798 | `Created shim: <path>` | `Created wrapper: <path>` |
| 806-810 | `Running smoke test...` / `Smoke test passed` | `Running basic test...` / `Basic test passed` |

### `README.md`

| Line(s) | Current | Replace with |
|---------|---------|-------------|
| 18-19 | `orchestrator (AGENTS.md) that routes questions to specialist sub-agents` | `router (AGENTS.md) that routes questions to specialist helpers` |
| 79 | `routes them through sub-agents` | `routes them through helpers` |
| 154 | `Regenerate vendor-specific agent mirrors and sync skills from canonical sources.` | `Sync helpers from original sources.` |

---

## BUG FIX (prod)

| File | Issue | Fix |
|---|---|---|
| `install.sh:58` | `warn()` outputs to stdout (no `>&2`) | Add `>&2` to match `.bin/pilosa` convention |
| `.bin/pilosa` L1470 | `scanning` lowercase in spinner | Capitalise to `Scanning` |

---

## VERIFICATION

**Consensus verification:**
- All 5 personas verified their quotes and positions accurately — YES
- Deliberation shifts correctly reflected — YES
- Confidence level: HIGH (unanimous on 5 core terms, majority on all others)
- Minority opinions represented: User Advocate's "AI assistant" noted but not adopted; Text Surveyor's "specialist" noted for agent merged to "helper"; Tone Architect's punctuation guide adopted as team standard
- Action items: 23 term replacements, 18 punctuation fixes, 1 bug fix (stdout/stderr), 2 consistency fixes

**Blocker:** The `pilosa-verifier` should verify every changed string against the actual source file before applying to ensure line numbers haven't shifted.

---

*Report generated by group synthesis from 5-persona task force. Source: agent_reports/cli-text-audit.md*
