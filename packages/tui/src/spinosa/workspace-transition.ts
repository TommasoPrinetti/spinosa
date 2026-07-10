import type { RouteNavigateInput } from "../context/route"
import type { SpinosaSetupStatus } from "../spinosa-core/types"
import { routeForSetupStatus } from "./entry"

type WorkspaceStatus = readonly [workspacePath: string | undefined, setupStatus: SpinosaSetupStatus | undefined]

export function routeForWorkspaceStatusTransition(
  current: WorkspaceStatus,
  previous: WorkspaceStatus | undefined,
): RouteNavigateInput | undefined {
  const [workspacePath, setupStatus] = current
  if (!workspacePath || !setupStatus || !previous) return
  if (previous[0] !== workspacePath || !previous[1] || previous[1] === setupStatus) return
  return routeForSetupStatus(setupStatus)
}
