import { Locale } from "./locale"

/** Primary session agent for Spinosa workspaces (UI: Orchestrator-Editor). */
export const ORCHESTRATOR_AGENT_ID = "build"

const DISPLAY_NAMES: Record<string, string> = {
  build: "Orchestrator-Editor",
  plan: "Orchestrator-Planner",
}

export function agentDisplayName(name: string) {
  return DISPLAY_NAMES[name] ?? Locale.titlecase(name)
}

/** Prefer `build` when no agent is selected; never fall through to a Spinosa specialist. */
export function resolveDefaultPrimaryAgent<T extends { name: string }>(
  agents: readonly T[],
  currentName?: string,
): T | undefined {
  if (currentName) {
    const selected = agents.find((agent) => agent.name === currentName)
    if (selected) return selected
  }
  return agents.find((agent) => agent.name === ORCHESTRATOR_AGENT_ID) ?? agents.at(0)
}

/** Agent used for prompt submit — honors `forceAgent` even when sync lags or sticky state differs. */
export function resolveSubmitAgent<T extends { name: string }>(
  agents: readonly T[],
  options: { current?: string; forceAgent?: string },
): T | undefined {
  if (options.forceAgent) {
    const forced = agents.find((agent) => agent.name === options.forceAgent)
    if (forced) return forced
    if (options.forceAgent === ORCHESTRATOR_AGENT_ID) {
      return { name: ORCHESTRATOR_AGENT_ID } as T
    }
  }
  return resolveDefaultPrimaryAgent(agents, options.current)
}
