import { readFileSync, writeFileSync, existsSync, rmSync, statSync } from "node:fs"

const COLD_SCAFFOLD_FIELDS = [
  "type",
  "summary",
  "concepts",
  "language",
  "people",
  "places",
  "organizations",
  "topics",
]

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10)
}

export function injectColdFrontmatter(mdFile: string): void {
  if (!existsSync(mdFile)) return

  const content = readFileSync(mdFile, "utf-8")
  const lines = content.split("\n")

  if (lines.length > 0 && lines[0].trim() === "---") {
    const merged = mergeMissingFields(lines)
    writeFileSync(mdFile, merged, "utf-8")
  } else {
    const date = todayUTC()
    const scaffold = [
      "---",
      ...COLD_SCAFFOLD_FIELDS.map((f) => `${f}:`),
      `created: ${date}`,
      "---",
      "",
    ]
    writeFileSync(mdFile, [...scaffold, content].join("\n"), "utf-8")
  }
}

function mergeMissingFields(lines: string[]): string {
  const today = todayUTC()
  const seen = new Set<string>()
  let inFm = false
  let first = true
  const result: string[] = []

  for (const line of lines) {
    if (line.trim() === "---" && first) {
      result.push(line)
      inFm = true
      first = false
      continue
    }

    if (line.trim() === "---" && inFm) {
      for (const field of COLD_SCAFFOLD_FIELDS) {
        if (!seen.has(field)) result.push(`${field}:`)
      }
      if (!seen.has("created")) result.push(`created: ${today}`)
      result.push(line)
      inFm = false
      continue
    }

    if (inFm) {
      const match = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):/)
      if (match) seen.add(match[1])
    }

    result.push(line)
  }

  return result.join("\n")
}

export function convertedOutputExists(outputPath: string): boolean {
  if (!existsSync(outputPath)) return false
  try {
    const stat = statSync(outputPath)
    return stat.isFile() && stat.size > 0
  } catch {
    return false
  }
}

export function removeConvertedOutput(outputPath: string): void {
  if (existsSync(outputPath)) rmSync(outputPath, { force: true })
  const pageDir = outputPath.endsWith(".md")
    ? outputPath.slice(0, -3)
    : outputPath + "_pages"
  if (existsSync(pageDir)) rmSync(pageDir, { recursive: true, force: true })
}
