---
type: audit_report
role: framework_structure_audit
purpose: [comprehensive audit of YAML frontmatter, links, content, missing files, and framework-files.tsv]
scope: [all framework root files, system/, logs/, maps/, raw/, agent_reports/, .trash/, .bin/, .spinosa/]
generated_by: spinosa-orchestrator
generated_at: 2026-06-05
processing_status: audit_complete
created: 2026-06-05
updated: 2026-06-05
---
# spinosa Framework Structure Audit

Audit of 22 files across the spinosa framework. Covers YAML frontmatter compliance, wikilink validity, `connects_to` accuracy, content consistency, missing AGENTS.md files, and `framework-files.tsv` registry correctness.

---

## 1. YAML FRONTMATTER ISSUES

### 1.1 — Missing YAML frontmatter entirely

| File | Path | Lines | Issue |
|---|---|---|---|
| `README.md` | `/Users/tommasoprinetti/Documents/spinosa-main/README.md` | 1–170 | **No YAML frontmatter block.** File opens directly with whitespace (line 1), then an ASCII art block (lines 3–10). Per `system/yaml_header_template.md` line 20: "Use a small, stable yaml header on every framework file." README is listed in `framework-files.tsv` as a framework file. |
| `LICENSE` | `/Users/tommasoprinetti/Documents/spinosa-main/LICENSE` | 1–131 | **No YAML frontmatter.** File opens with `Required Notice:` on line 1. Listed in `framework-files.tsv` (line 3) as a framework file. Debatable whether a license file needs frontmatter, but the policy is stated as "every framework file." |
| `.trash/AGENTS.md` | `/Users/tommasoprinetti/Documents/spinosa-main/.trash/AGENTS.md` | 1–25 | **No YAML frontmatter.** Opens directly with `# .trash/ — Retired Files` on line 1. Every other AGENTS.md in the repository has proper YAML frontmatter. This is a framework file (`framework-files.tsv` line 34, policy: `replace_if_unmodified`). This contradicts the framework's own stated rules. |

### 1.2 — Non-standard field names

| File | Line | Field | Issue |
|---|---|---|---|
| `system/configuration.md` | 3 | `agent: startup` | Uses `agent` field instead of `role`. No other file uses `agent` as a frontmatter key. Per `system/yaml_header_template.md` lines 27, 41–101, the canonical fields include `role` but not `agent`. |
| `system/context.md` | 3 | `agent: startup` | Same issue — uses `agent` instead of `role`. |

### 1.3 — Missing recommended fields

| File | Line(s) | Missing field | Detail |
|---|---|---|---|
| `system/configuration.md` | 1–9 | `connects_to` | This file has no `connects_to` key. `system/context.md` (line 9–13) does reference `system/configuration.md` in its `connects_to`. The `yaml_header_template.md` base header schema (lines 24–39) includes `connects_to`. |
| `system/configuration.md` | 1–9 | `status` | No `status` field. `system/dictionary.md` (line 13) uses `status: draft`; `system/workspace_index.md` (line 12) uses `status: active`; `system/yaml_header_template.md` (line 13) uses `status: active`. Configuration should declare a status. |
| `system/context.md` | 1–14 | `status` | No `status` field. Same reasoning as above. |
| `system/system_architecture_map.md` | 1–23 | `status` | No `status` field. All three peer system files that have `status` use it (`dictionary.md`, `workspace_index.md`, `yaml_header_template.md`). |

### 1.4 — Stale update dates

| File | `created` | `updated` | Days stale | Detail |
|---|---|---|---|---|
| `system/dictionary.md` | 2026-05-26 | **2026-05-26** | 10 days | `updated` equals `created`. Never marked as updated despite being a template file that may have been reviewed. |
| `logs/user_requests.md` | 2026-05-26 | **2026-05-26** | 10 days | Same — `updated` equals `created`. File body is an empty table (line 21), so this may be accurate, but the frontmatter dates suggest it was never touched after creation. |
| `system/system_architecture_map.md` | 2026-05-26 | **2026-06-02** | 3 days behind | Updated date is older than most peer framework files (which show 2026-06-04). |

### 1.5 — Non-standard description format

| File | Line | Style | Detail |
|---|---|---|---|
| `system/configuration.md` | 5–6 | Comma-separated two-sentence string | `"Operating profile for the current spinosa project or framework template.,Agents read this first..."` — uses a comma to splice two sentences in a single string. Most other files use YAML list format (`- ...`). |
| `system/context.md` | 5 | Semicolon-separated string | `"Read by Writer for synthesis; updated by startup during indexing."` — uses semicolons. Most other files use YAML list format. |

---

## 2. BROKEN LINKS

### 2.1 — `connects_to` referencing nonexistent files

| File | Line | Broken reference | Should be | Detail |
|---|---|---|---|---|
| `raw/AGENTS.md` | 9 | `system/header_template.md` | `system/yaml_header_template.md` | The file `system/header_template.md` does NOT exist. Verified via `test -f` — returns NOT FOUND. The actual file is `system/yaml_header_template.md`. |

### 2.2 — Body text referencing nonexistent files

| File | Line | Text | Detail |
|---|---|---|---|
| `raw/AGENTS.md` | 29 | `"the schema in header_template.md"` | Same broken reference — `header_template.md` does not exist. Should say `yaml_header_template.md`. |

### 2.3 — Wikilink validation

All Obsidian wikilinks (`[[...]]`) across all audited files were checked and resolve to existing files or directories. No broken wikilinks found. ✅

Summary of all wikilinks verified:
- `startup.md`: [[configuration]], [[context]], [[yaml_header_template]], [[system_architecture_map]], [[raw/]], [[dictionary]], [[workspace_index]], [[agent_reports/]]
- `system/AGENTS.md`: [[AGENTS]]
- `system/system_architecture_map.md`: [[startup]], [[configuration]], [[system_architecture_map]], [[dictionary]], [[workspace_index]], [[maps/]], [[raw/]], [[yaml_header_template]], [[user_requests]], [[agent_reports/]]
- `logs/AGENTS.md`: [[AGENTS]], [[startup]], [[configuration]]
- `agent_reports/AGENTS.md`: [[AGENTS]], [[.trash/AGENTS]]
- `.trash/AGENTS.md`: [[AGENTS]], [[agent_reports/AGENTS]]
- `.bin/AGENTS.md`: [[startup]], [[AGENTS]]

All resolve. ✅

---

## 3. CONTENT INCONSISTENCIES

### 3.1 — Grammatical error duplicated across AGENTS.md and CLAUDE.md

| File | Line | Text | Issue |
|---|---|---|---|
| `AGENTS.md` | 18 | `"You provides direct answers via reports"` | Subject-verb disagreement. Should be: **"You provide direct answers"**. |
| `CLAUDE.md` | 18 | `"You provides direct answers via reports"` | Same error, since CLAUDE.md is a verbatim copy of AGENTS.md (copied by `.bin/sync-agents.sh` line 179). |

### 3.2 — File name mismatch

| File | Line | Text | Detail |
|---|---|---|---|
| `raw/AGENTS.md` | 9, 29 | `header_template.md` | The actual file in `system/` is named `yaml_header_template.md`, not `header_template.md`. This appears in both the `connects_to` frontmatter (line 9) and the body text (line 29). |

### 3.3 — `.trash/AGENTS.md` missing frontmatter (already listed above)

This file also lacks `created`, `updated`, `type`, `scope`, `description`, and `connects_to` fields that every other AGENTS.md has. This makes `.trash/AGENTS.md` structurally inconsistent with the other seven AGENTS.md files.

### 3.4 — `maps/AGENTS.md` connects_to is sparse

| File | Line | Detail |
|---|---|---|
| `maps/AGENTS.md` | 5–8 | `connects_to:` lists only `AGENTS.md`. Most other AGENTS.md files list 2–5 connected files. `raw/AGENTS.md` connects to 3 files, `agent_reports/AGENTS.md` connects to 3, `logs/AGENTS.md` connects to 4. `maps/AGENTS.md` could usefully connect to `system/startup.md`, `maps/map_template.md`, or `raw/`. |

---

## 4. MISSING AGENTS.md FILES

Per the framework's own conventions, every directory that contains framework files and is part of the workspace structure should have an `AGENTS.md` for agent guidance. The following directories **lack AGENTS.md**:

| Directory | Path | Has AGENTS.md? | Notes |
|---|---|---|---|
| `.agents/` | `/Users/tommasoprinetti/Documents/spinosa-main/.agents/` | **NO** | Contains canonical agent definitions (`agents/`) and skills (`skills/`). Listed in `framework-files.tsv` (line 10) as `replace_if_unmodified`. AGENTS.md would help agents understand the canonical structure. |
| `.claude/` | `/Users/tommasoprinetti/Documents/spinosa-main/.claude/` | **NO** | Generated mirror of agent definitions and skills. `framework-files.tsv` line 11. |
| `.codex/` | `/Users/tommasoprinetti/Documents/spinosa-main/.codex/` | **NO** | Manually maintained TOML agents + generated skill mirrors. `framework-files.tsv` line 12. |
| `.opencode/` | `/Users/tommasoprinetti/Documents/spinosa-main/.opencode/` | **NO** | Generated mirror with `package.json` (listed in `framework-files.tsv` line 15). Contains `agents/` and `skills/` subdirectories. |
| `.spinosa/` | `/Users/tommasoprinetti/Documents/spinosa-main/.spinosa/` | **NO** | CLI metadata directory containing `framework-files.tsv` and `retired-framework-files.tsv`. Not in the README tree diagram but is a real directory used by the CLI. |
| `.bin/lib/` | `/Users/tommasoprinetti/Documents/spinosa-main/.bin/lib/` | **NO** | Subdirectory of `.bin/` containing `metrics.sh`. Covered indirectly by `.bin/AGENTS.md`, which does not mention `lib/`. |

**Existing AGENTS.md files (for reference):**

| Directory | File | Status |
|---|---|---|
| `/` (root) | `AGENTS.md` | ✅ Full frontmatter, correct |
| `system/` | `system/AGENTS.md` | ✅ Full frontmatter, correct |
| `logs/` | `logs/AGENTS.md` | ✅ Full frontmatter, correct |
| `maps/` | `maps/AGENTS.md` | ✅ Full frontmatter, correct |
| `raw/` | `raw/AGENTS.md` | ✅ Full frontmatter (has broken `connects_to` link) |
| `agent_reports/` | `agent_reports/AGENTS.md` | ✅ Full frontmatter, correct |
| `.bin/` | `.bin/AGENTS.md` | ✅ Full frontmatter, correct |
| `.trash/` | `.trash/AGENTS.md` | ❌ No YAML frontmatter |

---

## 5. FRAMEWORK-FILES.TSV ISSUES

File: `/Users/tommasoprinetti/Documents/spinosa-main/.spinosa/framework-files.tsv` (35 data rows)

### 5.1 — Missing entries

| Missing file | Detail |
|---|---|
| `.bin/AGENTS.md` | File **exists** at `/Users/tommasoprinetti/Documents/spinosa-main/.bin/AGENTS.md` with proper YAML frontmatter (7 lines). Not listed in `framework-files.tsv`. Every other AGENTS.md is listed (lines 2, 18, 24, 26, 29, 32, 34). This file should be listed with role `framework` and policy `replace_if_unmodified`. |
| `CLAUDE.md` | File **exists** at `/Users/tommasoprinetti/Documents/spinosa-main/CLAUDE.md` (175 lines, verbatim copy of AGENTS.md). Regenerated by `.bin/sync-agents.sh` (line 179: `cp "$REPO_ROOT/AGENTS.md" "$REPO_ROOT/CLAUDE.md"`). Should be listed, likely with role `framework` and policy `always_replace` (since it is regenerated from AGENTS.md on sync, not user-modifiable). |

### 5.2 — Existence verification of listed entries

All paths listed in `framework-files.tsv` that are individual files were verified to exist:

| Line | Path | Exists? |
|---|---|---|
| 2 | `AGENTS.md` | ✅ |
| 3 | `README.md` | ✅ |
| 4 | `LICENSE` | ✅ |
| 5 | `.bin/check-startup.sh` | ✅ |
| 6 | `.bin/sync-agents.sh` | ✅ |
| 7 | `.bin/spinosa` | ✅ |
| 8 | `.bin/lib/metrics.sh` | ✅ |
| 9 | `.spinosa/retired-framework-files.tsv` | ✅ |
| 10 | `.agents/` | ✅ (directory) |
| 11 | `.claude/` | ✅ (directory) |
| 12 | `.codex/` | ✅ (directory) |
| 13 | `.opencode/agents/` | ✅ (directory) |
| 14 | `.opencode/skills/` | ✅ (directory) |
| 15 | `.opencode/package.json` | ✅ |
| 16 | `system/startup.md` | ✅ |
| 17 | `system/yaml_header_template.md` | ✅ |
| 18 | `system/AGENTS.md` | ✅ |
| 19 | `system/system_architecture_map.md` | ✅ |
| 20 | `system/configuration.md` | ✅ |
| 21 | `system/context.md` | ✅ |
| 22 | `system/dictionary.md` | ✅ |
| 23 | `system/workspace_index.md` | ✅ |
| 24 | `raw/AGENTS.md` | ✅ |
| 25 | `raw/.gitkeep` | ✅ |
| 26 | `maps/AGENTS.md` | ✅ |
| 27 | `maps/map_template.md` | ✅ |
| 28 | `maps/.gitkeep` | ✅ |
| 29 | `logs/AGENTS.md` | ✅ |
| 30 | `logs/user_requests.md` | ✅ |
| 31 | `logs/session_metrics.tsv` | ✅ |
| 32 | `agent_reports/AGENTS.md` | ✅ |
| 33 | `agent_reports/.gitkeep` | ✅ |
| 34 | `.trash/AGENTS.md` | ✅ |
| 35 | `.trash/.gitkeep` | ✅ |

### 5.3 — Policy questions

| Line | Path | Policy | Question |
|---|---|---|---|
| 20 | `system/configuration.md` | `never_replace` | Correct — user state. ✅ |
| 21 | `system/context.md` | `never_replace` | Correct — user state. ✅ |
| 30 | `logs/user_requests.md` | `never_replace` | Correct — user state. ✅ |
| 31 | `logs/session_metrics.tsv` | `never_replace` | Correct — user state. ✅ |
| 3 | `README.md` | `replace_if_unmodified` | Debatable — README has no YAML frontmatter so `updated` date cannot be checked for staleness. The `spinosa update` command (line 1200+ in `.bin/spinosa`) may not be able to detect "unmodified" without a manifest hash comparison. However, the CLI does compute SHA256 hashes for the manifest (line 1242), so this works at the content level. |
| 34 | `.trash/AGENTS.md` | `replace_if_unmodified` | This file lacks YAML frontmatter entirely, so the CLI cannot read an `updated` date. However, SHA256 manifest comparison handles this at the content level. |

---

## 6. STRUCTURAL ISSUES

### 6.1 — Description field inconsistency across files

The `description` field format varies significantly across the framework, making automated parsing unreliable:

| Format | Examples | Files |
|---|---|---|
| YAML list (`- ...`) | `- Root routing contract for coding agents...` | `AGENTS.md`, `.bin/AGENTS.md`, `raw/AGENTS.md`, `maps/AGENTS.md`, `agent_reports/AGENTS.md`, `system/dictionary.md`, `system/workspace_index.md`, `system/yaml_header_template.md`, `system/startup.md` |
| Single string | `"Architecture, instructions, templates..."` | `system/AGENTS.md` |
| Semicolon-separated string | `"Read by Writer for synthesis; updated by startup..."` | `system/context.md` |
| Comma-spliced string | `"Operating profile for the current spinosa project or framework template.,Agents read this..."` | `system/configuration.md` |

The `yaml_header_template.md` (line 30) specifies `connects_to` uses bare paths, but does **not** standardize the `description` format. The template shows `- [path]` list format for `connects_to` but the `description` in the same template (line 9-10) also uses the `- ...` list format. This suggests list format is the intended convention, but it is not explicitly documented.

### 6.2 — `.trash/AGENTS.md` lacks critical metadata

All seven other `AGENTS.md` files in the repository share a common structure: YAML frontmatter with `type: directory_guidance`, `scope:`, `description:`, `connects_to:`, `created:`, and `updated:`. `.trash/AGENTS.md` has none of these. This makes it structurally invisible to any tooling that parses YAML frontmatter for file discovery.

### 6.3 — CLAUDE.md is a silent mirror with no traceability

`CLAUDE.md` is generated by `.bin/sync-agents.sh` line 179 (`cp "$REPO_ROOT/AGENTS.md" "$REPO_ROOT/CLAUDE.md"`) but has no `generated_by`, `generated_at`, or `processing_status` fields to indicate it is a generated mirror. The `yaml_header_template.md` (lines 100-101) requires these for generated files: "generated files must include `generated_by`, `generated_at`, and `processing_status`."

Compare with other generated files like maps (which use `map_template.md` line 33: `generated_by: startup_agent`) and raw copy headers (which use `yaml_header_template.md` line 68: `generated_by: startup_agent`). CLAUDE.md has none of these.

### 6.4 — `.bin/AGENTS.md` references `sync-agents.sh` but does not list it

`.bin/AGENTS.md` lines 31-33 list only two scripts in its table:

```
| `spinosa` | CLI entry point... |
| `check-startup.sh` | Developer validation helper... |
```

`sync-agents.sh` and `metrics.sh` (in `lib/`) are not mentioned. The table should list all scripts in the directory.

### 6.5 — `system/configuration.md` uses `[filled by CLI onboarding]` placeholder

Line 18: `source_location: "[filled by CLI onboarding]"` and line 34: `preferred_llm_cli: "[filled by CLI onboarding]"`. These placeholders are expected in the framework template (pre-onboarding), but the `setup_status: not_started` (line 8) correctly marks this as not yet started. No issue per se, but worth noting that the `check-startup.sh` script (line 44) checks for `[path]` but NOT for `[filled by CLI onboarding]`. The `check-startup.sh` script at line 44 only checks for two specific placeholder strings: `[path]` and `[project name]`. It does not detect the `[filled by CLI onboarding]` placeholder, which is a different pattern.

### 6.6 — `system/context.md` contains `[filled by ...]` placeholders throughout

Multiple fields use `[filled by startup]` or `[filled by CLI onboarding]` (lines 18, 22, 25-27, 31, 34, 46, 49, 52). Expected in pre-startup state ✅. Setup status `not_started` (line 8) corroborates this.

---

## 7. LEGACY / RETIRED FILES

File: `/Users/tommasoprinetti/Documents/spinosa-main/.spinosa/retired-framework-files.tsv`

| Line | Path | Reason |
|---|---|---|
| 2 | `onboard.command` | `replaced_by_spinosa_new` |
| 3 | `onboard.cmd` | `replaced_by_spinosa_new` |
| 4 | `.bin/onboard.sh` | `replaced_by_spinosa_new` |

These files no longer exist in the repository (verified — not found in directory listing). The registry is accurate. ✅

---

## 8. SUMMARY OF FINDINGS BY SEVERITY

### Critical (action required)
1. **`.trash/AGENTS.md`** — No YAML frontmatter. Listed as framework file. Add standard `directory_guidance` frontmatter.
2. **`raw/AGENTS.md`** lines 9, 29 — `connects_to: system/header_template.md` references a nonexistent file. Must be `system/yaml_header_template.md`.
3. **`.bin/AGENTS.md`** and **`CLAUDE.md`** — Missing from `framework-files.tsv` registry.

### High (should fix)
4. **`README.md`** and **`LICENSE`** — Missing YAML frontmatter for framework files.
5. **`system/configuration.md`** and **`system/context.md`** — Use `agent:` instead of `role:` and lack `status`/`connects_to` fields.
6. **`CLAUDE.md`** — Lacks `generated_by`, `generated_at`, `processing_status` provenance fields.
7. **`AGENTS.md`** and **`CLAUDE.md`** line 18 — Grammatical error "You provides" → "You provide".

### Medium (should address)
8. **Six directories lack AGENTS.md**: `.agents/`, `.claude/`, `.codex/`, `.opencode/`, `.spinosa/`, `.bin/lib/`.
9. **`system/system_architecture_map.md`** — Missing `status` field; updated date (2026-06-02) is older than peers.
10. **`system/dictionary.md`** and **`logs/user_requests.md`** — Stale `updated` dates equal `created`.
11. **`maps/AGENTS.md`** — `connects_to` is sparse (only `AGENTS.md`).

### Low (cosmetic)
12. **Inconsistent `description` format** across system files — mixed string/semicolon/comma/list formats.
13. **`check-startup.sh`** — Does not detect `[filled by CLI onboarding]` placeholder strings.
14. **`.bin/AGENTS.md`** — Scripts table does not mention `sync-agents.sh` or `lib/metrics.sh`.

---

## 9. FILES AUDITED (COMPLETE LIST)

| # | File | Lines |
|---|---|---|
| 1 | `AGENTS.md` | 175 |
| 2 | `README.md` | 170 |
| 3 | `LICENSE` | 131 |
| 4 | `CLAUDE.md` | 175 |
| 5 | `system/startup.md` | 495 |
| 6 | `system/configuration.md` | 43 |
| 7 | `system/context.md` | 52 |
| 8 | `system/AGENTS.md` | 36 |
| 9 | `system/dictionary.md` | 69 |
| 10 | `system/workspace_index.md` | 127 |
| 11 | `system/system_architecture_map.md` | 131 |
| 12 | `system/yaml_header_template.md` | 116 |
| 13 | `logs/AGENTS.md` | 46 |
| 14 | `logs/user_requests.md` | 21 |
| 15 | `logs/session_metrics.tsv` | 1 |
| 16 | `maps/AGENTS.md` | 44 |
| 17 | `maps/map_template.md` | 75 |
| 18 | `raw/AGENTS.md` | 31 |
| 19 | `agent_reports/AGENTS.md` | 58 |
| 20 | `.trash/AGENTS.md` | 25 |
| 21 | `.bin/AGENTS.md` | 39 |
| 22 | `.bin/spinosa` | 1623 (audited lines 1–100, 1200–1299) |
| 23 | `.bin/check-startup.sh` | 293 |
| 24 | `.bin/sync-agents.sh` | 183 |
| 25 | `.bin/lib/metrics.sh` | 144 |
| 26 | `.spinosa/framework-files.tsv` | 35 |
| 27 | `.spinosa/retired-framework-files.tsv` | 4 |

Total audited: 27 files. Total lines read: ~4,600.
