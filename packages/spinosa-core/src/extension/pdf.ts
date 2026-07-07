import { spawn } from "node:child_process"
import { readFileSync } from "node:fs"

function execCapture(
  cmd: string,
  args: string[],
  input?: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: input ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    child.stdout?.on("data", (d: Buffer) => {
      stdout += d.toString()
    })
    child.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString()
    })
    child.on("close", (code) => {
      if (code === 0) resolve(stdout.trim())
      else reject(new Error(`${cmd} exited ${code}: ${stderr.trim()}`))
    })
    child.on("error", (e: Error) => reject(e))
    if (input) child.stdin?.end(input)
  })
}

async function tryPdfinfo(pdfPath: string): Promise<number | null> {
  try {
    const out = await execCapture("pdfinfo", [pdfPath])
    const m = out.match(/^Pages:\s*(\d+)/m)
    if (m) {
      const n = Number.parseInt(m[1], 10)
      if (n > 0) return n
    }
  } catch { /* pdfinfo not available or failed — fall through */ }
  return null
}

async function tryPypdf(pdfPath: string): Promise<number | null> {
  try {
    const out = await execCapture("python3", [
      "-c",
      "from pypdf import PdfReader; import sys; print(len(PdfReader(sys.argv[1]).pages))",
      pdfPath,
    ])
    const n = Number.parseInt(out, 10)
    if (n > 0) return n
  } catch { /* pypdf not available or failed — fall through */ }
  return null
}

export async function pdfPageCount(pdfPath: string): Promise<number> {
  const fromInfo = await tryPdfinfo(pdfPath)
  if (fromInfo !== null) return fromInfo

  const fromPy = await tryPypdf(pdfPath)
  if (fromPy !== null) return fromPy

  return 1
}

export async function pdfPageHasExtractableText(
  pdfPath: string,
  page: number,
): Promise<boolean> {
  try {
    const out = await execCapture("pdftotext", [
      "-f",
      String(page),
      "-l",
      String(page),
      "-q",
      pdfPath,
      "-",
    ])
    const stripped = out.replace(/\s/g, "")
    return stripped.length > 0
  } catch {
    return false
  }
}

export async function pdfTextPagesMeetThreshold(
  pdfPath: string,
  pageCount: number,
): Promise<boolean> {
  const pc = Math.max(1, Math.floor(pageCount))

  if (pc === 1) return pdfPageHasExtractableText(pdfPath, 1)
  if (pc === 2) {
    const [a, b] = await Promise.all([
      pdfPageHasExtractableText(pdfPath, 1),
      pdfPageHasExtractableText(pdfPath, 2),
    ])
    return a && b
  }

  const mid = Math.floor((pc + 1) / 2)
  const last = pc
  const results = await Promise.all([
    pdfPageHasExtractableText(pdfPath, 1),
    pdfPageHasExtractableText(pdfPath, mid),
    pdfPageHasExtractableText(pdfPath, last),
  ])
  const hits = results.filter(Boolean).length
  return hits >= 2
}

export async function isTextBasedPdf(pdfPath: string): Promise<boolean> {
  if (fileExt(pdfPath) !== "pdf") return false

  let header: Buffer
  try {
    header = readFileSync(pdfPath, { flag: "r" })
  } catch {
    return false
  }

  // Tier 1: Reject encrypted PDFs
  if (searchBuffer(header, Buffer.from("/Encrypt"), 0, header.length)) {
    return false
  }

  // Tier 2: Quick scan first 256 KB for /Font or /CIDFont
  const quickLen = Math.min(header.length, 262144)
  if (
    searchBuffer(header, Buffer.from("/Font"), 0, quickLen) ||
    searchBuffer(header, Buffer.from("/CIDFont"), 0, quickLen)
  ) {
    return true
  }

  // Tier 3: Full scan for font dictionaries
  if (
    searchBuffer(header, Buffer.from("/Font"), 0, header.length) ||
    searchBuffer(header, Buffer.from("/CIDFont"), 0, header.length)
  ) {
    return true
  }

  // Tier 4: pdftotext multi-page sample
  const pageCount = await pdfPageCount(pdfPath)
  return pdfTextPagesMeetThreshold(pdfPath, pageCount)
}

function fileExt(filePath: string): string {
  const i = filePath.lastIndexOf(".")
  return i >= 0 ? filePath.slice(i + 1) : ""
}

function searchBuffer(
  haystack: Buffer,
  needle: Buffer,
  start: number,
  end: number,
): boolean {
  return haystack.subarray(start, end).indexOf(needle) !== -1
}
