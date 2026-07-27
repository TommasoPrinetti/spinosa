# Spinosa TUI — Product context

**Register:** Product (terminal tool UI). Not brand/marketing.

## Users

Researchers and analysts working from a **Spinosa workspace**: `raw/` sources, `maps/` navigation, and orchestrated agent routes (`g_*.md`, `NN_*.md`). They use a terminal for long sessions and switch between asking questions, checking corpus health, and tracking pipeline progress.

Secondary user: **Spinosa-only** mode — coding agent without a Spinosa workspace.

## Product purpose

Spinosa TUI is the control surface for corpus-grounded orchestration inside Spinosa:

1. Pick or create a workspace
2. Run startup/indexing when needed
3. Chat with the orchestrator (primary)
4. Monitor corpus coverage and route artifacts without leaving the terminal

The TUI bridges to `.bin/spinosa` where bash is the source of truth; the UI explains outcomes, not implementation paths.

## Primary task

**Ask a grounded question and trust the answer path** — Chat → session → verified report in Routes (`NN_*.md`). Corpus and Routes are situational awareness, not the main workflow.

| Pane | Job |
|------|-----|
| Chat (1) | Orchestrator conversation |
| Corpus (2) | Is the corpus indexed and healthy? |
| Routes (3) | Where is this goal? What report was delivered? |
| Settings (4) | Workspace config, framework maintenance, notes |

## Voice

- Direct, operational, corpus-native
- Plain terminal English — no SaaS hype
- User outcomes over mechanism — "Index this workspace" not "CLI bridge"
- Stable vocabulary: workspace, corpus, routes, goal artifact, report

## Anti-references

- Dashboard slop — metric cards, fake health scores
- Implementation leakage — `setup_status`, `cli_started`, script filenames in nav
- Cryptic chrome — `new Q`, `switch ws`
- Bold inflation and primary-colored chips everywhere
- Generic coding placeholders when a Spinosa workspace is ready
- Mouse-only navigation for core workspace actions
