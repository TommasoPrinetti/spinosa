# TUI Tweak Notes

## What We Changed

### Chat layout (`session/index.tsx`)

- **3-column flex layout**: left rail / center / right rail at 0.4fr:1.8fr:0.4fr ratio (full terminal width). Replaced absolute-positioned rails.
- **`TranscriptRow`**: flex row with `width=100%` wrapping `[rail] [center] [rail]`. Rails use normal flow — clickable.
- **Left rail**: `justifyContent="flex-end"` + `alignItems="flex-start"` — callout right-aligned to hug center column, top-aligned with tool header.
- **Right rail**: `alignItems="flex-start"` — left-aligned, top-aligned with tool header.
- Both rails `alignItems="flex-end"` originally (bottom-aligned); changed to `flex-start` so callout sits on first line of tool content, especially for multi-line output.

### Tool callout rails (`ToolRailCallout`)

- **Minimal one-line format**: `connector (├──/──┤) + tool tag (colored bg) + copy badge (grey bg)`.
- **Connector shown**: `──┤` on left, `├──` on right — both 3 chars wide.
- **Tool tag**: `bg={color()}` based on status (error/red, running/warning, pending/muted, secondary/done), bold white text.
- **Copy badge**: `bg={backgroundElement}` (darker grey), text `copy`/`✓` with padding spaces (`" copy "`, `" ✓ "`).
  - `backgroundElement` is one step darker than `backgroundPanel` — visible contrast.
- **Copy behavior**: `buildCopyCommand` maps tool type → terminal command:
  - bash → raw command string
  - read → `cat "file"`
  - grep → `grep -r "pattern" path`
  - glob → `find path -name "pattern"`
  - webfetch → `curl -sL "url"`
  - websearch → URL or `search: query`
  - write → `cat > "file"`
  - edit → `edit "file"`
  - task/skill → summary fallback
- **Copy indicator**: `cpy` → `✓` for 3s; only copy badge toggles, tag stays visible.
- **Left inner row** in `ToolRailCallout`: `justifyContent="flex-end"` when `side === "left"` — pushing tag+copy+connector to right edge.

### Rail height accounting

- `toolCalloutSides()` balances callouts between left/right rails by accumulated height.
- `estimateToolCalloutHeight` returns `1` (one-line callouts).
- `pickerToolCalloutSide` picks the side with less accumulated height.

### Footer (`footer.tsx`, `subagent-footer.tsx`)

- **Footer**: single slim row, `justifyContent="center"`, `paddingTop=0`, `paddingBottom=0`.
- **MCP/LSP footers**: stripped from home and session views (accessible via /mcp).
- **Subagent footer**: usage block removed.

### Other

- **Workspace picker title**: uses `basename(workspace.path)` instead of source folder name.
- **Prompt padding**: matches `railWidth + gap` in callout mode.
- **`TranscriptRow` prop `offsetTop`**: stored but unused (legacy from absolute positioning; flex layout makes it unnecessary).

## Key Insights

1. **Flex layout for rails**: Normal-flow flex > absolute positioning. Makes rails clickable without z-index issues. Each tool part gets its own `TranscriptRow`, so rail and content are naturally in the same flex row.
2. **Merge reverted**: Merge grouping (`mergedSummaries`/`mergedInto`) caused scroll-related disappearing. Each tool gets its own callout — simpler and reliable.
3. **`alignItems` gotcha**: In a flex row, `alignItems` controls vertical alignment (cross-axis). `flex-end` = bottom of tallest child. Changed to `flex-start` so callout sits on first line of tool content.
4. **`justifyContent` for horizontal**: For right-aligning content within a rail column, use `justifyContent="flex-end"`.
5. **Copy works per-tool**: `buildCopyCommand` lives in `session/index.tsx` and generates a runnable terminal command for each tool type. Clipboard via `useClipboard`.

## Relevant Files

- `packages/tui/src/routes/session/index.tsx`: TranscriptRow, ToolRailCallout, toolCalloutSides, ToolPart, buildCopyCommand, estimateToolCalloutHeight.
- `packages/tui/src/routes/session/footer.tsx`: centered footer.
- `packages/tui/src/routes/session/subagent-footer.tsx`: usage removed.
- `packages/tui/src/routes/spinosa/workspace-picker.tsx`: title fallback to `basename(path)`.
