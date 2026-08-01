import { value as envValue } from "@spinosa/kernel-core/flag/flag"
import { InstallationVersion } from "@spinosa/kernel-core/installation/version"
import { SessionLoopControl as Loop } from "@spinosa/kernel-core/session/loop-control"
import type { Session } from "@spinosa/sdk/v2"

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

/** Blank lines before a transcript part when the previous visible part differs in kind. */
export function assistantPartGapBefore(
  previousType: string | undefined,
  currentType: string,
): number {
  if (currentType !== "tool") return 0
  if (previousType === "text" || previousType === "reasoning") return 1
  return 0
}

/** Steer control label while a queued mid-run prompt awaits promote. */
export function steerControlLabel(input: {
  delivery?: "steer" | "queue"
  pending?: "steer" | "queue" | null
}): "Steer" | "waiting for steering" {
  if (input.pending === "queue") return "Steer"
  if (input.pending === "steer" || input.delivery === "steer") return "waiting for steering"
  return "Steer"
}

/** Next delivery when toggling Steer / de-steer on an unpromoted admission. */
export function toggleSteerDelivery(delivery: "steer" | "queue"): "steer" | "queue" {
  return delivery === "queue" ? "steer" : "queue"
}

/** Default-off V2 prompt path; set SPINOSA_SESSION_V2_PROMPT=1 to opt into SessionV2. */
export function useV2SessionPrompt(): boolean {
  const entry = envValue("SPINOSA_SESSION_V2_PROMPT")
  if (entry === undefined) return false
  const normalized = entry.toLowerCase()
  return normalized === "1" || normalized === "true"
}

/** @deprecated Client-only IDs race Session's session.get and bounce Home. Prefer server create. */
export function createPendingSessionID(): string {
  return `ses_${crypto.randomUUID().replace(/-/g, "").slice(0, 26)}`
}

/** @deprecated Optimistic seeds mark the shell ready before session.create finishes. */
export function buildOptimisticSession(input: {
  id: string
  directory: string
  projectID?: string
  title?: string
  workspaceID?: string
}): Session {
  const now = Date.now()
  return {
    id: input.id,
    slug: "",
    projectID: input.projectID ?? "",
    directory: input.directory,
    ...(input.workspaceID ? { workspaceID: input.workspaceID } : {}),
    title: input.title?.trim() || "New session",
    version: InstallationVersion,
    time: {
      created: now,
      updated: now,
    },
  }
}

/**
 * New-session Enter (Home → conversation) must navigate after the server
 * creates the session, then run prepare / V2 admission without blocking return
 * from that point. Navigating on a client-only ID makes Session's session.get
 * 404 and bounce back to Home.
 */
export function shouldNavigateBeforePrepare(hasExistingSessionID: boolean): boolean {
  return !hasExistingSessionID
}

/** Seed the server-created session into sync before the route change. */
export function shouldSeedSessionBeforeNavigate(hasExistingSessionID: boolean): boolean {
  return shouldNavigateBeforePrepare(hasExistingSessionID)
}

/**
 * Never navigate before session.create — a pending client ID is not gettable yet
 * and Session treats that as a fatal miss → Home.
 */
export function shouldNavigateBeforeCreate(_hasExistingSessionID: boolean): boolean {
  return false
}

/** Contract order for Home Enter → conversation (regression lock). */
export type NewSessionSubmitPhase = "create" | "seed" | "navigate" | "prepare" | "prompt"

export function newSessionSubmitPhases(): readonly NewSessionSubmitPhase[] {
  return ["create", "seed", "navigate", "prepare", "prompt"] as const
}
