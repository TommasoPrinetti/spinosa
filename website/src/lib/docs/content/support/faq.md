# FAQ

Support-first answers for when setup, indexing, reports, or maintenance are not behaving the way you expect.

## Install and command issues

**Command not found: `spinosa`**
Make sure `~/.spinosa/bin` is on your `PATH`, then open a new shell. If it still fails, re-run the install script.

**I installed Spinosa, but the startup prompt never appeared**
Run `spinosa new` again. The workspace creation step is what prints the startup prompt for your LLM tool.

**Which command should I try first when something feels wrong?**
Start with `spinosa check <workspace>`. It is the fastest way to surface missing files, broken paths, and configuration problems.

## Startup and indexing

**Startup seems stuck or takes too long**
Startup time depends on corpus size and file mix. If it has clearly stalled, re-run the startup prompt. Spinosa is designed to resume rather than start over blindly.

**The OCR output is garbled**
Check the original image or scanned PDF quality first. If the source is blurry, low-contrast, or skewed, OCR quality will drop with it. Replace the file and re-run intake or setup.

**Can I add more files after startup?**
Yes. Use `spinosa prepare <workspace>` or the source intake workflow. Spinosa will convert the new files and refresh the relevant workspace structures.

## Reports and evidence

**My question returned a fast-path answer instead of a full report**
Ask more explicitly for evidence from the corpus. Operational questions can be answered directly, while evidence requests trigger the full report pipeline.

**I see `○ pending` on a report**
The draft exists, but verification has not finished yet. Wait for the Verifier to complete before treating the answer as settled.

**The report says `⚠ corrections` or `✗ failed`**
Treat that as a real signal, not decoration. `⚠ corrections` means verification found issues but repaired them. `✗ failed` means important claims could not be supported reliably.

**I know the answer is in my files, but Spinosa found no evidence**
Rephrase the question using alternative wording, names, or dates. If the issue persists, inspect `system/dictionary.md` and consider re-running startup or `prepare` so the corpus can be re-indexed cleanly.

For report anatomy, statuses, and dashboard charts, use [Reports & Charts](/docs/reports).

## Workspace maintenance

**Can I edit files in `raw/`?**
Edit headers carefully if metadata needs fixing, but avoid rewriting source text bodies. The converted body is the evidence layer Spinosa quotes and verifies against.

**How do I update Spinosa?**
Use `spinosa upgrade` to update the CLI itself. Use `spinosa update <workspace>` when you need to refresh framework files inside an existing workspace.

**How do I clean up stale process files?**
Use the Janitor workflow. It proposes moves before anything is archived to `.trash/`.

**Can I uninstall without losing my workspace?**
Yes. `spinosa uninstall` removes the installed framework and leaves your workspace folders in place.

## Next reads

- [CLI Reference](/docs/cli-reference) for the exact commands mentioned here
- [Reports & Charts](/docs/reports) for verification states and report reading
- [Corpus Structure](/docs/corpus) for where configuration, dictionary, and report files live
- [Glossary](/docs/glossary) if a support term is unfamiliar
