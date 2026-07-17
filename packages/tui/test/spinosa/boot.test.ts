import { describe, expect, test } from "bun:test"
import { mkdirSync, renameSync } from "node:fs"
import path from "node:path"
import { createWorkspaceID } from "../../src/spinosa-core/workspace/identity"
import { runSpinosaBootHealth } from "../../src/spinosa-core/system/boot"
import { registerWorkspace, loadRegistry } from "../../src/spinosa-core/workspace/registry"
import { tmpdir } from "../fixture/fixture"

describe("Spinosa boot health", () => {
  test("marks missing entries and repairs a uniquely moved workspace", async () => {
    await using tmp = await tmpdir()
    const originalHome = process.env.SPINOSA_HOME
    process.env.SPINOSA_HOME = path.join(tmp.path, "home")
    try {
      const existing = path.join(tmp.path, "existing")
      mkdirSync(path.join(existing, ".spinosa"), { recursive: true })
      const existingID = createWorkspaceID()
      await Bun.write(path.join(existing, ".spinosa", "workspace"), `workspace_id: ${existingID}\nsetup_status: workspace_started\n`)
      await registerWorkspace(existing, "existing", undefined, existingID)

      const oldPath = path.join(tmp.path, "old", "moved")
      const movedPath = path.join(tmp.path, "new", "moved")
      const movedID = createWorkspaceID()
      mkdirSync(path.join(oldPath, ".spinosa"), { recursive: true })
      await Bun.write(path.join(oldPath, ".spinosa", "workspace"), `workspace_id: ${movedID}\n`)
      await registerWorkspace(oldPath, "moved", undefined, movedID)
      mkdirSync(path.dirname(movedPath), { recursive: true })
      renameSync(oldPath, movedPath)

      const missingPath = path.join(tmp.path, "deleted")
      const missingID = createWorkspaceID()
      const registryPath = path.join(process.env.SPINOSA_HOME, "metadata", "workspaces.txt")
      await Bun.write(registryPath, `${await Bun.file(registryPath).text()}${missingPath}|deleted|2026-07-17|${missingID}\n`)

      const progress: string[] = []
      const result = await runSpinosaBootHealth({
        searchRoots: [tmp.path],
        minimumOperationDurationMs: 0,
        onProgress(operation) {
          progress.push(`${operation.id}:${operation.status}`)
        },
      })
      expect(progress.slice(0, 3)).toEqual([
        "maintenance:running",
        "maintenance:complete",
        "workspace-index:running",
      ])
      expect(progress.slice(-2)).toEqual([
        "ready:running",
        "ready:complete",
      ])
      expect(result.workspaces.find((workspace) => workspace.indexedPath === missingPath)?.status).toBe("non_existent")
      expect(result.workspaces.find((workspace) => workspace.indexedPath === oldPath)?.status).toBe("moved")

      const entries = await loadRegistry(undefined, { allowMissingMarker: true })
      expect(entries.find((entry) => entry.path === missingPath)?.presence).toBe("non_existent")
      expect(entries.find((entry) => entry.path === movedPath)?.presence).toBe("present")
      expect(entries.some((entry) => entry.path === oldPath)).toBe(false)
    } finally {
      if (originalHome === undefined) delete process.env.SPINOSA_HOME
      else process.env.SPINOSA_HOME = originalHome
    }
  })
})
