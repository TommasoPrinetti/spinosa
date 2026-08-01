import { describe, expect, test, beforeAll, afterAll, afterEach } from "bun:test"
import { existsSync, mkdtempSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { readFrameworkFilesTsv } from "@spinosa/core/framework/manifest"
import { createWorkspace } from "@spinosa/core/commands/create"
import { cleanupCreatedWorkspaces, trackCreatedWorkspace } from "../fixture/spinosa-test-home"

const repoRoot = path.resolve(import.meta.dir, "../../../..")

function frameworkRoot(): string {
  return repoRoot
}

let corpusDir: string
let testRoot: string

function isManifestDeclaredPath(file: string, manifestPaths: Set<string>): boolean {
  if (manifestPaths.has(file)) return true
  for (const declared of manifestPaths) {
    if (declared.endsWith("/")) {
      if (file.startsWith(declared)) return true
      continue
    }
    if (file.startsWith(`${declared}/`)) return true
  }
  return false
}

function listWorkspaceFiles(workspacePath: string, relative = ""): string[] {
  const current = relative ? path.join(workspacePath, relative) : workspacePath
  if (!existsSync(current)) return []
  const entries = readdirSync(current, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const rel = relative ? path.join(relative, entry.name) : entry.name
    const full = path.join(workspacePath, rel)
    if (entry.isDirectory()) {
      files.push(...listWorkspaceFiles(workspacePath, rel))
    } else if (entry.isFile()) {
      files.push(rel.split(path.sep).join("/"))
    } else if (entry.isSymbolicLink()) {
      try {
        if (statSync(full).isFile()) files.push(rel.split(path.sep).join("/"))
      } catch {
        // ignore broken symlinks
      }
    }
  }
  return files
}

beforeAll(() => {
  testRoot = mkdtempSync(path.join(tmpdir(), "spinosa-allowlist-"))
  corpusDir = path.join(testRoot, "corpus")
  mkdirSync(corpusDir, { recursive: true })
  writeFileSync(path.join(corpusDir, "sample.txt"), "sample\n")
})

afterAll(() => {
  rmSync(testRoot, { recursive: true, force: true })
})

afterEach(async () => {
  await cleanupCreatedWorkspaces()
})

describe("workspace template allowlist", () => {
  test("createWorkspace copies only manifest-declared files plus workspace marker", async () => {
    const root = frameworkRoot()
    expect(root).toBeTruthy()

    const templateRoot = path.join(root, "workspace-template")
    const manifestPaths = new Set(
      readFrameworkFilesTsv(path.join(templateRoot, ".spinosa", "workspace-files.tsv")).map((entry) => entry.path),
    )

    const allowedPostCopy = new Set([
      ".spinosa/workspace",
      ".spinosa/framework-checksums.json",
    ])

    const result = await createWorkspace({
      corpusPath: corpusDir,
      frameworkRoot: root,
      workspaceName: "allowlist-test",
    })
    expect(result.success).toBe(true)
    trackCreatedWorkspace(result.workspacePath)

    const copiedFiles = listWorkspaceFiles(result.workspacePath)
    const unexpected = copiedFiles.filter(
      (file) => !isManifestDeclaredPath(file, manifestPaths) && !allowedPostCopy.has(file),
    )
    expect(unexpected).toEqual([])
  })
})
