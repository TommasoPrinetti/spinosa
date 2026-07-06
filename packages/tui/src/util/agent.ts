import { Locale } from "./locale"

const DISPLAY_NAMES: Record<string, string> = {
  build: "Orchestrator-Editor",
  plan: "Orchestrator-Planner",
}

export function agentDisplayName(name: string) {
  return DISPLAY_NAMES[name] ?? Locale.titlecase(name)
}
