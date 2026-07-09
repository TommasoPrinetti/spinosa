import { createStore } from "solid-js/store"
import { createSimpleContext } from "./helper"
import type { PromptInfo } from "../prompt/history"
import { useTuiStartup } from "./runtime"

export type WorkspaceRoute = {
  type: "workspace"
  sessionID?: string
  prompt?: PromptInfo
}

export type WorkspacePickerRoute = {
  type: "workspace-picker"
}


export type OnboardingRoute = {
  type: "onboarding"
}

export type AddFilesRoute = {
  type: "add-files"
}

/** @deprecated Use `{ type: "add-files" }` instead of `{ type: "onboarding", mode: "add" }`. */
export type LegacyOnboardingNavigateInput = {
  type: "onboarding"
  mode: "new" | "add"
}

export type HomeRoute = {
  type: "home"
  prompt?: PromptInfo
}

export type SessionRoute = {
  type: "session"
  sessionID: string
  prompt?: PromptInfo
}

export type PluginRoute = {
  type: "plugin"
  id: string
  data?: Record<string, unknown>
}

/** @deprecated Use workspace-picker or workspace routes */
export type LauncherRoute = {
  type: "launcher"
}

export type RouteNavigateInput =
  | WorkspaceRoute
  | WorkspacePickerRoute
  | OnboardingRoute
  | AddFilesRoute
  | LegacyOnboardingNavigateInput
  | HomeRoute
  | SessionRoute
  | PluginRoute
  | LauncherRoute

export type Route = WorkspaceRoute | WorkspacePickerRoute | OnboardingRoute | AddFilesRoute | PluginRoute

export const { use: useRoute, provider: RouteProvider } = createSimpleContext({
  name: "Route",
  init: (props: { initialRoute?: RouteNavigateInput }) => {
    const startup = useTuiStartup()
    const [store, setStore] = createStore<Route>(
      normalizeRoute(props.initialRoute ?? initialRoute(startup.initialRoute) ?? { type: "workspace" }),
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
  if (route.type === "home") {
    return { type: "workspace", prompt: route.prompt }
  }
  if (route.type === "session") {
    return { type: "workspace", sessionID: route.sessionID, prompt: route.prompt }
  }
  if (route.type === "onboarding" && "mode" in route) {
    if (route.mode === "add") return { type: "add-files" }
    return { type: "onboarding" }
  }
  if (route.type === "workspace-picker" || route.type === "onboarding" || route.type === "add-files") {
    return route
  }
  if (route.type === "launcher") {
    return { type: "workspace" }
  }
  if (route.type === "workspace") {
    return {
      type: "workspace",
      sessionID: route.sessionID,
      prompt: route.prompt,
    }
  }
  return route
}

function initialRoute(value: unknown): RouteNavigateInput | undefined {
  if (!value || typeof value !== "object" || !("type" in value)) return
  if (value.type === "workspace-picker") return { type: "workspace-picker" }
  if (value.type === "add-files") return { type: "add-files" }
  if (value.type === "onboarding" && "mode" in value) {
    if (value.mode === "add") return { type: "add-files" }
    return { type: "onboarding" }
  }
  if (value.type === "onboarding") return { type: "onboarding" }
  if (value.type === "workspace") {
    return {
      type: "workspace",
      sessionID: "sessionID" in value && typeof value.sessionID === "string" ? value.sessionID : undefined,
      prompt: "prompt" in value ? (value.prompt as PromptInfo | undefined) : undefined,
    }
  }
  if (value.type === "home") return { type: "home" }
  if (value.type === "session" && "sessionID" in value && typeof value.sessionID === "string") {
    return { type: "session", sessionID: value.sessionID }
  }
  if (value.type === "plugin" && "id" in value && typeof value.id === "string") {
    return { type: "plugin", id: value.id }
  }
  if (value.type === "launcher") return { type: "workspace" }
}

export type RouteContext = ReturnType<typeof useRoute>

export function useRouteData<T extends Route["type"]>(type: T) {
  const route = useRoute()
  if (route.data.type === type) {
    return route.data as Extract<Route, { type: typeof type }>
  }
  throw new Error(`useRouteData("${type}") called with route type "${route.data.type}"`)
}

export function useLegacyHomeRoute() {
  const route = useRoute()
  if (route.data.type !== "workspace" || route.data.sessionID) {
    throw new Error("useLegacyHomeRoute requires workspace chat without session")
  }
  return { type: "home" as const, prompt: route.data.prompt }
}

export function useLegacySessionRoute() {
  const route = useRoute()
  if (route.data.type !== "workspace" || !route.data.sessionID) {
    throw new Error("useLegacySessionRoute requires workspace chat with session")
  }
  return { type: "session" as const, sessionID: route.data.sessionID, prompt: route.data.prompt }
}

export function workspaceHasSession(route: Route): route is WorkspaceRoute & { sessionID: string } {
  return route.type === "workspace" && route.sessionID !== undefined
}

export function workspaceChatHome(route: Route): route is WorkspaceRoute & { sessionID?: undefined } {
  return route.type === "workspace" && route.sessionID === undefined
}
