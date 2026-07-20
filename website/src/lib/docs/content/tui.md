# Spinosa TUI Guide

The Spinosa TUI (terminal UI) is the main way to use Spinosa. Launch it with:

```bash
spinosa
```

This guide covers navigation, keyboard shortcuts, and each screen.

## Screens (routes)

| Screen | When you see it | What it does |
|--------|-----------------|-------------|
| **Home** | Default startup screen | Shows recent workspaces, chat prompt, and boot health |
| **Workspace picker** | Press `W` or click Workspaces | Lists all registered workspaces, sort and select |
| **Onboarding wizard** | Click + New workspace | 11-step wizard to create a workspace from documents |
| **Chat session** | Select a workspace and ask a question | Chat with your documents through AI agents |
| **Visualizer** | Look for Visualizer in top menu | Explore conversation flow, file access, activity timeline |
| **Add-files wizard** | Press `I` or click Import files | Add new documents to an existing workspace |

## Global keyboard shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+P` or `/` | Command palette |
| `S` | Settings |
| `A` | Agents |
| `K` | Keys / model provider |
| `W` | Workspaces (workspace picker) |
| `M` | Models |
| `N` | New chat session |
| `I` | Import / add files |
| `Escape` | Go back or close dialog |
| `Ctrl+C` | Exit TUI (or cancel current operation) |
| `↑` `↓` or `j` `k` | Navigate lists |
| `Enter` | Confirm / open selected |
| `Tab` | Auto-complete in prompt |
| `?` | Show help |

## Home screen

When you launch `spinosa`, the home screen shows:

- **Recent workspaces** — up to 4 recently accessed workspaces. Click one to open it.
- **Chat prompt** — at the bottom. Type your question and press Enter.
- **Boot health** — startup checks (version check, workspace index, maintenance)
- **Footer** — keyboard labels for Settings, Agents, Keys, Workspaces, Models

If no workspace is active, the chat prompt is empty. Select a workspace first, or create one.

## Workspace picker

Press `W` to open the workspace picker. It shows a sortable table:

| Column | Description |
|--------|-------------|
| Name | Workspace name |
| Parent | Parent folder path |
| Status | Current setup status |
| Ver | Framework version |
| Accessed | Last access time |

Click column headers to sort. Use `↑` `↓` to navigate and `Enter` to open. The **+ New workspace** button starts the onboarding wizard.

Stale workspace entries (pointing to deleted folders) can be cleaned up with the **Delete stale** button in the top header.

## Chat session

When you open a workspace or start a new session, you enter the chat view:

- Type your question at the prompt and press `Enter`
- Spinosa agents search your documents, draft a report, and verify the evidence
- Reports are displayed inline with evidence quotes, source paths, and verification status
- Use `↑` `↓` to scroll through the conversation
- Ask follow-up questions in the same chat

## Onboarding wizard

The onboarding wizard creates a new workspace from a folder of documents. Steps:

1. **Path** — Enter the folder path with your documents
2. **Name** — Name the workspace
3. **Tools** — Verify document converters are installed
4. **Scan** — Classifies files and shows what was found
5. **Import** — Choose which file types to import
6–9. **Processing** — Files are converted in phases
10. **Provider** — Choose your AI coding tool
11. **Done** — Summary and "Open workspace" button

Each processing phase pauses between steps so you can review before proceeding.

## Add-files wizard

Press `I` from the home screen to add files to an existing workspace. The wizard:

1. Asks for the source folder path
2. Scans and classifies files
3. Converts and copies them to the workspace's `raw/` directory
4. Shows an import summary

## Visualizer

The visualizer shows how your AI agents worked through a question. Open it from the workspace picker or top menu.

Three view modes:

| Mode | Key | What it shows |
|------|-----|---------------|
| **Files** | `1` | Heatmap of which files in the workspace were accessed |
| **Flow** | `2` | Graph of tool calls the agents made, in sequence |
| **Activity** | `3` | Timeline of the conversation |

Controls:

| Key | Action |
|-----|--------|
| `1` `2` `3` | Switch modes |
| `+` `-` | Zoom in/out |
| `0` | Fit graph to view |
| `←` `→` | Select marks/nodes |
| `Enter` | Inspect selected node details |
| `Shift` + arrows | Pan |
| Drag | Pan (mouse) |
| `Ctrl` + wheel | Zoom (mouse) |
| `e` | Export graph (SVG, CSV, JSON) |
| `?` | Show help overlay |

## Command palette

Press `Ctrl+P` or `/` to open the command palette. Type to filter commands:

- `/session` commands — switch, create new
- `/model` — switch model, cycle recent/favorite
- `/agent` — switch agent
- `/theme` — switch theme, mode
- `/workspace` — manage workspaces
- `/help` — show help

## Model provider

Press `K` to configure your AI model provider. You can connect to:

- Local models (via Ollama, oMLX)
- Cloud providers (OpenAI, Anthropic, Google, etc.)
- GitHub Copilot

Press `M` to switch between configured models.
