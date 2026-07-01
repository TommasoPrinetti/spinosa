# FAQ

## Startup & setup

**Startup seems stuck or takes too long. What do I do?**
Startup time depends on corpus size. A typical corpus (50-100 files) takes 5-15 minutes. If it's been over 30 minutes, check that `setup_status` in `system/configuration.md` is `cli_started` (not `not_started`). If the startup command failed midway, just re-run the startup prompt — it resumes from where it stopped.

**The OCR output is garbled. Can I fix it?**
OCR works best on clear, high-resolution images. If text comes out jumbled, check the original image quality. You can replace the file and re-run source intake. Some garbled text is expected — the dictionary marks these as "machine artifacts" so agents know to treat them cautiously.

**Can I add more files after startup?**
Yes. Spinosa has a source intake workflow that converts new files, generates headers, and updates navigation maps. Trigger the intake workflow from your LLM tool.

## Using the workspace

**Can I edit my source files in `raw/`?**
You can edit YAML headers (the metadata block at the top of each file), but don't edit the document bodies. The body is your original source — editing it breaks the chain of evidence. If your original source changes, replace the file and re-index.

**Can I use external sources (websites, articles)?**
Only with explicit researcher authorization. By default, Spinosa works exclusively with files you've provided. If you need external sources, set `external_sources_allowed: yes` in `system/configuration.md` first.

**How do I ask a question?**
 In plain language, directly to your LLM tool. "Find all mentions of X in the Y interviews." "Compare what group A said about Z vs group B." "Summarize the key findings about W." The orchestrator either answers directly on `fast_path` or writes a goal artifact and dispatches a non-fast-path chain through sub-agents.

**My question got a fast-path answer instead of a full report. Why?**
Some questions are operational — "what's in my corpus?", "how do I add files?" — and get answered directly without the full sub-agent pipeline. If you want a full evidence-grounded report, be explicit: "Find evidence for X in my sources."

## Reports & verification

**The Verifier says "unsupported." Does that mean my report is wrong?**
"Unsupported" means the source file exists but doesn't contain the claimed content — the Searcher may have misread a passage. The Verifier flags it so the Writer can correct it. The final report will either drop that claim or mark it corrected. Check the report status badge for the overall verdict.

**What does `◐◐◐◐◐◐◐◐◑░░░░░░░ 75%` mean?**
That's a gauge chart. The filled half-circles show a percentage. 75% filled = 75% healthy. In a Janitor report, it means 75% of files are in good shape and 25% may need attention.

**I see `○ pending` on my report. What's happening?**
The Writer has finished composing, but the Verifier hasn't checked it yet. Wait a moment — verification runs automatically after writing. The status will update to `✓`, `⚠`, or `✗`.

**Can I get a report regenerated?**
Yes. Ask the same question again, or refine it. Each question is a new dispatch.

## Maintenance

**How do I update Spinosa?**

Two commands — different scopes:

1. **`spinosa upgrade`** — updates the **CLI** (global install under `~/.spinosa/`). Your workspace folders are not modified.
2. **`spinosa update`** — updates **framework files inside a workspace** (agents, docs templates, `.bin/`, vendor mirrors). Your `system/context.md`, `dictionary.md`, and `raw/` corpus are preserved per manifest policy.

After upgrading the CLI, run `spinosa update` on each workspace (Spinosa prompts you after upgrade). Then run **`spinosa doctor`** to check version alignment.

**Hermes:** after `spinosa update`, merge `.hermes/workspace.config.yaml` into `~/.hermes/config.yaml`.

**Cloud storage:** if your workspace is on Google Drive or similar, ensure files are synced locally before `spinosa update`.

**How do I clean up old files?**
Run the Janitor agent. It scans for stale files, broken links, and outdated reports, then presents a cleanup proposal. You confirm before anything moves to `.trash/`.

**Can I uninstall?**
`spinosa uninstall` removes the CLI and framework runtime files. Your workspace folders are left in place, and `~/.spinosa/metadata/` remains so a future reinstall can reuse remembered workspace paths and configuration.

## Troubleshooting

**Command not found: spinosa**
The CLI shim lives in `~/.local/bin` by default. The installer adds it to your shell config and writes `~/.spinosa/env.sh`. After `curl | bash`, reload your shell (`source ~/.zshrc` on macOS, or `source ~/.spinosa/env.sh`) or open a new terminal — the pipe runs install in a subshell, so your parent shell does not inherit PATH. If needed: `export PATH="$HOME/.local/bin:$PATH"` or re-run the install script.

**The LLM tool can't find my workspace**
Make sure you ran the startup prompt that `spinosa new` printed. The prompt includes the workspace path. If you closed the terminal, re-run with the workspace folder as the argument.

**I get "no evidence found" for something I know is in my files**
Try rephrasing your question using different terms. Check if the dictionary includes your key terms — if not, the corpus may not have been fully indexed. Re-run startup if needed.
