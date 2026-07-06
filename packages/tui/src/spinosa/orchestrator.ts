import { classifyPrompt, isNonFastPath, type RouteClass } from "@opencode-ai/spinosa-core/classify/route"
import { orchestratorPreamble, writeGoalArtifact } from "@opencode-ai/spinosa-core/artifacts/goal"
import { isSpinosaWorkspace } from "@opencode-ai/spinosa-core/workspace/meta"

export type PreparedSubmit = {
  text: string
  route: RouteClass
  sessionId?: string
  goalPath?: string
  framed: boolean
}

export async function prepareSpinosaSubmit(workspacePath: string, promptText: string): Promise<PreparedSubmit> {
  const cleaned = stripExistingPreamble(promptText)
  const route = classifyPrompt(cleaned)

  if (!isSpinosaWorkspace(workspacePath) || !isNonFastPath(route)) {
    return { text: cleaned, route, framed: false }
  }

  const goal = await writeGoalArtifact(workspacePath, cleaned)
  const preamble = orchestratorPreamble({
    workspacePath,
    route: goal.route,
    sessionId: goal.sessionId,
    goalPath: goal.goalPath,
  })

  return {
    text: `${preamble}\n\n${cleaned}`,
    route: goal.route,
    sessionId: goal.sessionId,
    goalPath: goal.goalPath,
    framed: true,
  }
}

function stripExistingPreamble(text: string) {
  return text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>\s*/g, "").trim()
}