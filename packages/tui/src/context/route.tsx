import { createStore } from "solid-js/store"
import { createSimpleContext } from "./helper"
import type { PromptInfo } from "../prompt/history"
import { useTuiStartup } from "./runtime"

export type GlobalRoute = {
  type: "global"
  prompt?: PromptInfo
}

export type WorkspaceRoute = {
  type: "workspace"
  sessionID: string
  prompt?: PromptInfo
}

export type OnboardingRoute = {
  type: "onboarding"
  workspacePath?: string
  sourceLocation?: string
  workspaceName?: string
}

export type AddFilesRoute = {
  type: "add-files"
}

export type PluginRoute = {
  type: "plugin"
  id: string
  data?: Record<string, unknown>
}

export type VisualizerRoute = {
  type: "visualizer"
  workspacePath?: string
  sessionID?: string
}

export type RouteNavigateInput =
  | GlobalRoute
  | WorkspaceRoute
  | OnboardingRoute
  | AddFilesRoute
  | PluginRoute
  | VisualizerRoute

export type Route = GlobalRoute | WorkspaceRoute | OnboardingRoute | AddFilesRoute | PluginRoute | VisualizerRoute

export const { use: useRoute, provider: RouteProvider } = createSimpleContext({
  name: "Route",
  init: (props: { initialRoute?: RouteNavigateInput }) => {
    const startup = useTuiStartup()
    const [store, setStore] = createStore<Route>(
      normalizeRoute(props.initialRoute ?? initialRoute(startup.initialRoute) ?? { type: "global" }),
    )

    return {
      get data() {
        return store
      },
      navigate(route: RouteNavigateInput) {
        // Replace the route object wholesale so stale workspace keys do not linger across screen changes.
        setStore(normalizeRoute(route))
      },
    }
  },
})

export function normalizeRoute(route: RouteNavigateInput): Route {
  if (route.type === "global" || route.type === "onboarding" || route.type === "add-files" || route.type === "visualizer") {
    return route
  }
  if (route.type === "plugin") {
    return {
      type: "plugin",
      id: route.id,
      data: route.data,
    }
  }
  if (route.type === "workspace") {
    return {
      type: "workspace",
      sessionID: route.sessionID,
      prompt: route.prompt,
    }
  }
  return { type: "global" }
}

function initialRoute(value: unknown): RouteNavigateInput | undefined {
  if (!value || typeof value !== "object" || !("type" in value)) return
  if (value.type === "global") return { type: "global" }
  if (value.type === "add-files") return { type: "add-files" }
  if (value.type === "onboarding") {
    return {
      type: "onboarding",
      workspacePath: "workspacePath" in value && typeof value.workspacePath === "string" ? value.workspacePath : undefined,
      sourceLocation: "sourceLocation" in value && typeof value.sourceLocation === "string" ? value.sourceLocation : undefined,
      workspaceName: "workspaceName" in value && typeof value.workspaceName === "string" ? value.workspaceName : undefined,
    }
  }
  if (value.type === "workspace") {
    const sessionID = "sessionID" in value && typeof value.sessionID === "string" ? value.sessionID : undefined
    if (!sessionID) return { type: "global", prompt: "prompt" in value ? (value.prompt as PromptInfo | undefined) : undefined }
    return {
      type: "workspace",
      sessionID,
      prompt: "prompt" in value ? (value.prompt as PromptInfo | undefined) : undefined,
    }
  }
  if (value.type === "plugin" && "id" in value && typeof value.id === "string") {
    return { type: "plugin", id: value.id }
  }
  if (value.type === "visualizer") {
    return {
      type: "visualizer",
      workspacePath: "workspacePath" in value && typeof value.workspacePath === "string" ? value.workspacePath : undefined,
      sessionID: "sessionID" in value && typeof value.sessionID === "string" ? value.sessionID : undefined,
    }
  }
}

export type RouteContext = ReturnType<typeof useRoute>

export function useRouteData<T extends Route["type"]>(type: T) {
  const route = useRoute()
  if (route.data.type === type) {
    return route.data as Extract<Route, { type: typeof type }>
  }
  throw new Error(`useRouteData("${type}") called with route type "${route.data.type}"`)
}

export function useGlobalRoute() {
  const route = useRoute()
  if (route.data.type !== "global") {
    throw new Error("useGlobalRoute requires the global route")
  }
  return route.data
}

export function useSessionRoute() {
  const route = useRoute()
  if (route.data.type !== "workspace") {
    throw new Error("useSessionRoute requires workspace with session")
  }
  return route.data
}
