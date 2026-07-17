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
} from "../../src/spinosa-core/workspace/registry"
import { createWorkspaceID } from "../../src/spinosa-core/workspace/identity"
import { mkdirSync, renameSync, writeFileSync } from "node:fs"

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

    const exits = await Promise.all(children.map((child) => child.exited))
    expect(exits).toEqual(Array(count).fill(0))
    const entries = await loadRegistry(path.join(spinosaHome, "metadata", "workspaces.txt"), { allowMissingMarker: true })
    expect(entries).toHaveLength(count)
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

  test("parses legacy and ID registry records and enriches legacy marker IDs", async () => {
    await using tmp = await tmpdir()
    const legacy = path.join(tmp.path, "legacy")
    const modern = path.join(tmp.path, "modern")
    const legacyID = createWorkspaceID()
    const modernID = createWorkspaceID()
    for (const [workspace, id] of [[legacy, legacyID], [modern, modernID]] as const) {
      mkdirSync(path.join(workspace, ".spinosa"), { recursive: true })
      writeFileSync(path.join(workspace, ".spinosa", "workspace"), `workspace_id: ${id}\n`)
    }
    const registry = path.join(tmp.path, "workspaces.txt")
    await Bun.write(registry, `${legacy}|old|2026-07-17\n${modern}|new|2026-07-17|${modernID}\n`)
    const entries = await loadRegistry(registry)
    expect(entries).toEqual([
      { path: legacy, project: "old", workspaceID: legacyID },
      { path: modern, project: "new", workspaceID: modernID },
    ])
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
      expect(entries).toEqual([{ path: movedPath, project: "project", workspaceID: id }])
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
