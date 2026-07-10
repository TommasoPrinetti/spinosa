import type { GoalArtifactSummary } from "../spinosa-core/types"
import { artifactExists } from "../spinosa-core/workspace/meta"

export type RecoveryGap = {
  role: string
  path: string
  exists: boolean
}

export type RouteRecovery = {
  sessionId: string
  goalPath: string
  complete: boolean
  missing: RecoveryGap[]
  nextAgent?: string
}

export async function analyzeRouteRecovery(
  workspacePath: string,
  goal: GoalArtifactSummary,
): Promise<RouteRecovery> {
  const missing: RecoveryGap[] = []
  if (!artifactExists(workspacePath, goal.goalPath)) {
    missing.push({ role: "Goal", path: goal.goalPath, exists: false })
  }
  const artifactPaths = Array.isArray(goal.artifactPaths) ? goal.artifactPaths : []
  for (const item of artifactPaths) {
    if (!item || typeof item !== "object" || typeof item.role !== "string" || typeof item.path !== "string") continue
    if (item.role === "Goal") continue
    const exists = await artifactExists(workspacePath, item.path)
    if (!exists) missing.push({ role: item.role, path: item.path, exists })
  }

  const phases = Array.isArray(goal.phases) ? goal.phases : []
  const active = phases.find((phase) => phase?.status === "active" || phase?.status === "pending")
  return {
    sessionId: goal.sessionId,
    goalPath: goal.goalPath,
    complete: missing.length === 0,
    missing,
    nextAgent: active?.agent,
  }
}
