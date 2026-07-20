# TUI Agent Scenario Template

A scenario is a JSON file that drives a real TUI application. Each step is an action
(keyboard, mouse, wait, assert). The runner replays every step and captures evidence.

## Quick Start

```json
{
  "name": "my-scenario",
  "description": "What this scenario tests",

  // Path to the adapter module that mounts your TUI.
  // Relative paths resolve from this scenario file.
  "adapter": "../adapters/spinosa.ts",

  // Terminal dimensions for the headless renderer.
  "terminal": { "width": 100, "height": 50 },

  // Adapter-owned fixture data. The runner does NOT interpret this —
  // it passes it verbatim to the adapter's prepare() method.
  // The adapter uses it to create workspace files, sessions, KV entries, etc.
  "fixture": {
    "workspace": { "name": "test-workspace", "setupStatus": "workspace_started" },
    "sessions": [
      { "id": "ses_01", "title": "My session", "directory": "$WORKSPACE", "updated": 100 }
    ],
    "responses": [
      { "path": "/api/endpoint", "body": { "key": "value" } }
    ]
  },

  // The sequence of actions to execute.
  "steps": [
    { "action": "waitForText", "text": "Hello", "timeoutMs": 5000 }
  ]
}
```

## Fixture Tokens

The runner substitutes these tokens in scenario strings:

| Token | Value |
|---|---|
| `$FIXTURE_ROOT` | Temp directory for this run |
| `$HOME` | Isolated home directory |
| `$CWD` | Working directory (set by adapter's prepare()) |
| `$WORKSPACE` | Workspace path (set by adapter if it creates one) |

## All Action Types

### Wait Actions — pause until a condition is met

```json
// Wait until text appears in the frame
{ "action": "waitForText", "text": "Loading complete", "timeoutMs": 5000 }

// Wait until text disappears from the frame  
{ "action": "waitForAbsent", "text": "Loading...", "timeoutMs": 3000 }

// Wait until a specific renderable type has focus
{ "action": "waitForFocus", "type": "TextareaRenderable", "timeoutMs": 5000 }

// Wait until the renderer has been visually idle (no changes)
{ "action": "waitForIdle", "quietFrames": 3, "timeoutMs": 5000 }
```

### Keyboard Actions

```json
// Type text into the focused input
{ "action": "type", "text": "hello world" }

// Type with character delay (ms)
{ "action": "type", "text": "/session", "delayMs": 10 }

// Press a single key
{ "action": "key", "key": "RETURN" }
{ "action": "key", "key": "escape" }
{ "action": "key", "key": "ARROW_DOWN" }
{ "action": "key", "key": "ARROW_UP" }

// Key with modifiers
{ "action": "key", "key": "s", "modifiers": { "shift": true } }
{ "action": "key", "key": "p", "modifiers": { "ctrl": true } }

// Repeat a key multiple times
{ "action": "key", "key": "ARROW_DOWN", "repeat": 3 }

// Paste multi-line text with bracketed paste mode
{ "action": "paste", "text": "line 1\nline 2\nline 3" }
```

### Mouse Actions

```json
// Click at specific cell coordinates (x=column, y=row)
{ "action": "click", "x": 5, "y": 10 }

// Double-click
{ "action": "doubleClick", "x": 5, "y": 10 }

// Click on visible text (finds cell coordinates automatically)
{ "action": "clickText", "text": "Settings" }

// Click the Nth occurrence of a text (default is 1)
{ "action": "clickText", "text": "Save", "occurrence": 2 }

// Move mouse to cell coordinates
{ "action": "move", "x": 30, "y": 15 }

// Mouse wheel scroll
{ "action": "scroll", "x": 30, "y": 15, "direction": "down" }

// Drag from one cell to another
{ "action": "drag", "from": [5, 10], "to": [20, 10] }
```

### Terminal Actions

```json
// Resize the terminal (triggers reflow)
{ "action": "resize", "width": 80, "height": 24 }

// Wait for a number of milliseconds
{ "action": "wait", "ms": 1000 }

// Capture a named evidence frame (for documentation or debugging)
{ "action": "capture", "name": "after-settings-opened" }
```

### Search Actions

```json
// Search the current frame AND scrollback buffer for a regex pattern.
// Throws if not found. Good for checking if specific content exists anywhere.
{ "action": "find", "pattern": "error|warning", "timeoutMs": 5000 }
```

### Assert Actions — verify state

```json
{
  "action": "assert",
  // Text that must be visible in the current frame
  "visible": ["Workspace:", "Session:", "1 Files"],

  // Text that must NOT be visible
  "absent": ["Error", "Failed"],

  // HTTP requests that must have been made
  "requests": [
    { "path": "/session", "method": "GET", "query": { "directory": "$WORKSPACE" } }
  ],

  // Cursor position (x, y)
  "cursor": [0, 0],

  // Focused renderable
  "focus": { "type": "TextareaRenderable" },

  // Adapter-inspected route (requires adapter's inspect())
  "route": "home",

  // Dialog state
  "dialog": { "open": true, "depth": 1, "size": "large" },

  // Adapter state fields
  "state": { "ready": true, "sessionCount": 2 },

  // Highlighted (inverse-video / selected) spans on screen.
  // Useful for asserting which menu item or tab is selected.
  "highlights": [{ "text": "Settings" }]
}
```

## Complete Example

```json
{
  "name": "complete-example",
  "description": "Demonstrates every action type working together",
  "adapter": "../adapters/spinosa.ts",
  "terminal": { "width": 100, "height": 50 },
  "fixture": {
    "workspace": { "name": "demo-workspace", "setupStatus": "workspace_started" },
    "sessions": [
      { "id": "ses_demo", "title": "Demo session", "directory": "$WORKSPACE", "updated": 100 }
    ],
    "responses": [
      { "path": "/global/config", "body": { "autoupdate": "notify" } },
      { "path": "/file", "body": [] }
    ]
  },
  "steps": [
    { "action": "waitForText", "text": "Describe the task", "timeoutMs": 8000 },
    { "action": "capture", "name": "home-screen" },
    { "action": "assert", "visible": ["Switch workspace", "Import files", "Visualizer"] },

    { "action": "clickText", "text": "Visualizer" },
    { "action": "waitForText", "text": "Conversation graphs", "timeoutMs": 8000 },

    { "action": "clickText", "text": "Back" },

    { "action": "type", "text": "/session" },
    { "action": "key", "key": "RETURN" },
    { "action": "waitForText", "text": "Demo session", "timeoutMs": 5000 },
    { "action": "assert", "visible": ["Demo session"] },
    { "action": "capture", "name": "session-list" }
  ]
}
```

## Running

```bash
# With the npm package (if installed)
tui-agent run scenarios/complete-example.json --json

# With local bun (development)
bun tools/tui-agent/cli.ts run scenarios/complete-example.json --json

# Show results
tui-agent show .tui-agent/artifacts/complete-example-<timestamp>
```

## Writing Good Scenarios

1. **Start with `waitForText`** — always wait for the app to be ready before interacting
2. **Use `capture` at key moments** — evidence frames help debug failures
3. **Assert early, assert often** — verify after every meaningful action
4. **Use `highlights` in asserts** — test which item is actually selected, not just present
5. **Set reasonable timeouts** — 5-8s for page loads, 1-3s for reactions
6. **Clean up with fixture data** — use the adapter's `responses` to mock API calls
7. **Tokenize paths** — use `$WORKSPACE`, `$FIXTURE_ROOT` instead of hardcoding
