# Session back button audit

**Files:**
- `packages/tui/src/routes/session/index.tsx` (back button at line 1258–1260)
- `packages/tui/src/context/route.tsx` (route types + normalization)
- `packages/tui/src/context/project.tsx` (workspace switching)

---

## Current behavior

Back button `onMouseUp` handler (line 1258–1261):

```ts
onMouseUp={() => {
  if (spinosa.activePath) dialog.replace(() => <DialogSpinosaWorkspacePicker />)
  else navigate({ type: "home" })
}}
```

Two paths:
1. **`spinosa.activePath` set** → opens `DialogSpinosaWorkspacePicker` (workspace list to switch to a different workspace)
2. **`spinosa.activePath` null** → `navigate({ type: "home" })` which normalizes to `{ type: "workspace" }` — the workspace chat/entry home, with no session

**`navigate({ type: "home" })`** normalizes to `{ type: "workspace" }` (no `sessionID`). The `Workspace` route then renders `<Home />` (the chat prompt screen).

## Problem

The session **already loads its workspace** and switches the project to it. Lines 374–412:

```ts
createEffect(() => {
  const sessionID = route.sessionID
  // ...
  const result = await sdk.client.session.get({ sessionID })
  // ...
  if (result.data.workspaceID !== previousWorkspace) {
    project.workspace.set(result.data.workspaceID)  // ← switches to session's workspace
  }
})
```

So by the time the user sees the session screen, the project workspace is **already set to the session's workspace**. Going "back" should:
- **Clear the session** → navigate to the workspace home (chat prompt).
- **NOT** open the workspace picker — that is "switch workspace", not "back".

The workspace picker is accessible via other means (`w` key, or the dedicated picker dialog). The back button should always return to the workspace home of the same workspace the session belongs to.

## The current `spinosa.activePath` guard is wrong

The only reason the guard existed was to distinguish "we're in a Spinosa workspace" vs "we're in generic OpenCode mode". But:

- `session().workspaceID` already tells you which workspace the session belongs to.
- `navigate({ type: "workspace" })` always renders the workspace home — whether it's a Spinosa workspace or generic OpenCode mode.
- Opening the workspace picker on back is a behavior mismatch: user pressed "back", not "switch".

## Recommended fix

Replace the back button handler with a single navigation:

```ts
navigate({ type: "workspace" })
```

This:
- Clears `sessionID` → renders `<Home />` (chat prompt) in the **same workspace**.
- Works for both Spinosa and OpenCode modes.
- Is the true semantic equivalent of "go back to where I was before opening this session".

The workspace picker remains accessible via:
- `w` keyboard shortcut (home prompt chips)
- "Switch workspace" action in the home screen
- `DialogSpinosaWorkspacePicker` can still be opened explicitly via those paths

## What doesn't change

- The session fetch + workspace switch effect (lines 374–412) is correct — it ensures the workspace is loaded before showing the session.
- No other back-related code paths need updating.
