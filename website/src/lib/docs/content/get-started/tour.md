# Tour — From Install to Your First Report

This walkthrough takes you from zero to your first verified report in about 10 minutes.

## 1. Install Spinosa

Open a terminal and run:

```bash
# Beta — current development / prerelease channel (recommended while Spinosa is in beta)
curl -fsSL https://github.com/medialab/spinosa/releases/download/beta/install.sh | bash

# Stable — production channel (when published)
# curl -fsSL https://github.com/medialab/spinosa/releases/download/stable/install.sh | bash
```

This installs the `spinosa` command and all its dependencies (Bun runtime, document converters, OCR engine). After install, open a new terminal window.

## 2. Launch the dashboard

```bash
spinosa
```

This opens the Spinosa TUI (terminal UI) dashboard. If this is your first time, you'll see:

- A welcome screen with the Spinosa logo and version
- A list of workspaces (empty on first run)
- A **+ New workspace** button in the bottom-right area

Press `W` or click **Workspaces** in the footer to open the workspace picker.

## 3. Create a workspace

In the workspace picker, click **+ New workspace**. This starts the onboarding wizard.

The wizard guides you through these steps:

1. **Path** — Enter the folder path containing your research documents (PDFs, Word files, images, etc.)
2. **Name** — Give your workspace a name
3. **Tools** — Verify that the document processing tools are installed (OCR, MarkItDown)
4. **Scan** — Spinosa scans your folder and classifies each file by type
5. **Import** — Select which file types to import
6. **Setup** — Workspace folder is created and registered
7–9. **Convert** — Files are copied and converted to markdown in phases
10. **Provider** — Choose which AI coding tool you use (Claude Code, OpenCode, Gemini, etc.)
11. **Done** — Summary of what was imported

> **Tip:** If you already have a workspace folder, you can skip the wizard and just point the workspace picker to it.

## 4. Start a chat session

When the wizard finishes, you'll return to the home screen with a chat prompt at the bottom. Type a question about your documents, for example:

```
What did the interviews say about coastal erosion?
```

Press **Enter** to send. Spinosa's agents search your documents, assemble evidence, and return a markdown report.

## 5. Read the report

Every answer comes back with:

- A direct answer to your question
- Quoted evidence with source file paths
- Analysis that separates interpretation from source text
- A verification status showing whether the claims passed source checks
- Limitations so you can judge scope and confidence

You can navigate the report with `↑↓`, open cited files, or ask follow-up questions in the same chat.

## 6. Visualize your session

Press `W` and select a workspace, then look for **Visualizer** in the top menu. The visualizer shows:

- **Files view** (press `1`) — heatmap of which files were accessed
- **Flow view** (press `2`) — graph of tool calls the agents made
- **Activity view** (press `3`) — timeline of the conversation

Use `+`/`-` to zoom, click and drag to pan, and `Enter` to inspect details.

## 7. Keep going

After your first report, the normal loop is simple:

1. Ask follow-up questions in the same chat
2. Add new documents: press `I` or use the add-files wizard
3. Switch between workspaces: press `W` to open the workspace picker
4. Start a new chat session: press `N`

## Next reads

- [TUI Guide](/spinosa/docs/tui) — keyboard shortcuts and navigation
- [Agents](/spinosa/docs/agents) — how the agents divide the work
- [Reports](/spinosa/docs/reports) — how to read verification statuses and charts
- [Workspace](/spinosa/docs/workspace) — what's on disk and how the file layout works
