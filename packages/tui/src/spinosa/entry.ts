import type { RouteNavigateInput } from "../context/route"
import { isSpinosaWorkspace, readWorkspaceMeta } from "../spinosa-core/workspace/meta"
import type { SpinosaSetupStatus } from "../spinosa-core/types"

export const SPINOSA_ACTIVE_WORKSPACE_KV = "spinosa_active_workspace_path"
export const SPINOSA_GENERIC_MODE_KV = "spinosa_generic_mode"
export const SPINOSA_LAST_SESSION_KV = "spinosa_last_session_id"
export const SPINOSA_LAST_GOAL_KV = "spinosa_last_goal_path"

export function routeForSetupStatus(
  setupStatus: SpinosaSetupStatus,
): RouteNavigateInput {
  switch (setupStatus) {
    case "not_started":
    case "importing":
      return { type: "onboarding" }
    case "cli_started":
      return { type: "global" }
    case "workspace_started":
    case "unknown":
      return { type: "global" }
  }
}

export function routeForWorkspaceOpen(
  setupStatus: SpinosaSetupStatus,
  requestedRoute?: RouteNavigateInput,
): RouteNavigateInput {
  return requestedRoute ?? routeForSetupStatus(setupStatus)
}

async function routeForWorkspace(workspacePath: string): Promise<RouteNavigateInput | undefined> {
  try {
    const meta = await readWorkspaceMeta(workspacePath)
    return meta ? routeForSetupStatus(meta.setupStatus) : undefined
  } catch {
    return undefined
  }
}

export async function resolveSpinosaEntryRoute(input: {
  cwd: string
  kvActivePath?: string
  skipPicker?: boolean
  forceGeneric?: boolean
}): Promise<RouteNavigateInput> {
  if (input.skipPicker) {
    if (input.forceGeneric) return { type: "global" }
    const path = input.kvActivePath && isSpinosaWorkspace(input.kvActivePath) ? input.kvActivePath : input.cwd
    if (isSpinosaWorkspace(path)) return (await routeForWorkspace(path)) ?? { type: "global" }
    return { type: "global" }
  }

  if (input.kvActivePath && isSpinosaWorkspace(input.kvActivePath)) {
    const route = await routeForWorkspace(input.kvActivePath)
    if (route) return route
  }

  if (isSpinosaWorkspace(input.cwd)) {
    const route = await routeForWorkspace(input.cwd)
    if (route) return route
  }

  return { type: "global" }
}
