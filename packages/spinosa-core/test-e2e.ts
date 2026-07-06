/**
 * E2E test: exercises the new TypeScript pipelines against TEST-VAULT.
 * Run: bun run packages/spinosa-core/test-e2e.ts
 */
import { existsSync, rmSync, mkdirSync, readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { scanSource } from "./src/scan/scanner"
import { ImportBatchManager } from "./src/import/batch"
import { classifySourceFile } from "./src/extension/classifier"
import { copySource } from "./src/import/pipeline"
import { fileExt } from "./src/constants"

const TEST_VAULT = "/Users/tommasoprinetti/Downloads/TEST-VAULT"
const OUTPUT = "/tmp/spinosa-core-e2e-test"

function log(msg: string) { console.log(`  ${msg}`) }
function pass(msg: string) { console.log(`  ✓ ${msg}`) }
function fail(msg: string) { console.log(`  ✗ ${msg}`) }
function heading(msg: string) { console.log(`\n${msg}`) }
function separator() { console.log(`  ${"=".repeat(50)}`) }

let passed = 0
let failed = 0
function assert(label: string, ok: boolean) {
  if (ok) { pass(label); passed++ }
  else { fail(label); failed++ }
}

// Clean and prepare output dir
if (existsSync(OUTPUT)) rmSync(OUTPUT, { recursive: true })

// ════════════════════════════════════════════════════════════════
heading("1. File Classification")
// ════════════════════════════════════════════════════════════════

const testFiles: [string, string][] = [
  ["Ex2-harvesting-tasks/Markdowns/COHORT1/COHORT1_EX2_CLARA_PAGE16.md", "native"],
  ["Ex2-harvesting-tasks/Audio/COHORT2/COHORT2_2025_02_14_EX2.mp3", "audio"],
  ["Ex2-harvesting-tasks/Videos/COHORT3/COHORT3_2025_10_09_EX2.mp4", "video"],
  ["Ex2-harvesting-tasks/Scan_images/COHORT1/COHORT1_EX2_CLARA_PAGE16.jpg", "ocr_convertible"],
  ["generic-files/Configuration-works.pdf", "markitdown"],  // PDF: now async classify detects text-based
  ["generic-files/WORKING_HYPE.docx", "markitdown"],
  ["generic-files/dc_and_marvel_film_titles.csv", "markitdown"],
]

for (const [relPath, expected] of testFiles) {
  const full = path.join(TEST_VAULT, relPath)
  const cls = await classifySourceFile(full)
  const ok = cls === expected
  assert(`classifySourceFile(${path.basename(relPath)}) → ${cls}`, ok)
}

// ════════════════════════════════════════════════════════════════
heading("2. Source Scanner")
// ════════════════════════════════════════════════════════════════

const batches = new ImportBatchManager()
const scanResult = await scanSource(TEST_VAULT, batches)
separator()
log(`Scanned ${TEST_VAULT}`)
log(`  Total files:         ${scanResult.total}`)
log(`  Markdown (to rename): ${scanResult.markdown}`)
log(`  Native (.md):         ${scanResult.native}`)
log(`  MarkItDown:           ${scanResult.markitdown}`)
log(`  OCR/images:           ${scanResult.ocrConvertible}`)
log(`  Binary copyable:      ${scanResult.binaryCopyable}`)
log(`  Video:                ${scanResult.video}`)
log(`  Audio:                ${scanResult.audio}`)
log(`  Unknown:              ${scanResult.unknown}`)
log(`  Ignored:              ${scanResult.ignored}`)
separator()

assert("Scanner found total > 0", scanResult.total > 0)
assert("Scanner found native .md files", scanResult.native > 0)

// ════════════════════════════════════════════════════════════════
heading("3. Import Batch Manager")
// ════════════════════════════════════════════════════════════════

const selectedLabel = batches.selectedExtensionsLabel()
log(`  Selected: ${selectedLabel || "(none)"}`)
log(`  Batches:  ${batches.batches.map(b => `.${b.ext}:${b.count}`).join(", ")}`)
assert("Batches have records", batches.batches.length > 0)
assert("Selected count > 0", batches.selectedCount() > 0)

// ════════════════════════════════════════════════════════════════
heading("4. Copy Pipeline")
// ════════════════════════════════════════════════════════════════

const rawDir = path.join(OUTPUT, "raw")
mkdirSync(rawDir, { recursive: true })

log(`Copying to ${rawDir}...`)
const copyResult = await copySource(TEST_VAULT, rawDir, {
  markitdownChoice: true,
  ocrChoice: false,
  batchManager: batches,
  onProgress: (phase, curr, total, rel) => {
    if (curr === total) log(`  ${phase}: ${curr}/${total}`)
  },
})

separator()
log(`Copy complete:`)
log(`  Copied:     ${copyResult.copied}`)
log(`  Skipped:    ${copyResult.skipped}`)
log(`  Failed:     ${copyResult.failed}`)
log(`  MD Convert: ${copyResult.mdConverted}`)
log(`  MD Skip:    ${copyResult.mdSkipped}`)
log(`  OCR Conv:   ${copyResult.ocrConverted}`)
log(`  OCR Skip:   ${copyResult.ocrSkipped}`)
log(`  Total:      ${copyResult.totalCopied}`)
separator()

assert("Copied some files", copyResult.copied > 0)
assert("No failures", copyResult.failed === 0)

// ════════════════════════════════════════════════════════════════
heading("5. Frontmatter Injection Verification")
// ════════════════════════════════════════════════════════════════

let fmOk = 0
let fmFail = 0
function walkFm(dir: string) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkFm(full)
    else if (entry.name.endsWith(".md")) {
      const content = readFileSync(full, "utf-8")
      if (content.startsWith("---\n")) fmOk++
      else { fmFail++; log(`  Missing frontmatter: ${full}`) }
    }
  }
}
walkFm(rawDir)
assert("All .md files have frontmatter", fmFail === 0)
log(`  Files with frontmatter: ${fmOk}`)

// ════════════════════════════════════════════════════════════════
heading("6. Native Path Preservation Verification")
// ════════════════════════════════════════════════════════════════
// .md files should keep their relative paths
const mdPath = path.join(rawDir, "Ex2-harvesting-tasks/Markdowns/COHORT1/COHORT1_EX2_CLARA_PAGE16.md")
assert("Native .md path preserved", existsSync(mdPath))

// ════════════════════════════════════════════════════════════════
heading("7. Media File Copy Verification")
// ════════════════════════════════════════════════════════════════

const audioExists = existsSync(path.join(rawDir, "Ex2-harvesting-tasks/Audio/COHORT2/COHORT2_2025_02_14_EX2.mp3"))
const videoExists = existsSync(path.join(rawDir, "Ex2-harvesting-tasks/Videos/COHORT2/COHORT2_2025_02_14_EX2.mp4"))
assert("Audio file copied", audioExists)
assert("Video file copied", videoExists)

// ════════════════════════════════════════════════════════════════
heading("RESULTS")
// ════════════════════════════════════════════════════════════════
separator()
const total = passed + failed
const pct = total > 0 ? Math.round(passed / total * 100) : 0
log(`  Passed: ${passed}/${total} (${pct}%)`)
if (failed > 0) log(`  Failed: ${failed}`)
separator()

// Cleanup
rmSync(OUTPUT, { recursive: true })

process.exit(failed > 0 ? 1 : 0)
