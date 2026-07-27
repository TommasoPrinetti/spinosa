import type { RouteClass } from "./routes"

export const RESEARCH_RUN_STATUSES = [
  "created",
  "classified",
  "searching",
  "analysing",
  "writing",
  "verifying",
  "evaluating",
  "completed",
  "blocked",
  "failed",
  "cancelled",
] as const

export type ResearchRunStatus = (typeof RESEARCH_RUN_STATUSES)[number]

export type ResearchRun = {
  id: string
  workspacePath: string
  prompt: string
  route: RouteClass
  status: ResearchRunStatus
  phaseIndex: number
  createdAt: string
  updatedAt: string
  blocker?: string
  error?: string
}

export type ResearchRunEvent = {
  at: string
  type: "created" | "classified" | "execution_started" | "execution_completed" | "blocked" | "failed" | "cancelled" | "completed"
  status: ResearchRunStatus
  detail?: string
}

export type ExecutionRequest = {
  runID: string
  workspacePath: string
  agent: string
  prompt: string
  allowedTools: readonly string[]
}
