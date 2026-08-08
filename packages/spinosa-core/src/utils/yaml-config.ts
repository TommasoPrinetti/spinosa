import { mkdirSync } from "node:fs"
import path from "node:path"
import writeFileAtomic from "write-file-atomic"
import { parseDocument, type Document } from "yaml"

function scalarToString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value === "boolean") return value ? "true" : "false"
  if (typeof value === "number") return String(value)
  if (typeof value === "string") return value
  return String(value)
}

/** Parse with duplicate-key detection: a corrupted config is a loud error,
 * never a silent "first value wins" read or a throw only at write time. */
function parseConfig(source: string, filePath: string): Document {
  const document = parseDocument(source, { uniqueKeys: true })
  if (document.errors.length > 0) {
    const detail = document.errors
      .map((error) => error.message)
      .join("; ")
      .trim()
    throw new Error(`Invalid YAML in ${filePath}: ${detail || "parse error"}`)
  }
  return document
}

function ensureDocument(contents: string | undefined, defaults: string, filePath: string): Document {
  const source = contents?.trim() ? contents : defaults
  return parseConfig(source, filePath)
}

export async function readYamlScalar(filePath: string, key: string): Promise<string | undefined> {
  const file = Bun.file(filePath)
  if (!(await file.exists())) return undefined
  const document = parseConfig(await file.text(), filePath)
  return scalarToString(document.get(key))
}

export async function writeYamlConfig(
  filePath: string,
  update: (document: Document) => void,
  defaults = "",
): Promise<void> {
  const file = Bun.file(filePath)
  const contents = (await file.exists()) ? await file.text() : undefined
  const document = ensureDocument(contents, defaults, filePath)
  update(document)
  mkdirSync(path.dirname(filePath), { recursive: true })
  await writeFileAtomic(filePath, document.toString(), { mode: 0o600 })
}

export async function deleteYamlKey(filePath: string, key: string): Promise<void> {
  const file = Bun.file(filePath)
  if (!(await file.exists())) return
  const document = parseConfig(await file.text(), filePath)
  if (document.has(key)) {
    document.delete(key)
    await writeFileAtomic(filePath, document.toString(), { mode: 0o600 })
  }
}
