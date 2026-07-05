import { describe, expect, test } from "bun:test"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { resolveSpinosaEntryRoute, routeForSetupStatus } from "../../src/spinosa/entry"
import { normalizeWorkspacePane } from "../../src/workspace/pane"

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
  })
})

describe("resolveSpinosaEntryRoute", () => {
  test("routes fixture cwd to workspace", async () => {
    const route = await resolveSpinosaEntryRoute({ cwd: fixture, skipPicker: true })
    expect(route.type).toBe("workspace")
  })
})

describe("normalizeWorkspacePane", () => {
  test("keeps known workspace panes and falls back unknown panes to chat", () => {
    expect(normalizeWorkspacePane("chat")).toBe("chat")
    expect(normalizeWorkspacePane("corpus")).toBe("corpus")
    expect(normalizeWorkspacePane("routes")).toBe("routes")
    expect(normalizeWorkspacePane("settings")).toBe("settings")
    expect(normalizeWorkspacePane("vis")).toBe("chat")
  })
})
