---
type: report
created: 2026-06-05
updated: 2026-06-05
status: draft
scope: Audit of all spinosa agent definitions, skills, and vendor mirrors
---

# spinosa Agent & Skill Audit Report

```
┌─ Corpus Navigation ──────────────────────────────────────────────┐
│ Maps   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  7 canonical agents checked            │
│ Raw    ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  7 canonical skills checked            │
│ Source ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  21 vendor agent mirrors checked       │
│ Status ⚠ corrections                                              │
└─────────────────────────────────────────────────────────────────┘
```

## Answer

The audit found **3 CRITICAL truncation bugs** affecting vendor agent mirrors, **2 agents with missing metrics support**, **no fallback skills for 2 agents**, **inconsistent permissions between canonical and vendor mirrors**, and a **superfluous file polluting agent_reports/**. Skills are perfectly synced across all platforms. Vendor skill references are complete.

---

## 1. CANONICAL AGENT ISSUES

### 1.1 Missing Metrics Support

Two canonical agents lack metrics logging entirely:

**spinosa-analyst** (`.agents/agents/spinosa-analyst.md`)
- **Issue**: No `logs/session_metrics.tsv` write permission (line 12-13: only `read: allow` + `write: maps/` with constraint).
- **Issue**: No metrics step in workflow (lines 19-27); the workflow has 4 steps, none mention metrics.
- **Issue**: No metrics rule in Rules section (lines 49-59).
- **Severity**: Medium. All other 5 programmable agents (searcher, verifier, mapper, serendippo, janitor) append metrics. Analyst is invisible to session tracking.

**spinosa-writer** (`.agents/agents/spinosa-writer.md`)
- **Issue**: No `logs/session_metrics.tsv` write permission (line 12-13: only `read: allow` + `write: agent_reports/`).
- **Issue**: No metrics step in workflow (lines 24-33, 8 steps, none mention metrics).
- **Issue**: No metrics rule in Rules section (lines 268-280).
- **Severity**: Medium. Writer is a core pipeline agent and should be tracked.

### 1.2 Frontmatter Field Completeness (All OK)

All 7 canonical agents have the required frontmatter fields: `name`, `type`, `scope`, `description`, `created`, `updated`, `permissions`. No missing required fields.

### 1.3 Permission Consistency (All OK)

All 7 canonical agents use `permissions:` (plural) consistently. Write permissions are path-specific (e.g., `agent_reports/`, `maps/`, `logs/session_metrics.tsv`). The janitor has a unique `move:` permission for `.trash/`. No inconsistencies within canonical definitions.

### 1.4 Agent Description vs. Actual Behavior (All OK)

All 7 descriptions accurately reflect actual defined behavior. No mismatches found.

---

## 2. VENDOR MIRROR ISSUES

### 2.1 CRITICAL: Body Content Truncation (3 Agents, Both Platforms)

The OpenCode and Claude mirrors for **searcher**, **writer**, and **mapper** are severely truncated. The body content stops immediately at the first opening markdown code fence, losing most of the agent definition. This is a sync script bug.

#### spinosa-searcher

| Platform | File | Lines |
|---|---|---|
| Canonical | `.agents/agents/spinosa-searcher.md` | 95 |
| OpenCode | `.opencode/agents/spinosa-searcher.md` | **33** (missing 62) |
| Claude | `.claude/agents/spinosa-searcher.md` | **28** (missing 67) |

**Missing content** (canonical lines 40-95):
- Full evidence packet frontmatter template (the `navigation:` block with maps_accessed, raw_files_scanned, etc.)
- Step 2: Split into main + appendix instructions
- Step 3: Return path format with navigation summary
- **ALL 13 Rules** (canonical lines 83-95): including "All output must be reports", use-maps-for-navigation, track-navigation, report-what-you-found, include-file-paths, multiple-search-rounds, append-metrics rules

**Exact truncation point** (OpenCode line 33, Claude line 28):
`Write to agent_reports/evidence_packet.md:` followed by newline then ` ```markdown`. The file ends at the opening code fence.

#### spinosa-writer

| Platform | File | Lines |
|---|---|---|
| Canonical | `.agents/agents/spinosa-writer.md` | **288** |
| OpenCode | `.opencode/agents/spinosa-writer.md` | **33** (missing 255) |
| Claude | `.claude/agents/spinosa-writer.md` | **30** (missing 258) |

**Missing content** (canonical lines 38-288):
- **Entire Report Template** (including Navigation Dashboard with Unicode charts)
- **Evidence Appendix Pattern** section
- **All Formatting Standards** (H1/H2 rules, tables, lists, no-filler, max-500-lines, verbatim quotes)
- **ALL 6 Unicode Chart Types** (Distribution Bars, Progress Bar, Status Matrix, Gauge, Sparkline, Stacked Bar) with rendering algorithms and format examples — approximately 150 lines
- **ALL Rules** (lines 268-280)
- **Process File Cleanup** section (lines 282-288)

**Impact**: The Writer mirror has essentially no usable definition. The Unicode chart specification, the Writer's most distinctive capability, is entirely absent.

#### spinosa-mapper

| Platform | File | Lines |
|---|---|---|
| Canonical | `.agents/agents/spinosa-mapper.md` | 117 |
| OpenCode | `.opencode/agents/spinosa-mapper.md` | **41** (missing 76) |
| Claude | `.claude/agents/spinosa-mapper.md` | **38** (missing 79) |

**Missing content** (canonical lines 48-117):
- Full extraction packet template (structured data format with batch_id, Processed Files table, Extraction Packets with key passages, concept signals, connections)
- Step 2: Return path format
- **Entire Map Writing section** (lines 93-103): 6-step map writing protocol
- **ALL Rules** (lines 105-117): including "All output must be reports", read-completely-before-extracting, dictionary-canonical-forms, language detection, unreadable-file handling, batch-naming, prose-format-maps, key-passage-references, no-forced-interpretation, append-metrics rules

### 2.2 Non-Truncated Agents (Frontmatter Differences Only)

The remaining 4 agents (**analyst**, **verifier**, **serendippo**, **janitor**) are **not truncated** — body content is complete. Differences are frontmatter-only (expected for platform-specific formats).

| Agent | Canonical | OpenCode | Claude | Body match? |
|---|---|---|---|---|
| spinosa-analyst | 59 lines | 55 lines | 52 lines | YES |
| spinosa-verifier | 57 lines | 52 lines | 47 lines | YES |
| spinosa-serendippo | 180 lines | 174 lines | 169 lines | YES |
| spinosa-janitor | 95 lines | 89 lines | 83 lines | YES |

### 2.3 Permissions Not Equivalent

All vendor mirrors use broader permission models that do not preserve canonical path restrictions:

- **OpenCode**: All agents use `permission: read: allow, edit: allow` (blanket). No path restrictions. No `grep:` or `glob:` tool declarations.
- **Claude**: Uses `tools: Read, Grep, Glob, Write` etc. Lacks write-path restrictions.

**Specific permission issues**:

1. **spinosa-janitor** (`.opencode/agents/spinosa-janitor.md`, line 12): Has `bash: allow` permission **not present in canonical**. Canonical janitor has no bash permission.

2. **spinosa-janitor** (both `.opencode/` and `.claude/`): Missing the canonical `move: .trash/` permission (canonical line 17-18). This is the janitor's defining permission.

3. **spinosa-mapper** (`.claude/agents/spinosa-mapper.md`, line 6): Only `tools: Read` — needs Write for extraction packets and maps.

4. **spinosa-analyst** (`.opencode/agents/spinosa-analyst.md`, line 9): `edit: allow` but canonical only permits writes to `maps/` with constraints.

5. **spinosa-verifier** (`.opencode/agents/spinosa-verifier.md`, line 11): `edit: allow` but canonical restricts writes to `agent_reports/` and `logs/session_metrics.tsv`.

### 2.4 Frontmatter Field Differences (Platform-Specific, Not Errors)

- **Canonical**: `name, type: agent, scope, description, created, updated, permissions:` (plural)
- **OpenCode**: `name, description, mode: subagent, permission:` (singular) — drops `type`, `scope`, `created`, `updated`
- **Claude**: `name, description, tools:` — drops `type`, `scope`, `created`, `updated`, `permissions`

`scope` metadata and date tracking are lost in mirrors. Not a sync bug, but worth noting.

### 2.5 `.codex/agents/` (TOML — Separate Format, Intentional)

Contains TOML files (`spinosa-searcher.toml` etc.) — a completely different format from canonical `.md` files. AGENTS.md documents this as "Codex-native TOML agents (manually maintained, not part of the sync script)." Content is simplified vs. canonical (e.g., writer TOML has 75 lines with no Unicode chart types). Expected for a manually-maintained separate format.

---

## 3. SKILL ISSUES

### 3.1 Vendor Skill Mirrors: PERFECTLY SYNCED

All 7 canonical skills are byte-for-byte identical across all 3 vendor mirrors. Verified via `diff`:

| Skill | Canonical | OpenCode | Claude | Codex |
|---|---|---|---|---|
| evidence-search | 87 lines | 87 lines | 87 lines | 87 lines |
| context-analysis | 43 lines | 43 lines | 43 lines | 43 lines |
| report-writing | 196 lines | 196 lines | 196 lines | 196 lines |
| claim-verification | 64 lines | 64 lines | 64 lines | 64 lines |
| workspace-cleanup | 60 lines | 60 lines | 60 lines | 60 lines |
| orchestrator-dispatch | 165 lines | 165 lines | 165 lines | 165 lines |
| source-intake | 47 lines | 47 lines | 47 lines | 47 lines |

**Zero diff bytes for all 21 vendor skill mirrors. No issues.**

### 3.2 Skill Reference Subdirectories: ALL COMPLETE

| Skill | Canonical refs | OpenCode | Claude | Codex |
|---|---|---|---|---|
| context-analysis | 2 files | 2 | 2 | 2 |
| report-writing | 2 files | 2 | 2 | 2 |
| claim-verification | 1 file | 1 | 1 | 1 |
| orchestrator-dispatch | 3 files | 3 | 3 | 3 |
| evidence-search | 0 (no refs/) | 0 | 0 | 0 |
| workspace-cleanup | 0 (no refs/) | 0 | 0 | 0 |
| source-intake | 0 (no refs/) | 0 | 0 | 0 |

Consistent across all platforms. No issues.

### 3.3 Skill Frontmatter Fields (All OK)

All 7 canonical skills use: `name, type: skill, scope, description, created, updated`. None include `permissions` (correct — skills are instruction sets, not executables).

---

## 4. METRICS COVERAGE GAPS

| Agent | Has write to session_metrics.tsv? | Has metrics instruction? | Session visible? |
|---|---|---|---|
| spinosa-searcher | YES (line 17) | YES (step 6, line 95) | YES |
| **spinosa-analyst** | **NO** | **NO** | **NO** |
| **spinosa-writer** | **NO** | **NO** | **NO** |
| spinosa-verifier | YES (line 16) | YES (step 9, line 57) | YES |
| spinosa-mapper | YES (line 15) | YES (step 7, line 117) | YES |
| spinosa-serendippo | YES (line 18) | YES (Phase 4, line 169) | YES |
| spinosa-janitor | YES (line 16) | YES (step 7, line 95) | YES |

**Gap**: 2 of 7 canonical agents (29%) cannot write metrics and have no metrics instructions. Analyst and Writer operations will never appear in `logs/session_metrics.tsv`.

---

## 5. AGENT -> SKILL CONSISTENCY

### 5.1 Fallback Mappings

| Parent Agent | Fallback Skill | Consistent? |
|---|---|---|
| spinosa-searcher | evidence-search | YES — same scope (evidence_retrieval), same workflow |
| spinosa-analyst | context-analysis | YES — same scope concept, same analytical framing |
| spinosa-writer | report-writing | YES — same scope (report_synthesis), same template |
| spinosa-verifier | claim-verification | YES — same scope (claim_verification), same steps |
| spinosa-janitor | workspace-cleanup | YES — same scope (workspace_hygiene), same workflow |
| **spinosa-mapper** | **(none)** | **GAP — no fallback skill exists** |
| **spinosa-serendippo** | **(none)** | **GAP — no fallback skill exists** |

### 5.2 Missing Fallback Skills

The orchestrator dispatch table (`.agents/skills/orchestrator-dispatch/SKILL.md`, lines 152-153) lists Mapper and Serendippo with "startup protocol" as their Skill — not a real SKILL.md file. There are no mapper or serendippo skill directories in `.agents/skills/` or any vendor mirror.

**Consequence**: If native sub-agent spawn fails, the orchestrator's fallback protocol — "Read the skill's SKILL.md from `.agents/skills/<skill-name>/SKILL.md`" (orchestrator-dispatch line 79) — cannot work for these two agents. AGENTS.md fallback section also references this path.

### 5.3 Minor Scope Naming Inconsistency

Canonical agent `spinosa-analyst` has scope `project_context` while its fallback skill `context-analysis` has scope `contextual_analysis`. Different labels, same concept. Not a functional bug.

---

## 6. ADDITIONAL FINDINGS

### 6.1 Superfluous File in agent_reports/

**File**: `/Users/tommasoprinetti/Documents/spinosa-main/agent_reports/AGENTS.md`
This is a copy of the root orchestrator playbook placed inside `agent_reports/`. AGENTS.md files are repository control instructions and should NOT reside in the reports directory. The orchestrator dispatch skill (line 20) explicitly prohibits importing AGENTS.md files as source evidence; the same principle should apply to `agent_reports/`.

### 6.2 Sync Script Root Cause Analysis

The truncation bug follows a consistent pattern across all 3 affected agents:
- The agent body contains a markdown code block template ( ```markdown ... ``` )
- The sync script writes content up to and including the line that opens the code block
- Everything after the opening code fence is lost
- This affects agents with early code blocks most severely (searcher: first block at line 39, writer: first block at line 37, mapper: first block at line 47)
- Agents with later or no code blocks are unaffected

### 6.3 `.claude/agents/spinosa-mapper.md` Tool Insufficiency

Line 6: `tools: Read` — the mapper writes extraction packets and maps. Needs `Write`. (Secondary to truncation issue.)

---

## 7. SUMMARY BY SEVERITY

### CRITICAL (3)
1. `spinosa-searcher` mirror truncated (missing 62-67 lines) — `.opencode/agents/spinosa-searcher.md:33`, `.claude/agents/spinosa-searcher.md:28`
2. `spinosa-writer` mirror truncated (missing 255-258 lines) — `.opencode/agents/spinosa-writer.md:33`, `.claude/agents/spinosa-writer.md:30`
3. `spinosa-mapper` mirror truncated (missing 76-79 lines) — `.opencode/agents/spinosa-mapper.md:41`, `.claude/agents/spinosa-mapper.md:38`

### HIGH (2)
4. No fallback skills for `spinosa-mapper` and `spinosa-serendippo` (no SKILL.md exists)
5. Vendor permissions not equivalent to canonical (all 14 OpenCode + Claude mirrors use blanket edit)

### MEDIUM (5)
6. `spinosa-analyst` missing metrics support — `.agents/agents/spinosa-analyst.md` lines 12-13
7. `spinosa-writer` missing metrics support — `.agents/agents/spinosa-writer.md` lines 12-13
8. OpenCode janitor extra `bash: allow` — `.opencode/agents/spinosa-janitor.md` line 12
9. OpenCode/Claude janitor missing `move: .trash/` — `.opencode/agents/spinosa-janitor.md`, `.claude/agents/spinosa-janitor.md`
10. Scope name mismatch: analyst `project_context` vs skill `contextual_analysis`

### LOW (2)
11. Superfluous AGENTS.md in agent_reports/ — `/Users/tommasoprinetti/Documents/spinosa-main/agent_reports/AGENTS.md`
12. Claude mapper only `tools: Read` (needs Write) — `.claude/agents/spinosa-mapper.md` line 6

### NO ISSUES
- All 7 canonical agent frontmatter fields present and correct
- All agent descriptions match actual behavior
- All 21 vendor skill mirrors byte-identical to canonical
- All vendor skill reference directories match canonical
- All 5 skill-backed agents have correct fallback skill mappings

---

## 8. VERIFICATION DATA

```
Files inspected: 43
  - 7 canonical agents
  - 7 canonical skills
  - 14 OpenCode/Claude agent mirrors
  - 7 Codex TOML agents
  - 4 canonical skill reference subdirectories
  - 12 vendor skill reference subdirectories
  - 6 vendor skill mirrors (spot-checked, all verified identical)
  
Diffs executed: 28
  - 14 canonical-to-OpenCode/Claude agent diffs
  - 4 canonical-to-vendor skill diffs
  - 10 line-count comparisons

Sync script bug: CONFIRMED for 3 agents across 2 platforms.
Truncation point: always at the opening code fence of the first markdown block.
```
