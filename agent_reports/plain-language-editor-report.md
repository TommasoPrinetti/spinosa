# Plain Language Editor — Position Paper

## 1. Worst Offenders (Ranked by Readability)

Reading these strings feels like decoding a developer's brain dump. Here's my hit list, worst first:

| Rank | String | Why It Flunks |
|------|--------|---------------|
| 1 | `"Sync agent and skill mirrors from canonical"` | Three jargon nouns stacked. Zero verbs that mean something. A researcher sees "agent," "skill mirrors," "canonical" — three words they must decode before reaching meaning. |
| 2 | `"Archive contains path traversal entries — aborting for safety"` | "Path traversal" is a security concept. To a researcher archiving data, this reads as nonsense followed by panic. |
| 3 | `"Framework checksum mismatch — aborting for safety"` | "Checksum" is pure developer jargon. The researcher thinks "did my files get corrupted?" No — it's a version check. Say that. |
| 4 | `"Preferred LLM CLI"` | Three uppercase acronyms in a row. The middle one (LLM) is the only word carrying meaning, and it's buried. |
| 5 | `"Running smoke test..."` | Engineers know this. Researchers hear "is something on fire?" |
| 6 | `"Found stray shim at /path"` | "Stray" (had a mind of its own?) + "shim" (hardware?). Two jargon words. |
| 7 | `"Sidecars written: N"` | A sidecar is a motorbike attachment. In software? No idea. |
| 8 | `"Cleaning stale mirrors..."` | Stale = food. Mirrors = glass. Neither helps. |
| 9 | `"Environment preflight"` | Aviation. We are not in a cockpit. |
| 10 | `"Detected handoff targets: Claude Code, Codex, OpenCode"` | "Handoff" is a sports metaphor. "Targets" is military. Combined: confusing. |

## 2. Concrete Before/After Rewrites (28 strings)

### HELP TEXT

| Before | After |
|--------|-------|
| `Sync agent and skill mirrors from canonical` | `Copy the latest agent and skill files from the main source` |
| `Validate workspace integrity and configuration` | `Check that the workspace is set up correctly` |
| `Run onboarding on an existing workspace` | `Set up an existing workspace for first use` |

### INFO

| Before | After |
|--------|-------|
| `Detected handoff targets: Claude Code, Codex, OpenCode` | `Found tools that can receive work: Claude Code, Codex, OpenCode` |
| `Environment preflight` | `Checking the environment` |
| `Found stray shim at /path` | `Found an old link at /path` |
| `Sidecars written: N` | `Support files written: N` |
| `Cleaning stale mirrors...` | `Removing old copies...` |
| `Running smoke test...` | `Running a quick check...` |
| `MarkItDown available for Office docs, EPUB, HTML, and text-based PDFs` | `Document reader available for Office files, EPUB, HTML, and text PDFs` |

### PROMPTS

| Before | After |
|--------|-------|
| `Preferred LLM CLI` | `Which AI tool do you use on the command line?` |
| `Cannot read from terminal. Use --yes to skip prompts.` | `Cannot read your input. Add --yes to skip prompts.` |

### MENU

| Before | After |
|--------|-------|
| `Sync agents` | `Update agent files` |
| `Created shim: /path` | `Created link: /path` |

### OK / SUCCESS

| Before | After |
|--------|-------|
| `System health check passed` | `System check passed` |
| `All mirrors up to date.` | `All files are current.` |
| `Validation passed.` | `Everything looks good.` |

### WARNINGS

| Before | After |
|--------|-------|
| `MarkItDown not available — skipping MarkItDown pass` | `Document reader not installed — skipping document processing` |
| `Your modified framework files stay unchanged. The release copy is written beside each one as .spinosa-new.` | `Your modified files were kept as-is. The new version was saved beside each one with a .spinosa-new suffix.` |
| `Some mirrors are out of date` | `Some files are out of date` |

### ERRORS

| Before | After |
|--------|-------|
| `Framework checksum mismatch — aborting for safety` | `The framework version does not match — stopping to avoid problems` |
| `Archive contains path traversal entries — aborting for safety` | `The archive contains file paths that go outside the target folder — stopping for safety` |
| `Failed to validate agent manifest` | `Could not read the agent setup file` |
| `Cannot write to destination — permission denied` | (Keep — this one is clear) |

## 3. Mini Style Guide: 5 Rules for spinosa Strings

### Rule 1: One verb per sentence. One idea per sentence.
**Bad:** "Sync agent and skill mirrors from canonical to ensure workspace integrity."
**Good:** "Copy the latest agent files from the main source."

### Rule 2: No stacked nouns.
If three nouns appear in a row, you lost the reader. Insert prepositions. "Agent mirror sync" → "Sync of agent files."

### Rule 3: Replace metaphors with literal language.
"Health check," "preflight," "smoke test," "stale," "mirror," "sidecar," "shim," "handoff" — every one of these is a metaphor. The reader must first recognize the metaphor, then map it to the real concept, then act. Skip the first two steps.

### Rule 4: Drop the first acronym in any string.
Compound acronyms ("LLM CLI") build a wall. Write the full phrase once, then maybe abbreviate. Better yet: just say what the thing does. "AI tool" beats "LLM CLI."

### Rule 5: Warnings say what happened and what to do. Errors say what happened and what it means.
- Warning: "Document reader not installed. Install it with: pip install markitdown."
- Error: "The framework version does not match. Run 'spinosa update' to fix this."

Errors that only say what happened ("aborting for safety") leave the researcher stranded. Always include the next step or the consequence in plain words.

## 4. What I Need From Teammates

- **Text Surveyor**: Confirmed list of every CLI flag, option name, and internal command name that must stay as-is (cannot rename). I need to know where my rewrite scope ends.
- **Jargon Hunter**: A ranked list of the 5 terms researchers reported as most confusing — I'll rewrite those first.
- **User Advocate**: Show me 3 real researcher personas. I need to know if "AI tool" is clear enough or if I need "AI assistant" or "language model" for the non-technical audience.
- **Tone Architect**: Confirm my active-voice, no-metaphor stance is consistent with the voice guide. If not, tell me where I'm overstepping.
