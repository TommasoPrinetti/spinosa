import { describe, expect, test } from "bun:test"
import { createComponent, createRoot } from "solid-js"
import { normalizeRoute, RouteProvider, useRoute } from "../../src/context/route"
import { TuiStartupProvider } from "../../src/context/runtime"

describe("normalizeRoute", () => {
  test("maps add-files route directly", () => {
    expect(normalizeRoute({ type: "add-files" })).toEqual({ type: "add-files" })
  })

  test("drops workspace-only fields when switching to add-files", () => {
    const next = normalizeRoute({ type: "add-files" })
    expect(next).toEqual({ type: "add-files" })
    expect("sessionID" in next).toBe(false)
    expect("prompt" in next).toBe(false)
  })

  test("bare onboarding omits resume context keys", () => {
    const next = normalizeRoute({ type: "onboarding" })
    expect(next).toEqual({ type: "onboarding" })
    expect("workspacePath" in next).toBe(false)
    expect("sourceLocation" in next).toBe(false)
    expect("workspaceName" in next).toBe(false)
  })

  test("preserves explicit onboarding resume context", () => {
    expect(
      normalizeRoute({
        type: "onboarding",
        workspacePath: "/workspaces/dbg",
        sourceLocation: "/sources/dbg",
        workspaceName: "dbg",
      }),
    ).toEqual({
      type: "onboarding",
      workspacePath: "/workspaces/dbg",
      sourceLocation: "/sources/dbg",
      workspaceName: "dbg",
    })
  })

  test("preserves plugin routes for feature plugins", () => {
    expect(normalizeRoute({ type: "plugin", id: "diff-viewer", data: { path: "a" } })).toEqual({
      type: "plugin",
      id: "diff-viewer",
      data: { path: "a" },
    })
  })

  test("normalizes unknown runtime routes to the global", () => {
    expect(normalizeRoute({ type: "future-route" } as never)).toEqual({ type: "global" })
  })
})

describe("route navigate", () => {
  test("New workspace after resume does not keep the prior onboarding workspacePath", () => {
    createRoot((dispose) => {
      let route!: ReturnType<typeof useRoute>
      createComponent(TuiStartupProvider, {
        value: { skipInitialLoading: true },
        get children() {
          return createComponent(RouteProvider, {
            initialRoute: {
              type: "onboarding",
              workspacePath: "/workspaces/dbg",
              sourceLocation: "/sources/dbg",
              workspaceName: "dbg",
            },
            get children() {
              return createComponent(() => {
                route = useRoute()
                return null
              }, {})
            },
          })
        },
      })

      expect(route.data).toEqual({
        type: "onboarding",
        workspacePath: "/workspaces/dbg",
        sourceLocation: "/sources/dbg",
        workspaceName: "dbg",
      })

      route.navigate({ type: "global" })
      expect(route.data).toEqual({ type: "global" })
      expect("workspacePath" in route.data).toBe(false)

      route.navigate({ type: "onboarding" })
      expect(route.data).toEqual({ type: "onboarding" })
      expect("workspacePath" in route.data).toBe(false)
      expect("sourceLocation" in route.data).toBe(false)
      expect("workspaceName" in route.data).toBe(false)

      dispose()
    })
  })
})
