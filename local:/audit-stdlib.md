## /Users/tommasoprinetti/Documents/spinosa-main/packages/tui/src/spinosa-core/utils/version.ts
version.ts:15-83:compareFrameworkVersions + parseComparableFrameworkVersion + comparePrereleaseTokens: ~70-line hand-rolled semver comparison with numeric prerelease prioritization, semver normalization, v-prefix stripping | impact:high | category:stdlib
version.ts:1-3:normalizeFrameworkVersion: Trivial trim + strip `v`/`V` prefix — `semver.clean()` or `semver.valid()` handles this | impact:low | category:stdlib
version.ts:10-13:isPrereleaseFrameworkVersion: Regex `/^\d+\.\d+\.\d+-.+$/` — `semver.prerelease()` returns non-null for prereleases | impact:low | category:stdlib
version.ts:43-59:parseComparableFrameworkVersion: Splits `"1.2.3-beta.1"` into `{core:[1,2,3], prerelease:["beta","1"]}` — `semver.parse()` or `new SemVer()` does this | impact:medium | category:stdlib

## /Users/tommasoprinetti/Documents/spinosa-main/packages/tui/src/spinosa-core/utils/fs.ts
fs.ts:113-138:safeCopyTree: Recursive directory copy with symlink handling — `fs.cpSync(src, dest, { recursive: true })` (Node 16.7+) or `fs.cp(src, dest, { recursive: true })` for async handles this directly | impact:high | category:stdlib
fs.ts:48-61:copyFileViaStream: Manual read/write/rename pattern for atomic copy — `copyFileSync` is already atomic (justified cloud-storage workaround but adds complexity) | impact:medium | category:stdlib
fs.ts:41-46:sleepMs: Busy-wait spin loop — `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)` (Node 16+ sync sleep) or `Bun.sleepSync(ms)` avoids CPU burn | impact:medium | category:over
fs.ts:63-89:safeCopy: Retry wrapper around `copyFileSync` with exponential backoff — plausible for cloud storage, but 90% of code paths just call `copyFileSync(src, dest)` in a loop with sleep | impact:low | category:over
fs.ts:140-156:rsyncCopyDirContents: Shells out to `rsync` binary — justified performance optimization, not a reimplementation | impact:low | category:dup

## /Users/tommasoprinetti/Documents/spinosa-main/packages/tui/src/spinosa-core/utils/path.ts
path.ts:4-7:resolveUserPath: `~` → homedir() + existsSync — `path.resolve("~/foo")` already expands `~` on Unix in Node, making this redundant | impact:medium | category:stdlib
path.ts:9-20:normalizePathInput: Strip surrounding quotes, unescape `\ ` — not a stdlib replacement, but thin custom utility | impact:low | category:over

## /Users/tommasoprinetti/Documents/spinosa-main/packages/tui/src/spinosa-core/utils/string.ts
string.ts:1-3:shellQuote: Single-quote shell escaping with `'\\''` substitution — `util.inspect` or child_process `shell: true` quoting already handles this | impact:low | category:dup
string.ts:9-16:formatBytes: Human-readable byte formatting (B/KB/MB/GB) — trivial, not a stdlib replacement | impact:low | category:over

## /Users/tommasoprinetti/Documents/spinosa-main/packages/tui/src/spinosa-core/extension/pdf.ts + pdf-js.ts
pdf.ts:40-65 & pdf-js.ts:60-79:isTextBasedPdf: NEAR-IDENTICAL binary buffer scanning for `/Encrypt`, `/Font`, `/CIDFont` markers — duplicated across both files (pdf.ts has no `%PDF-` header check, pdf-js.ts does; same search logic otherwise). pdfjs-dist already parses PDF structure from `getDocument()` | impact:high | category:dup
pdf.ts:72-74 & pdf-js.ts:106-108:searchBuffer: IDENTICAL `haystack.subarray(start, end).indexOf(needle) !== -1` — duplicated in both files when one import would suffice | impact:medium | category:dup
pdf.ts:10-65:pdfPageCount, pdfPageHasExtractableText, pdfTextPagesMeetThreshold: Thin try/catch wrappers around pdf-js.ts implementations with fallback to defaults — low value, silently swallows errors | impact:medium | category:over

## /Users/tommasoprinetti/Documents/spinosa-main/packages/tui/src/editor-zed.ts
editor-zed.ts:228-243:utf8ByteOffsetToStringIndex: Manual UTF-8 byte-offset-to-character-index tracking iterating char by char — `TextEncoder.encodeInto()` or `Buffer.byteLength(text, "utf8")` combined with slicing is simpler; also duplicates what `TextDecoder` APIs provide for the same encoding-decoding round | impact:medium | category:stdlib
editor-zed.ts:280-286:parseJson: Trivial JSON.parse try/catch wrapper for safe parsing — not a stdlib replacement | impact:low | category:over
editor-zed.ts:275-278:pathContains: `!relative.startsWith("..") && !path.isAbsolute(relative)` — thin utility using Node `path` stdlib, justified | impact:low | category:over

## Not found (no file watcher or tmp package reimplementations)
(No file-watching or temp-file-management reimplementations found — all usages use Node's native `mkdtempSync` and `os.tmpdir()` directly, which is correct practice and not flagged)
