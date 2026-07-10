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
  return { type: "workspace" }
}

export async function resolveSpinosaEntryRoute(input: {
  cwd: string
  kvActivePath?: string
  skipPicker?: boolean
  forceGeneric?: boolean
}): Promise<RouteNavigateInput> {
  if (input.skipPicker) {
    if (input.forceGeneric) return { type: "workspace" }
    const path = input.kvActivePath && isSpinosaWorkspace(input.kvActivePath) ? input.kvActivePath : input.cwd
    if (isSpinosaWorkspace(path)) {
      const meta = await readWorkspaceMeta(path)
      if (meta) return routeForSetupStatus(meta.setupStatus)
    }
    return { type: "workspace" }
  }

  if (input.kvActivePath && isSpinosaWorkspace(input.kvActivePath)) {
    const meta = await readWorkspaceMeta(input.kvActivePath)
    if (meta) {
      if (meta.setupStatus === "cli_started" || meta.setupStatus === "importing") return { type: "workspace-picker" }
      return routeForSetupStatus(meta.setupStatus)
    }
  }

  if (isSpinosaWorkspace(input.cwd)) {
    const meta = await readWorkspaceMeta(input.cwd)
    if (meta) {
      if (meta.setupStatus === "cli_started" || meta.setupStatus === "importing") return { type: "workspace-picker" }
      return routeForSetupStatus(meta.setupStatus)
    }
  }

  return { type: "workspace" }
}
