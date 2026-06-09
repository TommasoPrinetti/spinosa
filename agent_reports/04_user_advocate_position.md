# User Advocate Position Paper — First-Time Researcher Experience

**Role:** User Advocate (Application)
**Date:** 2026-06-09
**Source:** `agent_reports/user_facing_strings_report.md` (310+ strings catalogued)
**Status:** Draft for task-force review

---

## 1. Analysis by String Category

### HELP TEXT / USAGE STRINGS
| String | Verdict | Why |
|--------|---------|-----|
| `Validate workspace integrity and configuration` | **confusing** | "Integrity" is moral/ethical vocabulary. User thinks: *Is my workspace corrupt? Immoral?* |
| `Sync agent and skill mirrors from canonical sources` | **blocking** | "Agent mirrors", "canonical sources" — three compound nouns with zero definition. User has no mental model for any of them. |
| `Run onboarding on an existing workspace` | **confusing** | "Onboarding" is HR-speak. User installed a research tool, not started a new job. |
| `Reports framework installation status, vendor engine availability, workspace discovery, and detected LLM CLIs.` | **confusing** | Four technical concepts in one sentence. "Detected LLM CLIs" assumes user knows what an LLM CLI is and that they need one. |
| `--gum / --no-gum` options | **blocking** | "Gum" is a TUI library. User has never heard of it. The flag name gives zero clue about what it controls. |

### PROMPTS / INTERACTIVE INPUT
| String | Verdict | Why |
|--------|---------|-----|
| `Corpus folder` | **confusing** | "Corpus" is linguistics/academic jargon. Researcher may not be from a field that uses this term. |
| `Preferred LLM CLI` | **confusing** | "LLM" (Large Language Model) and "CLI" (Command Line Interface) are both assumed knowledge. The phrase works for developers; a social sciences researcher will pause. |
| `Source folder (absolute path)` + example | **clear** | Example makes it work. Good pattern. |
| `Nothing in the original folder is moved, renamed, or edited.` | **clear** | Reassuring, specific, excellent. |
| `Toggle file types, then continue with the selected batches.` | **confusing** | "Batches" implies something is happening in groups, but user just sees file extensions. |

### INFO MESSAGES
| String | Verdict | Why |
|--------|---------|-----|
| `Environment preflight` | **blocking** | Aviation jargon. User pictures a pilot checklist. What is being checked? Why "preflight"? |
| `Detected handoff targets: <list>` | **blocking** | "Handoff" evokes a relay race or hospital shift change. User does not know they're about to pass something to an LLM. |
| `Running smoke test...` | **confusing** | Engineering term. Researcher thinks: *Is something on fire?* If they've heard it before, they still don't know what's being tested. |
| `Found stray shim at <path>` | **blocking** | "Shim" is pure developer vocabulary. A researcher's mental image: *a small piece of wood or metal?* |
| `Sidecars written: N` | **blocking** | Motorcycle metaphor. Not a research tool concept. |
| `MarkItDown Processing N files with MarkItDown...` | **confusing** | Internal project name shown without explanation. User doesn't know if this is a conversion, an upload, or an analysis step. |
| `OCR Processing N scanned images and PDFs with RapidOCR...` | **clear** | "OCR" is widely known. "scanned images and PDFs" explains what. Good pattern. |

### OK / SUCCESS MESSAGES
| String | Verdict | Why |
|--------|---------|-----|
| `System health check passed` | **confusing** | Vague. Passed *what*? What was checked? The `pilosa health` description at least lists items, but the success message does not. |
| `Check passed.` | **confusing** | What passed? User might think the *workspace* passed, but maybe it was something else. |
| `N workspace(s) discovered` | **confusing** | Where? How? Should say where they were found. |
| `Sync complete — N agents, skills mirrored to 3 platforms.` | **confusing** | "Mirrored to 3 platforms" — user doesn't know they have 3 sets of agent files. |
| `Workspace ready: <bold>path</bold>` | **clear** | Actionable. Tells user the thing is done and where it is. |
| `Update complete.` | **clear** | Simple, direct. |

### WARNINGS
| String | Verdict | Why |
|--------|---------|-----|
| `MarkItDown not available — skipping MarkItDown pass` | **confusing** | Two mentions of "MarkItDown" with no explanation of what it does or why it's missing. |
| `RapidOCR OCR not available — skipping OCR pass` | **confusing** | "RapidOCR OCR" is redundant. User sees "OCR" twice in a row. |
| `Select at least one file type to enable import.` | **clear** | Actionable. Tells user what to do. |
| `No file types are selected for import.` | **clear** | States the problem. |

### ERRORS
| String | Verdict | Why |
|--------|---------|-----|
| `Framework not found. Is Pilosa installed?` | **clear** | Problem + possible cause. |
| `Not a valid Pilosa workspace: <path>` | **clear** | Tells user the path is wrong. |
| `Cannot read from terminal. Use --yes to skip prompts.` | **clear** | Problem + solution. This is the gold standard for error messages. |
| `Release manifest missing from archive` | **confusing** | "Manifest" is internal. User doesn't know what a release manifest is. |

### INSTALLER
| String | Verdict | Why |
|--------|---------|-----|
| `Running smoke test...` | **confusing** | Same issue as info messages. |
| `Created shim: <path>` | **blocking** | "Shim" is opaque. Say "Created launcher script" or "Added pilosa command". |
| `Smoke test passed` | **confusing** | What passed? What was tested? |
| `Smoke test failed — pilosa may need PATH update` | **confusing** | "Smoke test" + "PATH" — two technical terms. User may not know PATH is the shell's lookup list. |
| `Pilosa installed successfully!` | **clear** | Strong, positive, unambiguous. |
| `Added <path> to <file>` | **confusing** | Added *what* to *what*? User sees a path and a filename. Say "Added pilosa to your PATH in <file>". |

### CONFIRMATIONS
| String | Verdict | Why |
|--------|---------|-----|
| `Remove Pilosa from this system?` | **clear** | Direct, understandable. |
| `Apply sync? (deletes and regenerates vendor agent files)` | **confusing** | "Vendor agent files" — what are those? |
| `Search your home directory for existing Pilosa workspaces?` | **clear** | Good — explains scope. |
| `Nothing leaves your computer — no data is uploaded, stored, or shared.` | **clear** | Excellent reassurance. |

---

## 2. Top 10 Things That Confuse or Slow Down a First-Time Researcher

Ranked by impact (1 = most confusing):

1. **"Shim"** — Appears in installer output (`Created shim:`). Zero-meaning to anyone outside systems programming. They will google it, find hardware shims, and be more confused.

2. **"Agent mirrors" / "Canonical sources"** — The `pilosa sync` command is the most jargon-dense string in the entire CLI. Three completely opaque concepts chained together.

3. **"LLM CLI"** — This appears in the prompt `Preferred LLM CLI`. A researcher who is not a developer will not know:
   - What LLM stands for (assumes knowledge)
   - What CLI stands for (assumes knowledge)
   - That they need one of these to use the tool (critical missing information)
   - The README explains this, but the interactive prompt does not.

4. **"Handoff"** — "Detected handoff targets", "handoff action", "startup handoff". The metaphor is passing a baton. But the user doesn't know what is being handed off, to whom, or why.

5. **"Sidecar"** — "Sidecars written: N". Even if you explain it, the metaphor is from Kubernetes (and motorcycles). A file that sits beside another file is a "backup" or "companion file".

6. **"Preflight"** — Aviation jargon. The user sees "Environment preflight" and doesn't know what checks are running or whether they should care.

7. **"Smoke test"** — While somewhat known in tech, "Running smoke test..." is alarming. It sounds like a test for *smoke* (fire). Worse: "Smoke test failed" — what now?

8. **"Corpus"** — "Corpus folder". This is academic, but not universal across research fields. A historian might say "archives", a journalist says "sources", a scientist says "data".

9. **"Onboarding"** — Used as a command name (`pilosa onboard`, `Run onboarding`). HR term. The actual action is "preparing your workspace" or "setting up your research folder". The disconnect causes hesitation.

10. **"Gum"** — `--gum` / `--no-gum`. An opaque flag name referencing a third-party library. User has no way to guess what it means. Even the help text doesn't explain it (just says "Use interactive Gum prompts" — which assumes they know Gum).

### Honorable mentions
- `"MarkItDown"` — branded internal name shown raw. Explainable in context (it converts Office docs to Markdown), but the name alone says nothing.
- `"Framework"` — means three things (the CLI, the release artifact, and the paradigm). This overload creates confusion even for experienced users.
- `"Integrity"` (in `check` command) — moral-sounding word for what is actually a structural/consistency check.

---

## 3. Recommendations — Replacements for Every Blocking/Confusing String

### HELP TEXT

| Current | Replacement | Rationale |
|---------|-------------|-----------|
| `Validate workspace integrity and configuration` | `Check that your workspace structure is complete and working` | Action-oriented, no jargon |
| `Sync agent and skill mirrors from canonical sources` | `Update agent files for your AI tools from the master copies` | "Master copies" vs "canonical", "AI tools" vs "agents" |
| `Run onboarding on an existing workspace` | `Prepare an existing workspace for research` | "Prepare" is a real action; "onboarding" is corporate jargon |
| `Reports framework installation status...` | unclear | Break into: "Check that Pilosa is installed, find your workspaces, and detect available AI assistants" |
| `--gum  Use interactive Gum prompts` | `--gum  Use arrow-key menus (requires Gum)` | And change flag to something else eventually |

### PROMPTS

| Current | Replacement | Rationale |
|---------|-------------|-----------|
| `Corpus folder` | `Source folder (with your research materials)` | Use consistent term "source folder" which is already used elsewhere |
| `Preferred LLM CLI` | `Preferred AI assistant` | Or: "Which AI coding tool do you use?" with explanation that you need one installed. Add a `note()` saying what an LLM CLI is. |
| `Toggle file types, then continue with the selected batches.` | `Select which file types to import, then continue.` | Simpler, clearer |

### INFO MESSAGES

| Current | Replacement | Rationale |
|---------|-------------|-----------|
| `Environment preflight` | `Checking environment...` | Simple, no metaphor |
| `Detected handoff targets: <list>` | `Detected available AI assistants: <list>` | "Handoff targets" → "available AI assistants" |
| `Running smoke test...` | `Verifying installation...` | Or just show the actual checks being done |
| `Found stray shim at <path>` | `Found leftover launcher at <path>` | Not perfect, but "shim" must go |
| `Sidecars written: N` | `Backup copies written: N` | Or "Companion files written: N" |
| `MarkItDown Processing N files with MarkItDown...` | `Converting N files to Markdown...` (mention MarkItDown only in a note or tooltip) | Action-first, tool second |

### OK MESSAGES

| Current | Replacement | Rationale |
|---------|-------------|-----------|
| `System health check passed` | `All checks passed:` then list what was checked | Show the results, not just a label |
| `Check passed.` | `Workspace check passed.` (or `Workspace structure looks good.`) | Specify *what* passed |
| `Sync complete — N agents, skills mirrored to 3 platforms.` | `Update complete. Agent files synced for your AI tools.` | Plain language |
| `N workspace(s) discovered` | `Found N workspace(s): <path1>, <path2>` | Show paths so user can verify |

### WARNINGS

| Current | Replacement | Rationale |
|---------|-------------|-----------|
| `MarkItDown not available — skipping MarkItDown pass` | `Office doc converter not available — will skip Office, HTML, and EPUB files` | Explain what gets skipped in user terms |
| `RapidOCR OCR not available — skipping OCR pass` | `OCR scanner not available — will skip scanned PDFs and images` | User knows "OCR" better than "RapidOCR" |

### INSTALLER

| Current | Replacement | Rationale |
|---------|-------------|-----------|
| `Running smoke test...` | `Verifying pilosa works...` | Explains what is being tested |
| `Created shim: <path>` | `Added pilosa command to: <path>` | "Shim" → "command" |
| `Smoke test passed` | `pilosa works correctly.` | Action confirmed in plain terms |
| `Smoke test failed — pilosa may need PATH update` | `The 'pilosa' command didn't work yet. Adding it to your PATH should fix this.` | "PATH" is still techy but at least it says *what* is happening |
| `Added <path> to <file>` | `Updated PATH in <file>` | Or "Added pilosa to your PATH in <file>" |

### CONFIRMATIONS

| Current | Replacement | Rationale |
|---------|-------------|-----------|
| `Apply sync? (deletes and regenerates vendor agent files)` | `Update agent files for your AI tools? Existing ones will be replaced.` | "Vendor agent files" is opaque |

---

## 4. What I Want From Teammates

### To the **Jargon Hunter** (Critique):

You flagged 28 jargon terms — I endorse all of them. But I need your verdict on two that I'm on the fence about:

1. **"LLM CLI"** — I call this confusing/blocking. But maybe the README already handles it (it does: "actually using the workspace requires one of these LLM CLIs"). My concern is the **interactive prompt** `Preferred LLM CLI` shows up *after* installation, when the user may not have read the README carefully. Can we make the prompt self-contained? Should it link to a help topic? Or change the label entirely?

2. **"Agent"** — You flagged this. Help me understand: is "AI agent" a widely recognized enough term for researchers in 2026? Or does it still sound like a spy/secret agent to most people? If we need to replace it, what's the best alternative — "AI tool", "assistant", "specialist"?

### To the **Text Surveyor** (Exploration):

Can you confirm the full list of places where "LLM", "CLI", and "LLM CLI" appear in user-facing prompts (not help text)? I need to know if the problem is one prompt or a pervasive pattern. Specifically lines 2102, 2590, 4114, and anywhere in the interactive flow.

Also: where is "handoff" first introduced to the user? I need the earliest point in the user journey where they encounter this term.

### To the **Tone Architect** (Integration):

You're building the voice guide. My request: wherever we replace jargon, make sure the replacement respects two constraints:
- **No cute metaphors** (no "batons", "pilots", "vehicles", "kitchens")
- **No moral vocabulary** (no "integrity", "health", "clean")
- Prefer **observable actions**: what actually happens to the user's files and data

Example: "Sync agent and skill mirrors from canonical sources" → "Update the instruction files your AI assistant uses" — it's longer but it's honest and descriptive.

### To the **Plain Language Editor** (Specialization):

I've proposed replacements above, but I'm not a plain-language specialist. Can you review these and push harder where I've kept residual jargon (especially "PATH", "AI assistant", "Markdown")? Some of these may be acceptable jargon (common knowledge for the target audience). I want you to call out where I've been too soft.

---

## Appendix: Decision Criteria

Every replacement in section 3 was judged against three questions:

1. **Would a first-time user understand this on first read?** (No secondary reading, no googling)
2. **Does it describe an observable action or state?** (Instead of a metaphor or internal concept)
3. **If it introduces jargon, is it clearly inescapable?** (Some terms like "PATH" and "Markdown" may be inescapable — but they should be explained adjacent to first use)

Strings that pass all three are marked "clear". Strings that fail any are "confusing". Strings that fail two or three are "blocking".
