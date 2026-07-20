import { expect, test } from "bun:test"
import { routeForWorkspaceStatusTransition } from "../../src/spinosa/workspace-transition"

test("initial metadata load does not override an intentional workspace route", () => {
  expect(routeForWorkspaceStatusTransition(["/workspace", "cli_started"], ["/workspace", undefined])).toBeUndefined()
})

test("a real status change in the same workspace still navigates", () => {
  expect(routeForWorkspaceStatusTransition(["/workspace", "workspace_started"], ["/workspace", "cli_started"]))
    .toEqual({ type: "global" })
})

test("a transition back to importing preserves resume context", () => {
  expect(routeForWorkspaceStatusTransition(
    ["/workspace", "importing"],
    ["/workspace", "workspace_started"],
    { sourceLocation: "/source", workspaceName: "research" },
  )).toEqual({
    type: "onboarding",
    workspacePath: "/workspace",
    sourceLocation: "/source",
    workspaceName: "research",
  })
})
