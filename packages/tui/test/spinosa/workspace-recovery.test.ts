import { describe, expect, test } from "bun:test"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { tmpdir } from "../fixture/fixture"
import { createWorkspaceID } from "@spinosa/core/workspace/identity"
import { loadRegistry, registerWorkspace, setWorkspacePresence } from "@spinosa/core/workspace/registry"
import {
  findWorkspaceMatchesByIDAsync,
  preferredWorkspaceRecoveryRoots,
  platformWorkspaceRecoveryRoots,
  recoverWorkspaceAtPath,
  scanAndRecoverWorkspace,
  shouldSkipWorkspaceRecoveryDirectory,
  workspaceRecoveryScanPlan,
} from "@spinosa/core/workspace/recovery"

function createWorkspace(workspacePath: string, workspaceID = createWorkspaceID()) {
  mkdirSync(path.join(workspacePath, ".spinosa"), { recursive: true })
  writeFileSync(
    path.join(workspacePath, ".spinosa", "workspace"),
    `project_name: recovered\nworkspace_id: ${workspaceID}\n`,
  )
  return workspaceID
}

describe("workspace recovery", () => {
  test("manual recovery validates the ID and atomically rebases the indexed record", async () => {
    await using tmp = await tmpdir()
    const originalHome = process.env.SPINOSA_HOME
    process.env.SPINOSA_HOME = path.join(tmp.path, "home")
    try {
      const workspaceID = createWorkspaceID()
      const indexedPath = path.join(tmp.path, "missing")
      const candidatePath = path.join(tmp.path, "new", "workspace")
      createWorkspace(indexedPath, workspaceID)
      await registerWorkspace(indexedPath, "project", undefined, workspaceID)
      rmSync(indexedPath, { recursive: true, force: true })
      await setWorkspacePresence({ workspacePath: indexedPath, workspaceID, presence: "non_existent" })
      createWorkspace(candidatePath, workspaceID)

      expect(await recoverWorkspaceAtPath({ indexedPath, candidatePath, projectName: "project", workspaceID })).toBe(candidatePath)
      expect(await loadRegistry(undefined, { allowMissingMarker: true })).toEqual([
        expect.objectContaining({ path: candidatePath, name: "project", workspaceID, presence: "present", tags: [] }),
      ])
    } finally {
      if (originalHome === undefined) delete process.env.SPINOSA_HOME
      else process.env.SPINOSA_HOME = originalHome
    }
  })

  test("manual recovery rejects a different workspace ID and keeps the missing entry", async () => {
    await using tmp = await tmpdir()
    const originalHome = process.env.SPINOSA_HOME
    process.env.SPINOSA_HOME = path.join(tmp.path, "home")
    try {
      const workspaceID = createWorkspaceID()
      const indexedPath = path.join(tmp.path, "missing")
      const candidatePath = path.join(tmp.path, "other")
      createWorkspace(indexedPath, workspaceID)
      await registerWorkspace(indexedPath, "project", undefined, workspaceID)
      rmSync(indexedPath, { recursive: true, force: true })
      createWorkspace(candidatePath)

      await expect(recoverWorkspaceAtPath({ indexedPath, candidatePath, projectName: "project", workspaceID }))
        .rejects.toThrow("different workspace ID")
      expect((await loadRegistry(undefined, { allowMissingMarker: true }))[0]?.path).toBe(indexedPath)
    } finally {
      if (originalHome === undefined) delete process.env.SPINOSA_HOME
      else process.env.SPINOSA_HOME = originalHome
    }
  })

  test("asynchronous scan reports progress, recovers one match, and rejects ambiguity", async () => {
    await using tmp = await tmpdir()
    const originalHome = process.env.SPINOSA_HOME
    process.env.SPINOSA_HOME = path.join(tmp.path, "home")
    try {
      const workspaceID = createWorkspaceID()
      const indexedPath = path.join(tmp.path, "missing")
      const found = path.join(tmp.path, "search", "one", "two", "workspace")
      createWorkspace(indexedPath, workspaceID)
      await registerWorkspace(indexedPath, "project", undefined, workspaceID)
      rmSync(indexedPath, { recursive: true, force: true })
      createWorkspace(found, workspaceID)
      let visited = 0

      expect(await scanAndRecoverWorkspace({
        indexedPath,
        projectName: "project",
        workspaceID,
        roots: [path.join(tmp.path, "search")],
        onProgress: (progress) => { visited = progress.visited },
      })).toEqual({ status: "found", path: found })
      expect(visited).toBeGreaterThan(0)

      const duplicate = path.join(tmp.path, "search", "duplicate")
      createWorkspace(duplicate, workspaceID)
      expect((await findWorkspaceMatchesByIDAsync({ workspaceID, roots: [path.join(tmp.path, "search")] })).sort())
        .toEqual([duplicate, found].sort())
      expect((await scanAndRecoverWorkspace({
        indexedPath: found,
        projectName: "project",
        workspaceID,
        roots: [path.join(tmp.path, "search")],
      })).status).toBe("ambiguous")
    } finally {
      if (originalHome === undefined) delete process.env.SPINOSA_HOME
      else process.env.SPINOSA_HOME = originalHome
    }
  })

  test("scan plan prefers common user folders and documents privacy scope", () => {
    const home = "/Users/example"
    const preferred = preferredWorkspaceRecoveryRoots(home)
    expect(preferred).toContain(path.join(home, "Documents"))
    expect(preferred).toContain(path.join(home, "Desktop"))
    expect(shouldSkipWorkspaceRecoveryDirectory("Library")).toBe(true)
    expect(shouldSkipWorkspaceRecoveryDirectory("node_modules")).toBe(true)
    expect(shouldSkipWorkspaceRecoveryDirectory(".ssh")).toBe(true)
    expect(shouldSkipWorkspaceRecoveryDirectory("Projects")).toBe(false)

    const plan = workspaceRecoveryScanPlan(path.join(home, "old", "workspace"), [home])
    expect(plan.maxDepth).toBe(8)
    expect(plan.skippedDirectoryNames).toContain("Library")
    expect(plan.notes.some((note) => note.includes("Local only"))).toBe(true)
    expect(plan.notes.some((note) => note.includes("workspace ID"))).toBe(true)
  })

  test("platform recovery roots keep Darwin Volumes and add Linux /run/media", () => {
    expect(platformWorkspaceRecoveryRoots("darwin")).toEqual(["/Volumes"])
    expect(platformWorkspaceRecoveryRoots("linux")).toEqual(["/mnt", "/media", "/run/media"])
    expect(platformWorkspaceRecoveryRoots("win32")).toEqual([])
  })

  test("scan skips bulky and sensitive directory names while walking", async () => {
    await using tmp = await tmpdir()
    const workspaceID = createWorkspaceID()
    const hidden = path.join(tmp.path, "Library", "workspace")
    const visible = path.join(tmp.path, "Projects", "workspace")
    createWorkspace(hidden, workspaceID)
    createWorkspace(visible, workspaceID)

    expect(await findWorkspaceMatchesByIDAsync({
      workspaceID,
      roots: [tmp.path],
    })).toEqual([visible])
  })

  test("scan respects abort signals", async () => {
    await using tmp = await tmpdir()
    const workspaceID = createWorkspaceID()
    mkdirSync(path.join(tmp.path, "a", "b", "c"), { recursive: true })
    const controller = new AbortController()
    controller.abort()
    await expect(findWorkspaceMatchesByIDAsync({
      workspaceID,
      roots: [tmp.path],
      signal: controller.signal,
    })).rejects.toThrow(/canceled/i)
  })
})
