/** @jsxImportSource @opentui/solid */
import { expect, mock, test } from "bun:test"
import { testRender } from "@opentui/solid"

async function renderWorkspaceForRoute(input: {
  sessionID?: string
}) {
  mock.module("../../src/routes/home", () => ({
    Home: () => <text>home-pane</text>,
  }))
  mock.module("../../src/routes/session", () => ({
    Session: () => <text>session-pane</text>,
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
