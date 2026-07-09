import { describe, expect, test, beforeAll, afterAll } from "bun:test"
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync, realpathSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { resolveFrameworkRoot } from "../../src/spinosa-core/framework/discovery"
import { createWorkspace } from "../../src/spinosa-core/commands/create"
import { validateWorkspace } from "../../src/spinosa-core/workspace/registry"
import { readWorkspaceMeta } from "../../src/spinosa-core/workspace/meta"

let corpusDir: string
let testRoot: string

beforeAll(() => {
  // Create a temporary corpus (simulates a user folder they want to import)
  testRoot = mkdtempSync(path.join(tmpdir(), "spinosa-e2e-"))
  corpusDir = path.join(testRoot, "my-project")
  mkdirSync(corpusDir, { recursive: true })
  writeFileSync(path.join(corpusDir, "README.md"), "# My Project\n")
  writeFileSync(path.join(corpusDir, "data.csv"), "a,b,c\n1,2,3\n")
})

afterAll(() => {
  rmSync(testRoot, { recursive: true, force: true })
})

describe("E2E: Workspace creation flow", () => {
  test("resolveFrameworkRoot finds the repo root", () => {
    const root = resolveFrameworkRoot()
    expect(root).toBeTruthy()
    // Verify the marker exists at the expected path
    const marker = path.join(root!, "workspace-template", ".spinosa", "workspace-files.tsv")
    expect(existsSync(marker)).toBe(true)
  })

  test("createWorkspace succeeds with valid framework root", async () => {
    const root = resolveFrameworkRoot()
    expect(root).toBeTruthy()

    const result = await createWorkspace({
      corpusPath: corpusDir,
      frameworkRoot: root!,
      workspaceName: "e2e-test-workspace",
    })

    // Verify success
    expect(result.success).toBe(true)
    expect(result.workspacePath).toBeTruthy()

    // Verify workspace structure
    const ws = result.workspacePath
    expect(validateWorkspace(ws)).toBe(true)

    // Check canonical workspace paths
    expect(existsSync(path.join(ws, ".spinosa", "workspace"))).toBe(true)
    expect(existsSync(path.join(ws, "AGENTS.md"))).toBe(true)
    expect(existsSync(path.join(ws, "startup-prompt.md"))).toBe(true)
    expect(existsSync(path.join(ws, ".bin", "spinosa"))).toBe(true)
    expect(existsSync(path.join(ws, ".agents"))).toBe(true)

    // Check user-state directories
    expect(existsSync(path.join(ws, "raw"))).toBe(true)
    expect(existsSync(path.join(ws, "raw", ".gitkeep"))).toBe(true)
    expect(existsSync(path.join(ws, "maps"))).toBe(true)
    expect(existsSync(path.join(ws, "logs"))).toBe(true)
    expect(existsSync(path.join(ws, "agent_reports"))).toBe(true)
    expect(existsSync(path.join(ws, ".trash"))).toBe(true)

    // Check deleted legacy workspace layout should NOT exist
    expect(existsSync(path.join(ws, "framework", "spinosa", "workspace"))).toBe(false)
  })

  test("readWorkspaceMeta returns correct metadata", async () => {
    const root = resolveFrameworkRoot()
    expect(root).toBeTruthy()

    const result = await createWorkspace({
      corpusPath: corpusDir,
      frameworkRoot: root!,
      workspaceName: "e2e-meta-test",
    })

    expect(result.success).toBe(true)

    const meta = await readWorkspaceMeta(result.workspacePath)
    expect(meta).toBeTruthy()
    expect(meta!.projectName).toBe("e2e-meta-test")
    expect(meta!.setupStatus).toBe("not_started")
  })

  test("second workspace creation auto-increments name", async () => {
    const root = resolveFrameworkRoot()
    expect(root).toBeTruthy()

    const ws1 = await createWorkspace({
      corpusPath: corpusDir,
      frameworkRoot: root!,
      workspaceName: "e2e-dup-test",
    })
    expect(ws1.success).toBe(true)

    // Same name should create a numbered variant
    const ws2 = await createWorkspace({
      corpusPath: corpusDir,
      frameworkRoot: root!,
      workspaceName: "e2e-dup-test",
    })
    expect(ws2.success).toBe(true)
    expect(ws2.workspacePath).not.toBe(ws1.workspacePath)
  })

  test("failed workspace creation cleans up reserved directory", async () => {
    const result = await createWorkspace({
      corpusPath: corpusDir,
      frameworkRoot: path.join(testRoot, "missing-framework"),
      workspaceName: "e2e-cleanup-test",
    })

    expect(result.success).toBe(false)
    expect(existsSync(result.workspacePath)).toBe(false)
  })
})
