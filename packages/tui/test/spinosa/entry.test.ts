import { describe, expect, test } from "bun:test"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { mkdirSync, writeFileSync } from "node:fs"
import { resolveSpinosaEntryRoute, routeForSetupStatus, routeForWorkspaceOpen } from "../../src/spinosa/entry"
import { createWorkspaceID } from "../../src/spinosa-core/workspace/identity"
import { tmpdir } from "../fixture/fixture"

const fixture = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "fixtures/workspace-started")

describe("routeForSetupStatus", () => {
  test("maps workspace_started to global", () => {
    expect(routeForSetupStatus("workspace_started").type).toBe("global")
  })

  test("routes cli_started through the startup hub", () => {
    expect(routeForSetupStatus("cli_started").type).toBe("global")
  })

  test("routes unfinished statuses to onboarding", () => {
    expect(routeForSetupStatus("not_started").type).toBe("onboarding")
    expect(routeForSetupStatus("importing").type).toBe("onboarding")
  })

  test("carries interrupted workspace metadata into onboarding", () => {
    expect(routeForWorkspaceOpen("importing", undefined, {
      workspacePath: "/workspaces/demo",
      sourceLocation: "/sources/demo",
      workspaceName: "demo",
    })).toEqual({
      type: "onboarding",
      workspacePath: "/workspaces/demo",
      sourceLocation: "/sources/demo",
      workspaceName: "demo",
    })
  })

  test("honors an intentional chat destination for a cli_started workspace", () => {
    expect(routeForWorkspaceOpen("cli_started", { type: "global" })).toEqual({ type: "global" })
  })
})

describe("resolveSpinosaEntryRoute", () => {
  test("routes fixture cwd to global", async () => {
    const route = await resolveSpinosaEntryRoute({ cwd: fixture, skipPicker: true })
    expect(route.type).toBe("global")
  })

  test("recovers a stale saved path from its workspace ID within explicit roots", async () => {
    await using tmp = await tmpdir()
    const originalHome = process.env.SPINOSA_HOME
    process.env.SPINOSA_HOME = path.join(tmp.path, "home")
    try {
      const workspace = path.join(tmp.path, "search", "moved-workspace")
      const id = createWorkspaceID()
      mkdirSync(path.join(workspace, ".spinosa"), { recursive: true })
      writeFileSync(path.join(workspace, ".spinosa", "workspace"), `workspace_id: ${id}\nsetup_status: workspace_started\n`)
      const route = await resolveSpinosaEntryRoute({
        cwd: tmp.path,
        kvActivePath: path.join(tmp.path, "missing"),
        kvActiveID: id,
        workspaceSearchRoots: [path.join(tmp.path, "search")],
      })
      expect(route.type).toBe("global")
    } finally {
      if (originalHome === undefined) delete process.env.SPINOSA_HOME
      else process.env.SPINOSA_HOME = originalHome
    }
  })

  test("recovers a stale saved path when picker skipping is enabled", async () => {
    await using tmp = await tmpdir()
    const workspace = path.join(tmp.path, "search", "moved-workspace")
    const id = createWorkspaceID()
    mkdirSync(path.join(workspace, ".spinosa"), { recursive: true })
    writeFileSync(
      path.join(workspace, ".spinosa", "workspace"),
      `workspace_id: ${id}\nsetup_status: workspace_started\n`,
    )

    const route = await resolveSpinosaEntryRoute({
      cwd: tmp.path,
      kvActivePath: path.join(tmp.path, "missing"),
      kvActiveID: id,
      workspaceSearchRoots: [path.join(tmp.path, "search")],
      skipPicker: true,
    })
    expect(route.type).toBe("global")
  })

  test("does not trust a live saved path whose marker belongs to another workspace ID", async () => {
    await using tmp = await tmpdir()
    const originalHome = process.env.SPINOSA_HOME
    process.env.SPINOSA_HOME = path.join(tmp.path, "home")
    try {
      const wrongWorkspace = path.join(tmp.path, "wrong-workspace")
      const expectedWorkspace = path.join(tmp.path, "expected-workspace")
      const wrongID = createWorkspaceID()
      const expectedID = createWorkspaceID()
      for (const [workspace, id, status] of [
        [wrongWorkspace, wrongID, "workspace_started"],
        [expectedWorkspace, expectedID, "importing"],
      ] as const) {
        mkdirSync(path.join(workspace, ".spinosa"), { recursive: true })
        writeFileSync(
          path.join(workspace, ".spinosa", "workspace"),
          `workspace_id: ${id}\nproject_name: ${path.basename(workspace)}\nsetup_status: ${status}\n`,
        )
      }

      const route = await resolveSpinosaEntryRoute({
        cwd: tmp.path,
        kvActivePath: wrongWorkspace,
        kvActiveID: expectedID,
        workspaceSearchRoots: [tmp.path],
      })

      expect(route).toEqual({
        type: "onboarding",
        workspacePath: expectedWorkspace,
        sourceLocation: undefined,
        workspaceName: "expected-workspace",
      })
    } finally {
      if (originalHome === undefined) delete process.env.SPINOSA_HOME
      else process.env.SPINOSA_HOME = originalHome
    }
  })
})
