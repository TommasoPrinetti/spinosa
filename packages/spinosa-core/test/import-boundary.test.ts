import { describe, expect, test } from "bun:test"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

const packageRoots = [
  path.resolve(import.meta.dir, "../src"),
  path.resolve(import.meta.dir, "../../spinosa-runtime/src"),
]

describe("Spinosa kernel boundary", () => {
  test("core and runtime do not depend on Spinosa packages", async () => {
    const sourceFiles = await Promise.all(packageRoots.map(listSourceFiles))
    const imports = await Promise.all(sourceFiles.flat().map(async (file) => ({ file, text: await readFile(file, "utf8") })))
    const forbidden = imports.filter(({ text }) => /["']@opencode-ai\//.test(text))

    expect(forbidden.map(({ file }) => file)).toEqual([])
  })
})

async function listSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) return listSourceFiles(target)
    return entry.name.endsWith(".ts") || entry.name.endsWith(".tsx") ? [target] : []
  }))
  return nested.flat()
}
