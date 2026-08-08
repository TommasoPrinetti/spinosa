import { createSignal } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
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
  /** Home Enter → conversation: show boot overlay until the session shell is ready. */
  conversationBooting?: boolean
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
    const [conversationBootingPending, setConversationBootingPending] = createSignal(false)
    const [store, setStore] = createStore<Route>(
      normalizeRoute(props.initialRoute ?? initialRoute(startup.initialRoute) ?? { type: "global" }),
    )

    return {
      get data() {
        return store
      },
      conversationBooting() {
        return conversationBootingPending() || (store.type === "workspace" && store.conversationBooting === true)
      },
      startConversationBoot() {
        setConversationBootingPending(true)
      },
      finishConversationBoot() {
        setConversationBootingPending(false)
        if (store.type === "workspace" && store.conversationBooting) {
          const next: WorkspaceRoute = {
            type: "workspace",
            sessionID: store.sessionID,
            ...(store.prompt ? { prompt: store.prompt } : {}),
          }
          setStore(reconcile(next))
        }
      },
navigate(route: RouteNavigateInput) {
        // A route change always ends any conversation-boot wait: leaving the
        // session shell (or the create failing elsewhere) must not leave the
        // "Loading conversation engine…" overlay stuck over the whole TUI.
        setConversationBootingPending(false)
        // Replace the route object wholesale so stale workspace keys do not linger across screen changes.
        // createStore's setStore(object) shallow-merges; reconcile is required to drop keys
        // (e.g. onboarding workspacePath after Resume → Home → New workspace).
        setStore(reconcile(normalizeRoute(route)))
      },
    }
  },
})

export function normalizeRoute(route: RouteNavigateInput): Route {
  if (route.type === "global") {
    return route.prompt ? { type: "global", prompt: route.prompt } : { type: "global" }
  }
  if (route.type === "onboarding") {
    return {
      type: "onboarding",
      ...(route.workspacePath !== undefined ? { workspacePath: route.workspacePath } : {}),
      ...(route.sourceLocation !== undefined ? { sourceLocation: route.sourceLocation } : {}),
      ...(route.workspaceName !== undefined ? { workspaceName: route.workspaceName } : {}),
    }
  }
  if (route.type === "add-files") {
    return { type: "add-files" }
  }
  if (route.type === "visualizer") {
    return {
      type: "visualizer",
      ...(route.workspacePath !== undefined ? { workspacePath: route.workspacePath } : {}),
      ...(route.sessionID !== undefined ? { sessionID: route.sessionID } : {}),
    }
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
      ...(route.prompt ? { prompt: route.prompt } : {}),
      ...(route.conversationBooting ? { conversationBooting: true } : {}),
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
