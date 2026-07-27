import { ResearchRunService } from "@spinosa/core"
import { SpinosaKernelHarness } from "@spinosa/harness"
import { cancelRun, FileResearchRunRepository, type RouteClass } from "@spinosa/runtime"

const activeResearchRuns = new Map<string, { runID: string; workspacePath: string }>()

export type PreparedSubmit = {
  text: string
  route: RouteClass
  sessionId?: string
  goalPath?: string
  workspacePath?: string
  framed: boolean
}

export async function prepareSpinosaSubmit(workspacePath: string, promptText: string): Promise<PreparedSubmit> {
  const prepared = await new ResearchRunService().prepare(workspacePath, promptText)
  return {
    text: prepared.text,
    route: prepared.route,
    sessionId: prepared.runID,
    goalPath: prepared.goalPath,
    workspacePath: prepared.workspacePath,
    framed: prepared.framed,
  }
}

export async function executeSpinosaSubmit(input: {
  client: unknown
  sessionID: string
  prepared: PreparedSubmit
  model: { providerID: string; modelID: string }
}): Promise<void> {
  const harness = new SpinosaKernelHarness(input.client as ConstructorParameters<typeof SpinosaKernelHarness>[0])
  const prepared = {
    text: input.prepared.text,
    route: input.prepared.route,
    runID: input.prepared.sessionId,
    goalPath: input.prepared.goalPath,
    workspacePath: input.prepared.workspacePath,
    framed: input.prepared.framed,
  }
  if (prepared.runID && prepared.workspacePath) {
    activeResearchRuns.set(input.sessionID, { runID: prepared.runID, workspacePath: prepared.workspacePath })
  }
  try {
    await new ResearchRunService(undefined, harness).execute({ sessionID: input.sessionID, prepared, model: input.model })
  } finally {
    activeResearchRuns.delete(input.sessionID)
  }
}

export async function cancelSpinosaSubmit(input: { client: unknown; sessionID: string }): Promise<boolean> {
  const active = activeResearchRuns.get(input.sessionID)
  if (!active) return false
  const repository = new FileResearchRunRepository()
  const run = await repository.load(active.workspacePath, active.runID)
  if (run) {
    const cancelled = cancelRun(run)
    await repository.save(cancelled)
    await repository.append(cancelled.workspacePath, cancelled.id, {
      at: cancelled.updatedAt,
      type: "cancelled",
      status: cancelled.status,
    })
  }
  const harness = new SpinosaKernelHarness(input.client as ConstructorParameters<typeof SpinosaKernelHarness>[0])
  await harness.cancelExecution({ sessionID: input.sessionID })
  return true
}
