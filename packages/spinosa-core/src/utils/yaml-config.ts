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

function ensureDocument(contents: string | undefined, defaults: string): Document {
  const source = contents?.trim() ? contents : defaults
  return parseDocument(source)
}

export async function readYamlScalar(filePath: string, key: string): Promise<string | undefined> {
  const file = Bun.file(filePath)
  if (!(await file.exists())) return undefined
  const document = parseDocument(await file.text())
  return scalarToString(document.get(key))
}

export async function writeYamlConfig(
  filePath: string,
  update: (document: Document) => void,
  defaults = "",
): Promise<void> {
  const file = Bun.file(filePath)
  const contents = (await file.exists()) ? await file.text() : undefined
  const document = ensureDocument(contents, defaults)
  update(document)
  mkdirSync(path.dirname(filePath), { recursive: true })
  await writeFileAtomic(filePath, document.toString(), { mode: 0o600 })
}

export async function deleteYamlKey(filePath: string, key: string): Promise<void> {
  const file = Bun.file(filePath)
  if (!(await file.exists())) return
  const document = parseDocument(await file.text())
  if (document.has(key)) {
    document.delete(key)
    await writeFileAtomic(filePath, document.toString(), { mode: 0o600 })
  }
}
