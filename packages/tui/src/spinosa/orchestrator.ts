import { ResearchRunService } from "@spinosa/core"
import { SpinosaKernelHarness } from "@spinosa/harness"
import { cancelRun, FileResearchRunRepository, type RouteClass } from "@spinosa/runtime"
import { createImportJob, cancelSpinosaJob, type ImportJobHandle } from "./job-events"

type ActiveResearchRun = { runID: string; workspacePath: string; job: ImportJobHandle }

const activeResearchRuns = new Map<string, ActiveResearchRun>()

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
  /** Host GlobalBus publish so session chrome can observe research jobs. */
  publish?: Parameters<typeof createImportJob>[0]["publish"]
  /** In-process TUI emitter for immediate strip updates. */
  localEmit?: Parameters<typeof createImportJob>[0]["localEmit"]
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
    if (activeResearchRuns.has(input.sessionID)) {
      await cancelSpinosaSubmit({ client: input.client, sessionID: input.sessionID })
    }
    const job = createImportJob({
      kind: "research",
      title: `Research · ${prepared.route}`,
      directory: prepared.workspacePath,
      publish: input.publish,
      localEmit: input.localEmit,
    })
    const active = { runID: prepared.runID, workspacePath: prepared.workspacePath, job }
    activeResearchRuns.set(input.sessionID, active)
    job.start()
    try {
      await new ResearchRunService(undefined, harness).execute({ sessionID: input.sessionID, prepared, model: input.model })
      if (!job.shouldAbort()) {
        job.finish(
          "completed",
          prepared.goalPath ? `goal ${prepared.goalPath}` : undefined,
        )
      }
    } catch (err) {
      if (!job.shouldAbort()) job.finish("error", err instanceof Error ? err.message : String(err))
      throw err
    } finally {
      if (activeResearchRuns.get(input.sessionID) === active) activeResearchRuns.delete(input.sessionID)
    }
    return
  }
  await new ResearchRunService(undefined, harness).execute({ sessionID: input.sessionID, prepared, model: input.model })
}

/**
 * Cancel research for a session using the same JobRunner cancel-by-id path as import.
 * Also cancels the harness execution and persists run status.
 */
export async function cancelSpinosaSubmit(input: { client: unknown; sessionID: string }): Promise<boolean> {
  const active = activeResearchRuns.get(input.sessionID)
  if (!active) return false

  // Same control plane as import: cancel-by-id + job.cancelled event.
  active.job.cancel()

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
  activeResearchRuns.delete(input.sessionID)
  return true
}

/** Cancel any Spinosa domain job (import / research / future processors) by id. */
export { cancelSpinosaJob }
