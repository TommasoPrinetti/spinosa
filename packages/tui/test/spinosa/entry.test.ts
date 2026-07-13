import { describe, expect, test } from "bun:test"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { resolveSpinosaEntryRoute, routeForSetupStatus, routeForWorkspaceOpen } from "../../src/spinosa/entry"

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

  test("honors an intentional chat destination for a cli_started workspace", () => {
    expect(routeForWorkspaceOpen("cli_started", { type: "global" })).toEqual({ type: "global" })
  })
})

describe("resolveSpinosaEntryRoute", () => {
  test("routes fixture cwd to global", async () => {
    const route = await resolveSpinosaEntryRoute({ cwd: fixture, skipPicker: true })
    expect(route.type).toBe("global")
  })
})
