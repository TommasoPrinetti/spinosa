/** @jsxImportSource @opentui/solid */
import { expect, mock, test } from "bun:test"
import { testRender } from "@opentui/solid"

async function renderWorkspaceForRoute(input: {
  sessionID?: string
}) {
  mock.module("../../src/context/route", () => ({
    useRouteData: () => ({ type: "workspace", sessionID: input.sessionID }),
    useRoute: () => ({ navigate() {} }),
    useGlobalRoute: () => ({ type: "global" as const }),
    useSessionRoute: () => ({ type: "workspace" as const, sessionID: input.sessionID ?? "" }),
  }))
  mock.module("../../src/context/kv", () => ({
    useKV: () => ({
      get: (_key: string, defaultValue?: unknown) => defaultValue,
      set() {},
    }),
  }))
  mock.module("../../src/spinosa/workspace-bind", () => ({
    SpinosaWorkspaceBinder: () => <text>binder</text>,
  }))
  mock.module("../../src/routes/home", () => ({
    Home: () => <text>home-pane</text>,
  }))
  mock.module("../../src/routes/session", () => ({
    Session: () => <text>session-pane</text>,
  }))
  mock.module("../../src/spinosa/service", () => ({
    readBundledFrameworkVersion: () => undefined,
    isPrereleaseFrameworkVersion: () => false,
    listRegisteredWorkspaces: () => [],
    readWorkspaceMeta: () => undefined,
    countRawMarkdownFiles: () => 0,
  }))
  mock.module("../../src/spinosa/workspace-name", () => ({
    workspaceAsciiBannerText: () => undefined,
  }))
  mock.module("../../src/spinosa-core/system/maintenance", () => ({
    inspectSpinosaMaintenance: () => undefined,
  }))

  const Component = input.sessionID
    ? (await import("../../src/routes/session")).Session
    : (await import("../../src/routes/home")).Home
  const app = await testRender(() => <Component />, { width: 60, height: 6 })
  await app.renderOnce()
  const frame = app.captureCharFrame()
  app.renderer.destroy()
  mock.restore()
  return frame
}

test("renders the workspace home without pane navigation chrome", async () => {
  const frame = await renderWorkspaceForRoute({})
  expect(frame).toContain("home-pane")
  expect(frame).not.toContain("nav:")
})

test("keeps session routes on the session view instead of pane shells", async () => {
  const frame = await renderWorkspaceForRoute({ sessionID: "sess-1" })
  expect(frame).toContain("session-pane")
  expect(frame).not.toContain("home-pane")
})
