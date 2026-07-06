# Orchestrator Notes

This is the orchestrator's working memory — a holistic record of context,
decisions, and lessons across sessions. The orchestrator reads and updates
this file based on what the user requests.

## Overseer State

- routes_since_overseer: 0
- last_overseer_session: (none)
- last_coverage_report: (none)

## Current Context
- TUI onboarding flow restructured to 6-step wizard with live CLI output display

## Session History
- 20260703: Rewrote spinosa TUI onboarding flow. New steps: path → tools check (animated log + auto-repair) → scan (animated file-by-file reveal) → file selection → processing (live CLI streaming) → provider picker → done. Removed old "cli" + "review" steps that were skipped for new mode.
- 20260706: Fixed progress bar + spinner architecture. Three changes: (1) replaced 3 isolated ProgressEmitters with single shared emitter in onboarding.tsx, (2) added PHASES const to cli-bridge.ts, (3) added spinnerColor + inactiveFactor to Theme type with fallbacks. Also added per-file onLog calls in markitdown + OCR pipeline so progress is visible in terminal even if bar skips frames.

## Observations
- All 5 failing tests are pre-existing (parseGoalArtifact, analyzeRouteRecovery, classifyPrompt, layout constants). Unrelated to this change.
- CLI scripts unchanged — TUI adapts its processes to show real CLI output.
- `onboarding-preview.ts` gained 3 exports: `detectDocumentTools`, `ToolStatus`, `detectLlmTools`.
