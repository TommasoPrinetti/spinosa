import { describe, expect, test } from "bun:test"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { resolveSpinosaEntryRoute, routeForSetupStatus } from "../../src/spinosa/entry"

const fixture = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "fixtures/workspace-started")

describe("routeForSetupStatus", () => {
  test("maps workspace_started to workspace shell", () => {
    expect(routeForSetupStatus("workspace_started").type).toBe("workspace")
  })

  test("routes cli_started through the workspace shell", () => {
    expect(routeForSetupStatus("cli_started").type).toBe("workspace")
  })

  test("keeps unfinished statuses on the chat workspace shell", () => {
    expect(routeForSetupStatus("not_started").type).toBe("workspace")
    expect(routeForSetupStatus("importing").type).toBe("workspace")
  })
})

describe("resolveSpinosaEntryRoute", () => {
  test("routes fixture cwd to workspace", async () => {
    const route = await resolveSpinosaEntryRoute({ cwd: fixture, skipPicker: true })
    expect(route.type).toBe("workspace")
  })
})
