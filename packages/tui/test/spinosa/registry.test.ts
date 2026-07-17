import { describe, expect, test } from "bun:test"
import path from "node:path"
import { tmpdir } from "../fixture/fixture"
import {
  findWorkspaceMatchesByID,
  loadRegistry,
  recoverWorkspacePathByID,
  registerWorkspace,
  registryEscape,
  registryUnescape,
  setWorkspaceTags,
} from "../../src/spinosa-core/workspace/registry"
import { createWorkspaceID } from "../../src/spinosa-core/workspace/identity"
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs"

describe("workspace registry", () => {
  test("round-trips delimiters and line breaks", () => {
    const value = "line one|100%\nline two\r"
    expect(registryUnescape(registryEscape(value))).toBe(value)
    expect(registryEscape(value)).not.toMatch(/[\r\n]/)
  })

  test("keeps every registration from concurrent processes", async () => {
    await using tmp = await tmpdir()
    const spinosaHome = path.join(tmp.path, "home")
    const modulePath = path.resolve(import.meta.dir, "../../src/spinosa-core/workspace/registry.ts")
    const count = 20
    const children = Array.from({ length: count }, (_, index) => Bun.spawn({
      cmd: [
        process.execPath,
        "-e",
        `import { registerWorkspace } from ${JSON.stringify(modulePath)}; await registerWorkspace(${JSON.stringify(path.join(tmp.path, "ws"))} + ${JSON.stringify(String(index))}, ${JSON.stringify("project")} + ${JSON.stringify(String(index))});`,
      ],
      env: { ...process.env, SPINOSA_HOME: spinosaHome },
      stdout: "pipe",
      stderr: "pipe",
    }))

    const results = await Promise.all(children.map(async (child) => ({
      exit: await child.exited,
      stderr: await new Response(child.stderr).text(),
    })))
    expect(results.filter((result) => result.exit !== 0)).toEqual([])
    const registryPath = path.join(spinosaHome, "metadata", "workspaces.json")
    const entries = await loadRegistry(registryPath, { allowMissingMarker: true })
    expect(entries).toHaveLength(count)
    expect(JSON.parse(await Bun.file(registryPath).text()).schemaVersion).toBe(1)
  })

  test("serializes same-process registrations", async () => {
    await using tmp = await tmpdir()
    const originalHome = process.env.SPINOSA_HOME
    process.env.SPINOSA_HOME = path.join(tmp.path, "home")
    try {
      await Promise.all(Array.from({ length: 10 }, (_, index) => registerWorkspace(path.join(tmp.path, `ws-${index}`), `p-${index}`)))
      const entries = await loadRegistry(undefined, { allowMissingMarker: true })
      expect(entries).toHaveLength(10)
    } finally {
      if (originalHome === undefined) delete process.env.SPINOSA_HOME
      else process.env.SPINOSA_HOME = originalHome
    }
  })

  test("persists normalized workspace tags in the rich registry", async () => {
    await using tmp = await tmpdir()
    const originalHome = process.env.SPINOSA_HOME
    process.env.SPINOSA_HOME = path.join(tmp.path, "home")
    try {
      const workspace = path.join(tmp.path, "workspace")
      const workspaceID = createWorkspaceID()
      mkdirSync(path.join(workspace, ".spinosa"), { recursive: true })
      writeFileSync(path.join(workspace, ".spinosa", "workspace"), `workspace_id: ${workspaceID}\nsetup_status: importing\n`)
      await registerWorkspace(workspace, "research", undefined, workspaceID)
      await setWorkspaceTags({ workspacePath: workspace, workspaceID, tags: [" primary ", "research", "primary", ""] })

      expect(await loadRegistry(undefined, { allowMissingMarker: true })).toEqual([
        expect.objectContaining({
          path: workspace,
          name: "research",
          workspaceID,
          presence: "present",
          setupStatus: "importing",
          tags: ["primary", "research"],
        }),
      ])
    } finally {
      if (originalHome === undefined) delete process.env.SPINOSA_HOME
      else process.env.SPINOSA_HOME = originalHome
    }
  })

  test("recovers a corrupt JSON registry from its last atomic backup", async () => {
    await using tmp = await tmpdir()
    const originalHome = process.env.SPINOSA_HOME
    process.env.SPINOSA_HOME = path.join(tmp.path, "home")
    try {
      const workspace = path.join(tmp.path, "workspace")
      await registerWorkspace(workspace, "recoverable")
      const registry = path.join(process.env.SPINOSA_HOME, "metadata", "workspaces.json")
      await Bun.write(registry, "{broken")

      expect(await loadRegistry(undefined, { allowMissingMarker: true })).toEqual([
        expect.objectContaining({ path: workspace, name: "recoverable", presence: "unknown" }),
      ])
      expect(JSON.parse(await Bun.file(registry).text()).schemaVersion).toBe(1)
    } finally {
      if (originalHome === undefined) delete process.env.SPINOSA_HOME
      else process.env.SPINOSA_HOME = originalHome
    }
  })

  test("migrates legacy records to rich JSON and enriches marker IDs", async () => {
    await using tmp = await tmpdir()
    const originalHome = process.env.SPINOSA_HOME
    process.env.SPINOSA_HOME = path.join(tmp.path, "home")
    const legacy = path.join(tmp.path, "legacy")
    const modern = path.join(tmp.path, "modern")
    const legacyID = createWorkspaceID()
    const modernID = createWorkspaceID()
    for (const [workspace, id] of [[legacy, legacyID], [modern, modernID]] as const) {
      mkdirSync(path.join(workspace, ".spinosa"), { recursive: true })
      writeFileSync(path.join(workspace, ".spinosa", "workspace"), `workspace_id: ${id}\n`)
    }
    try {
      const metadata = path.join(process.env.SPINOSA_HOME, "metadata")
      mkdirSync(metadata, { recursive: true })
      const legacyRegistry = path.join(metadata, "workspaces.txt")
      const jsonRegistry = path.join(metadata, "workspaces.json")
      await Bun.write(legacyRegistry, `${legacy}|old|2026-07-17\n${modern}|new|2026-07-17|${modernID}\n`)
      const entries = await loadRegistry()
      expect(entries).toEqual([
        expect.objectContaining({ path: legacy, name: "old", workspaceID: legacyID, presence: "present", registeredAt: "2026-07-17", tags: [] }),
        expect.objectContaining({ path: modern, name: "new", workspaceID: modernID, presence: "present", registeredAt: "2026-07-17", tags: [] }),
      ])
      expect(JSON.parse(await Bun.file(jsonRegistry).text())).toMatchObject({
        schemaVersion: 1,
        workspaces: [
          { id: legacyID, name: "old", state: { presence: "present", setupStatus: "unknown" } },
          { id: modernID, name: "new", state: { presence: "present", setupStatus: "unknown" } },
        ],
      })
      expect(existsSync(`${legacyRegistry}.migrated`)).toBe(true)
    } finally {
      if (originalHome === undefined) delete process.env.SPINOSA_HOME
      else process.env.SPINOSA_HOME = originalHome
    }
  })

  test("upserts by ID after a moved workspace and refuses ambiguous matches", async () => {
    await using tmp = await tmpdir()
    const originalHome = process.env.SPINOSA_HOME
    process.env.SPINOSA_HOME = path.join(tmp.path, "home")
    try {
      const id = createWorkspaceID()
      const oldPath = path.join(tmp.path, "old", "workspace")
      mkdirSync(path.join(oldPath, ".spinosa"), { recursive: true })
      writeFileSync(path.join(oldPath, ".spinosa", "workspace"), `workspace_id: ${id}\n`)
      await registerWorkspace(oldPath, "project", undefined, id)
      const movedPath = path.join(tmp.path, "moved", "workspace")
      mkdirSync(path.dirname(movedPath), { recursive: true })
      renameSync(oldPath, movedPath)
      await registerWorkspace(movedPath, "project", undefined, id)
      const entries = await loadRegistry(undefined, { allowMissingMarker: true })
      expect(entries).toEqual([
        expect.objectContaining({ path: movedPath, name: "project", workspaceID: id, presence: "present", tags: [] }),
      ])
      expect(findWorkspaceMatchesByID(id, [tmp.path])).toEqual([movedPath])
      expect(await recoverWorkspacePathByID(id, [tmp.path])).toBe(movedPath)

      const duplicate = path.join(tmp.path, "duplicate")
      mkdirSync(path.join(duplicate, ".spinosa"), { recursive: true })
      writeFileSync(path.join(duplicate, ".spinosa", "workspace"), `workspace_id: ${id}\n`)
      expect(findWorkspaceMatchesByID(id, [tmp.path]).sort()).toEqual([duplicate, movedPath].sort())
      expect(await recoverWorkspacePathByID(id, [tmp.path])).toBeUndefined()
    } finally {
      if (originalHome === undefined) delete process.env.SPINOSA_HOME
      else process.env.SPINOSA_HOME = originalHome
    }
  })
})
