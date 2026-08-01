import { value as envValue } from "@spinosa/kernel-core/flag/flag"
import { SessionLoopControl as Loop } from "@spinosa/kernel-core/session/loop-control"

export type PromptPart =
  | { type: "text"; text: string; ignored?: boolean; synthetic?: boolean; metadata?: Record<string, unknown> }
  | { type: "file"; url: string; filename?: string; mime: string }
  | { type: "agent"; name: string }
  | { type: string; [key: string]: unknown }

export type V2PromptBody = {
  text: string
  files?: Array<{ uri: string; name?: string; mime?: string }>
  agents?: Array<{ name: string }>
}

/** Convert V1-shaped prompt parts into the V2 PromptInput body. */
export function partsToV2Prompt(parts: ReadonlyArray<PromptPart>): V2PromptBody {
  const texts: string[] = []
  const files: NonNullable<V2PromptBody["files"]> = []
  const agents: NonNullable<V2PromptBody["agents"]> = []

  for (const part of parts) {
    if (part.type === "text" && typeof part.text === "string") {
      if (part.ignored) continue
      texts.push(part.text)
      continue
    }
    if (part.type === "file" && typeof part.url === "string") {
      files.push({
        uri: part.url,
        ...(typeof part.filename === "string" ? { name: part.filename } : {}),
        ...(typeof part.mime === "string" ? { mime: part.mime } : {}),
      })
      continue
    }
    if (part.type === "agent" && typeof part.name === "string") {
      agents.push({ name: part.name })
    }
  }

  return {
    text: texts.join("\n"),
    ...(files.length > 0 ? { files } : {}),
    ...(agents.length > 0 ? { agents } : {}),
  }
}

export function resolvePromptDelivery(input: {
  busy: boolean
  requested?: "steer" | "queue"
  preferQueue?: boolean
  preferSteer?: boolean
}): "steer" | "queue" {
  return Loop.resolveDelivery(input)
}

/** Default-on V2 prompt path; set SPINOSA_SESSION_V2_PROMPT=0 to force V1. */
export function useV2SessionPrompt(): boolean {
  const entry = envValue("SPINOSA_SESSION_V2_PROMPT")
  if (entry === undefined) return true
  const normalized = entry.toLowerCase()
  return normalized === "1" || normalized === "true"
}

/**
 * New-session Enter (Home → conversation) must:
 * 1. seed `session.create` into the sync store (Session UI is gated on `session()`)
 * 2. navigate immediately
 * Spinosa prepare / V2 admission / first token stay async after the route change.
 */
export function shouldNavigateBeforePrepare(hasExistingSessionID: boolean): boolean {
  return !hasExistingSessionID
}

/** Same gate as navigate: seed create response before route change on new sessions. */
export function shouldSeedSessionBeforeNavigate(hasExistingSessionID: boolean): boolean {
  return shouldNavigateBeforePrepare(hasExistingSessionID)
}

/** Contract order for Home Enter → conversation (regression lock). */
export type NewSessionSubmitPhase = "create" | "seed" | "navigate" | "prepare" | "prompt"

export function newSessionSubmitPhases(): readonly NewSessionSubmitPhase[] {
  return ["create", "seed", "navigate", "prepare", "prompt"] as const
}
