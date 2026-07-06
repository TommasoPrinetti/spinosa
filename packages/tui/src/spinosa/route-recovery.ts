import type { GoalArtifactSummary } from "./types"
import { artifactExists } from "./service"

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
  for (const item of goal.artifactPaths) {
    if (item.role === "Goal") continue
    const exists = await artifactExists(workspacePath, item.path)
    if (!exists) missing.push({ role: item.role, path: item.path, exists })
  }

  const active = goal.phases.find((phase) => phase.status === "active" || phase.status === "pending")
  return {
    sessionId: goal.sessionId,
    goalPath: goal.goalPath,
    complete: missing.length === 0,
    missing,
    nextAgent: active?.agent,
  }
}