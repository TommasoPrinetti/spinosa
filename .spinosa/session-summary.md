## Goal
Customize Spinosa TUI onboarding flow, chat interface layout, footer display, tool callout rails, and workspace picker per user requests.

## Constraints & Preferences
- Chat layout uses full terminal width with column ratio 0.4fr / 1.8fr / 0.4fr (rails:center:rails).
- After onboarding completes for Spinosa option: go directly to chat with startup prompt pre-filled.
- After onboarding completes for non-Spinosa providers: launch external CLI via runStartup then navigate home.
- No pane switching needed — just chat view.
- Input box width must match central chat column (not full 3-column rail width).
- Terminal scroll must always show latest line (sticky scroll to bottom).
- Progress bars with `\r` must update in-place (single line, not stacking rows).
- After processing finishes, log must stay visible with Continue button below.
- "Import complete." message removed — just show clean terminal + button.
- Back / primary buttons justified left/right on same line.
- MCP and LSP footers hidden (MCP accessible via /mcp).
- Startup prompt text from CLI must be suppressed from onboarding log.
- Footer must be a single slim row (no title line), fullwidth with minimal padding.
- Context token display removed from subagent footer (shown in main footer).
- Workspace picker should show directory basename (e.g. `my-notes-spinosa`) not source folder name.
- Tool callout rails must not create blank space in center column — absolute positioned.
- Sequential tool callouts on same rail side must be vertically staggered using cumulative height tracking.
- Callout connector line (`├──`) must always emerge at the tool call's vertical level (top=0 of row).
- Bubble may be at a different vertical level, connected by a zigzag line.
- Multiple sequential tool calls of same type on same rail side should merge into one taller bubble listing all commands.

## Progress
### Done
- Provider step layout: changed box → scrollbox so items scroll properly.
- Imports step: removed scan preview block; re-laid-out file types in 3-column flex-wrap grid (22-char cells).
- GateButton component: 30s countdown, auto-continues or clicks to advance.
- Auto-continue gates after tools check ("Start scanning"), scan completes ("Continue"), and processing done ("Choose provider").
- Spinosa CLI option added as first/default in CLI_OPTIONS.
- finishProvider rewritten: Spinosa → openWorkspace + navigate to chat with startup prompt; others → runStartup with cli/launch + goHome.
- runStartup (cli-bridge.ts) accepts launch parameter (run/desktop/copy).
- launchForCli helper maps CLI values to launch modes.
- WorkspaceNav removed from workspace/index.tsx (header bar with project info, tabs, status, hints).
- Pane routing (corpus, routes, settings) removed — only Home or Session rendered.
- MCP footer slot removed from home.tsx.
- MCP status pills removed from session/footer.tsx; dead mcps memo cleaned.
- Back/primary buttons in ActionRows justified left/right via flexGrow spacer.
- Processing done panel cleaned: no "Import complete." text, just buttons below log.
- appendLogLine handles `\r`-carriage-return: replaces last entry instead of pushing.
- LogScrollbox: stickyScroll=true + stickyStart="bottom" for auto-scroll to latest line.
- Panel + log stays visible after processingDone (outer condition widened, ActionRow gated).
- `.trim()` removed from onStdout/onStderr callbacks in both runAdd and runNew in onboarding.tsx (D).
- Startup prompt filter added to runNew onStdout: drops lines after `[3/3] Startup prompt` recap (E).
- LSP section + StatusPill component removed from session/footer.tsx; unused `lsps` memo and `For` import cleaned (F).
- Prompt in session/index.tsx wrapped in `<box>` with `paddingLeft/Right={promptPadding()}` matching `railWidth + gap` in callout mode (G).
- Session outer box: removed `alignItems="center"` and `maxWidth` cap — layout stretches full terminal width.
- transcriptLayout changed to ratio-based: `railWidth = totalWidth * 0.4 / 2.6`, center fills remainder; subtracted 4px for outer padding.
- Footer: removed title line (`createdAt`), switched to single row with `paddingTop=0`, `paddingBottom=0`.
- Subagent footer: removed usage block ("75.4K (38%) · $0.00"), cleaned unused `usage` memo, `messages` memo, `AssistantMessage` import.
- Workspace picker: title now uses `basename(workspace.path)` instead of `workspace.projectName` (which stored corpus basename).
- `transcriptLayout` ratio adjusted to 0.4fr / 1.8fr / 0.4fr (center narrower).
- `TranscriptRow` switched from 3-column flex layout to `position="relative"` container with absolutely positioned rail callouts and padded center content.
- `toolCalloutSides` memo now returns `Map<string, ToolCalloutInfo>` with cumulative height tracking; context type updated to `ToolCalloutInfo`.
- `ToolPart.callout` memo uses cumulative offset from context + tool-specific offset (0/1) as total `offsetTop`.
- `TranscriptRow` uses `top={callout().offsetTop}` for absolute positioning.
- `ToolRailCallout` stripped of `side` prop and connector lines — just renders bordered bubble.
- Split connector line (`──┤` / `├──`) from bubble: connector at `top=0`, vertical stem (`│`) from `top=1` to `offsetTop-1`, bubble at `top=offsetTop`.
- Merged sequential same-side + same-tag tool callouts: `toolCalloutSides` groups consecutive entries, `ToolPart.callout` skips merged members, merged bubble lists all commands multiline.

### In Progress
- (none)

### Blocked
- (none)

## Key Decisions
- Skip startup-hub entirely for Spinosa path — go straight to chat.
- Remove pane switching — only chat view needed.
- Use post-processing filter to suppress startup prompt text from CLI stdout (instead of CLI flag).
- Use absolute positioning (`position="absolute"`) for rail callouts to prevent height bleed into center column.
- Stagger callout positions using cumulative `estimateToolCalloutHeight` as `offsetTop`.
- Merge sequential same-side + same-tag callouts into one taller bubble reducing rail clutter.

## Next Steps
1. Test the TUI.

## Critical Context
- `transcriptLayout()` now provides ratio-based widths from `dimensions().width - 4`.
- `toolCalloutSides()` tracks cumulative `leftHeight` / `rightHeight` and stores `{ side, offsetTop, mergedSummaries?, mergedInto? }` per tool callID.
- Merge groups: consecutive same-side + same-tag entries are merged; leader gets `mergedSummaries`, members get `mergedInto` (skip).
- `offsetTop` = cumulative estimated height of previous callouts on the same side + tool-specific alignment (0/1 for block layout).
- `estimateToolCalloutHeight` sums 2 (base) + wrapped lines of `summary.command` at rail width - 7.
- `pickToolCalloutSide` picks the side with less accumulated height (left ≤ right → left).
- OpenTUI supports `position="absolute"` with `left`, `right`, `top` coordinates.

## Relevant Files
- `packages/tui/src/routes/session/index.tsx`: TranscriptRow, ToolRailCallout, toolCalloutSides memo, ToolPart, context type.
- `packages/tui/src/routes/session/footer.tsx`: slim one-line footer.
- `packages/tui/src/routes/session/subagent-footer.tsx`: usage display removed.
- `packages/tui/src/routes/spinosa/onboarding.tsx`: callbacks, gates, startup prompt filter.
- `packages/tui/src/routes/spinosa/workspace-picker.tsx`: title fallback to `basename(path)`.
