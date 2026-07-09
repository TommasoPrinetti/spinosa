## update.ts — full file audit

packages/tui/src/spinosa-core/commands/update.ts:143-337:export async function updateWorkspace | impact:high | category:over
UpdateWorkspace orchestrator uses 5 numbered phases (1/2/3/5) with a missing phase 4. Phase 2 handles both ADD and REPLACE (but is a single for-loop). Phase 5 ("Regenerate manifest", "Update framework version", "Clean macOS metadata", "Record file checksums") bundles four unrelated post-sync steps. The phase numbering adds zero value — no reader anywhere consults phase identity beyond the onPhase callback. A simple sequence of commented steps without numbered phases would be clearer.

packages/tui/src/spinosa-core/commands/update.ts:138-141:sha256File | impact:medium | category:over
A 12-line struct (function sha256File + type FrameworkChecksums + readFrameworkChecksums + writeFrameworkChecksums + const CHECKSUMS_RELPATH + ~30 LOC of call-site logic at lines 180-181, 229-237, 313-327) for "replace_if_unmodified" SHA256 checksum tracking. Users never modify framework template files — they are `.spinosa/` manifests, config stubs, and scaffolded source files. The policy was designed to protect user edits that nobody will make against overwrites that would only happen on re-install. The entire checksum apparatus is speculative dead weight.

packages/tui/src/spinosa-core/commands/update.ts:97-112:filesMatch | impact:medium | category:over
filesMatch is a copy-on-write guard: compares mtime, then byte-content for files <1MB, then gives up for large files (returns true, effectively skipping the write). But safeCopy already implements retry-with-overwrite semantics including stream/rsync fallback. The filesMatch pre-check duplicates safeCopy's own idempotency — safeCopy already overwrites atomically and handles partial writes. Combined with the SHA256 checksum tracking above (lines 229-237), the code has three layers of change-detection before a write.

packages/tui/src/spinosa-core/commands/update.ts:97-112:filesMatch | impact:medium | category:dup
filesMatch at line 239 (inside the main loop) duplicates the work that safeCopy (line 255/217) does internally. safeCopy already checks whether the destination needs overwriting via its own retry-and-compare. The filesMatch check is a pre-filter that adds a second filesystem read-and-compare before safeCopy's own retry loop.

packages/tui/src/spinosa-core/commands/update.ts:162-172:version guard | impact:high | category:dup
The `frameworkVersion` + `readWorkspaceFrameworkVersion` + `compareFrameworkVersions` guard at lines 159-172 reimplements the same downgrade rejection that `install.sh:compare_versions` (line 759) provides. When the update logic is run from the TUI/CLI (not from install.sh), this guard is the only protection — but it is an exact semver comparison with the same prerelease-stripping logic as the bash version. Two implementations of the same policy, diverging on edge cases (what if one is undefined? what about the "dev"/"unknown" sentinel values?).

packages/tui/src/spinosa-core/commands/update.ts:308:isCloudStoragePath guard | impact:low | category:over
Line 308 guards `cleanMacMetadata` behind `!isCloudStoragePath(workspacePath)`. But `cleanMacMetadata` (fs.ts:186) already skips filesystem errors silently and only removes `.DS_Store`/`._*` files that are macOS metadata artifacts — these are harmless regardless of cloud storage. The guard adds complexity for a trivial filesystem sweep that already handles its own failures.

packages/tui/src/spinosa-core/commands/update.ts:214-218 vs 252-256:copyDirContents + safeCopy | impact:low | category:dup
Two separate copy functions for the ADD path (lines 214-218) and the REPLACE path (lines 252-256), each with identical branching: `if s.isDirectory() -> copyDirContents else -> safeCopy`. The code is structurally duplicated — both branches could call one local helper.

packages/tui/src/spinosa-core/commands/update.ts:116-136:CHECKSUMS_RELPATH / readFrameworkChecksums / writeFrameworkChecksums | impact:medium | category:dead
The entire checksum tracking subsystem (const + type + two file I/O functions) exists solely for the `replace_if_unmodified` policy that nobody triggers in practice. The stored checksums file at `.spinosa/framework-checksums.json` persists across updates but no other code reads or validates it.

packages/tui/src/spinosa-core/commands/update.ts:98-108:filesMatch large-file shortcut | impact:low | category:stdlib
filesMatch has a baked-in 1MB threshold below which it byte-compares, above which it returns true (files match, skip write). This is a homegrown heuristic replacing what `xxhash`/`md5`/a streaming hash or journalctl-level change detection would do. The arbitrary 1MB cutoff means large files never actually get change-checked — they're always assumed unchanged, so a user edit to a large template file is silently skipped.

packages/tui/src/spinosa-core/commands/update.ts:11:import { safeCopy, copyDirContents, cleanMacMetadata, isCloudStoragePath } | impact:low | category:solidjs
Per the assignment scope: no SolidJS JSX in this file — it's a plain TS module. No solidjs pattern violations found.
