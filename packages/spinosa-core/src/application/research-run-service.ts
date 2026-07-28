import type { SpinosaHarness } from "@spinosa/harness"
import {
  beginExecution,
  agentsForRoute,
  classifyPrompt,
  completeExecution,
  createResearchRun,
  failRun,
  FileResearchRunRepository,
  isTerminal,
  isNonFastPath,
  nextExecution,
  type RouteClass,
} from "@spinosa/runtime"
import { orchestratorPreamble, writeGoalArtifact } from "../artifacts/goal"
import { generateSessionId } from "../session-id"
import { isSpinosaWorkspace } from "../workspace/meta"

export type PreparedResearchRun = {
  text: string
  route: RouteClass
  runID?: string
  goalPath?: string
  workspacePath?: string
  framed: boolean
}

export class ResearchRunService {
  constructor(
    private readonly repository = new FileResearchRunRepository(),
    private readonly harness?: SpinosaHarness,
  ) {}

  async prepare(workspacePath: string, promptText: string): Promise<PreparedResearchRun> {
    const cleanedPrompt = stripExistingPreamble(promptText)
    const route = classifyPrompt(cleanedPrompt)
    if (!isSpinosaWorkspace(workspacePath) || !isNonFastPath(route)) {
      return { text: cleanedPrompt, route, framed: false }
    }

    const run = createResearchRun({
      id: generateSessionId(),
      workspacePath,
      prompt: cleanedPrompt,
      route,
    })
    await this.repository.create(run)
    const active = beginExecution(run)
    await this.repository.save(active)

    const execution = nextExecution(active)
    if (!execution) throw new Error("Research run has no executable phase")
    await this.repository.append(workspacePath, active.id, {
      at: active.updatedAt,
      type: "execution_started",
      status: active.status,
      detail: execution.agent,
    })

    const goal = await writeGoalArtifact(workspacePath, cleanedPrompt, {
      sessionId: active.id,
      route,
    })
    return {
      text: cleanedPrompt,
      route,
      runID: active.id,
      goalPath: goal.goalPath,
      workspacePath,
      framed: true,
    }
  }

  async execute(input: { sessionID: string; prepared: PreparedResearchRun; model?: { providerID: string; modelID: string } }): Promise<void> {
    if (!input.prepared.framed || !input.prepared.runID || !this.harness) return
    if (!input.prepared.workspacePath) return
    let run = await this.repository.load(input.prepared.workspacePath, input.prepared.runID)
    if (!run) throw new Error("Spinosa research run was not found")

    while (true) {
      const execution = nextExecution(run)
      if (!execution) return

      if (run.status === "classified") {
        run = beginExecution(run)
        await this.repository.save(run)
        await this.repository.append(run.workspacePath, run.id, {
          at: run.updatedAt,
          type: "execution_started",
          status: run.status,
          detail: execution.agent,
        })
      }

      try {
        const phase = phasePrompt(input.prepared, execution.agent, run.phaseIndex)
        const agents = agentsForRoute(run.route)
        const deliveryAgent = agents.find((agent) => agent === "spinosa-writer") ?? agents[0]
        await this.harness.executeAgent({
          sessionID: input.sessionID,
          agent: execution.agent,
          prompt: phase.prompt,
          system: phase.system,
          synthetic: phase.synthetic,
          silent: execution.agent !== deliveryAgent,
          model: input.model,
        })
      } catch (error) {
        const persisted = await this.repository.load(run.workspacePath, run.id)
        if (persisted?.status === "cancelled") return
        run = failRun(run, error instanceof Error ? error.message : String(error))
        await this.repository.save(run)
        await this.repository.append(run.workspacePath, run.id, {
          at: run.updatedAt,
          type: "failed",
          status: run.status,
          detail: run.error,
        })
        throw error
      }

      const persisted = await this.repository.load(run.workspacePath, run.id)
      if (persisted && isTerminal(persisted)) return
      run = completeExecution(run)
      await this.repository.save(run)
      await this.repository.append(run.workspacePath, run.id, {
        at: run.updatedAt,
        type: "execution_completed",
        status: run.status,
        detail: execution.agent,
      })
      if (run.status === "completed") {
        await this.repository.append(run.workspacePath, run.id, {
          at: run.updatedAt,
          type: "completed",
          status: run.status,
        })
        return
      }

      run = beginExecution(run)
      await this.repository.save(run)
      const next = nextExecution(run)
      if (!next) throw new Error("Spinosa research run has no next phase")
      await this.repository.append(run.workspacePath, run.id, {
        at: run.updatedAt,
        type: "execution_started",
        status: run.status,
        detail: next.agent,
      })
    }
  }
}

function phasePrompt(prepared: PreparedResearchRun, agent: string, phaseIndex: number): {
  prompt: string
  system: string
  synthetic: boolean
} {
  const system = [
    orchestratorPreamble({
      workspacePath: prepared.workspacePath ?? "",
      route: prepared.route,
      sessionId: prepared.runID,
      goalPath: prepared.goalPath,
    }),
    `Assigned agent: ${agent}`,
    `Goal artifact: ${prepared.goalPath}`,
    "Write the phase artifact required by the goal before replying.",
  ].join("\n\n")

  return {
    prompt: phaseIndex === 0 ? prepared.text : "Continue with the assigned phase.",
    system,
    synthetic: true,
  }
}

function stripExistingPreamble(text: string): string {
  if (typeof text !== "string") throw new TypeError("Spinosa prompt must be a string")
  return text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>\s*/g, "").trim()
}
