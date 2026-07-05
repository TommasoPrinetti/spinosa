import type { RouteNavigateInput } from "../context/route"
import type { WorkspacePane } from "../workspace/pane"
import { isSpinosaWorkspace, readWorkspaceMeta } from "./service"
import type { SpinosaSetupStatus } from "./types"

export const SPINOSA_ACTIVE_WORKSPACE_KV = "spinosa_active_workspace_path"
export const SPINOSA_GENERIC_MODE_KV = "spinosa_generic_mode"
export const SPINOSA_LAST_SESSION_KV = "spinosa_last_session_id"
export const SPINOSA_LAST_GOAL_KV = "spinosa_last_goal_path"

export function routeForSetupStatus(
  setupStatus: SpinosaSetupStatus,
  pane: WorkspacePane = "chat",
): RouteNavigateInput {
  return { type: "workspace", pane }
}

export async function resolveSpinosaEntryRoute(input: {
  cwd: string
  kvActivePath?: string
  skipPicker?: boolean
  forceGeneric?: boolean
}): Promise<RouteNavigateInput> {
  if (input.skipPicker) {
    if (input.forceGeneric) return { type: "workspace", pane: "chat" }
    const path = input.kvActivePath && isSpinosaWorkspace(input.kvActivePath) ? input.kvActivePath : input.cwd
    if (isSpinosaWorkspace(path)) {
      const meta = await readWorkspaceMeta(path)
      if (meta) return routeForSetupStatus(meta.setupStatus)
    }
    return { type: "workspace", pane: "chat" }
  }

  if (input.kvActivePath && isSpinosaWorkspace(input.kvActivePath)) {
    const meta = await readWorkspaceMeta(input.kvActivePath)
    if (meta) {
      if (meta.setupStatus === "cli_started") return { type: "workspace-picker" }
      return routeForSetupStatus(meta.setupStatus)
    }
  }

  if (isSpinosaWorkspace(input.cwd)) {
    const meta = await readWorkspaceMeta(input.cwd)
    if (meta) {
      if (meta.setupStatus === "cli_started") return { type: "workspace-picker" }
      return routeForSetupStatus(meta.setupStatus)
    }
  }

  return { type: "workspace-picker" }
}
