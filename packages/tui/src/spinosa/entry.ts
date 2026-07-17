import type { RouteNavigateInput } from "../context/route"
import { isSpinosaWorkspace, readWorkspaceMeta } from "../spinosa-core/workspace/meta"
import { recoverWorkspacePathByID, registerWorkspace } from "../spinosa-core/workspace/registry"
import { parseWorkspaceID } from "../spinosa-core/workspace/identity"
import type { SpinosaSetupStatus } from "../spinosa-core/types"

export const SPINOSA_ACTIVE_WORKSPACE_KV = "spinosa_active_workspace_path"
export const SPINOSA_ACTIVE_WORKSPACE_ID_KV = "spinosa_active_workspace_id"
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
  kvActiveID?: string
  workspaceSearchRoots?: string[]
  skipPicker?: boolean
  forceGeneric?: boolean
}): Promise<RouteNavigateInput> {
  if (input.forceGeneric) return { type: "global" }

  let activePath = input.kvActivePath
  if ((!activePath || !isSpinosaWorkspace(activePath)) && input.kvActiveID) {
    const workspaceID = parseWorkspaceID(input.kvActiveID)
    if (workspaceID) activePath = await recoverWorkspacePathByID(workspaceID, input.workspaceSearchRoots)
  }

  if (input.skipPicker) {
    const path = activePath && isSpinosaWorkspace(activePath) ? activePath : input.cwd
    if (isSpinosaWorkspace(path)) return (await routeForWorkspace(path)) ?? { type: "global" }
    return { type: "global" }
  }

  if (activePath && isSpinosaWorkspace(activePath)) {
    // The KV active path may have been pruned from the registry (e.g. another
    // process cleaned it) while still being a valid workspace. Re-register it
    // so navigation and the picker stay consistent.
    try {
      const meta = await readWorkspaceMeta(activePath)
      await registerWorkspace(activePath, meta?.projectName ?? "", undefined, meta?.workspaceID).catch(() => {})
    } catch {
      // best-effort; proceed to route regardless
    }
    const route = await routeForWorkspace(activePath)
    if (route) return route
  }

  if (isSpinosaWorkspace(input.cwd)) {
    const route = await routeForWorkspace(input.cwd)
    if (route) return route
  }

  return { type: "global" }
}
