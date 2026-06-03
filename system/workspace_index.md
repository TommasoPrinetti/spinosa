---
type: workspace_index
role: workspace_master_index
purpose: [map the whole workspace and point to the main retrieval layers]
description:
  - Master index for corpus coverage, maps, dictionary status, and known gaps.
  - Agents use this to orient retrieval and verify whether startup produced a usable workspace.
scope: [all of raw/]
connects_to:
  - dictionary.md
  - header_template.md
  - maps/map_template.md
status: template
created: 2026-05-26
updated: 2026-06-03
---

# Workspace — Master Index

Startup builds this file after onboarding.

Keep this template empty on the framework branch. Project-specific source counts, map lists, dictionary counts, media coverage, and validation results belong on project branches after startup.

## Structure

```
raw/
maps/
dictionary.md
workspace_index.md
```

## Navigation Maps

| Map | Role | Status |
|---|---|---|

## Source Coverage

| Source type | Count | Last updated |
|---|---:|---|

## Skipped Media Coverage

| Media type | Count | Notes |
|---|---:|---|

## Dictionary Status

| Category | Count | Last updated |
|---|---:|---|

## Coverage Status

- Files with valid raw headers: 0
- Navigation maps created: 0
- Navigation maps created: 0
- Known gaps: none recorded yet
