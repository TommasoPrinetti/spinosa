import type { SessionStatus } from "@spinosa/sdk/v2"

export function isDefaultTitle(title: string) {
  return /^(New session - |Child session - )\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(title)
}

/** Derived busy signal from transcript when server `session_status` was wiped. */
export type DerivedSessionStatus = "idle" | "working" | "compacting"

/**
 * Prefer live server status; fall back to transcript-derived working/compacting
 * so interrupt/spinner UI survives dispose/bootstrap races that clear session_status.
 * Transcript "compacting" maps to busy (SDK SessionStatus has no compacting variant).
 */
export function resolveSessionRuntimeStatus(
  fromServer: SessionStatus | undefined,
  derived?: DerivedSessionStatus,
): SessionStatus {
  if (fromServer && fromServer.type !== "idle") return fromServer
  if (derived === "working" || derived === "compacting") return { type: "busy" }
  return fromServer ?? { type: "idle" }
}

export function sessionIsBusy(
  fromServer: SessionStatus | undefined,
  derived?: DerivedSessionStatus,
): boolean {
  return resolveSessionRuntimeStatus(fromServer, derived).type !== "idle"
}

/**
 * True when any known session is busy (server status or transcript-derived).
 * Used to block organisation switches mid-run.
 */
export function anySessionBusy(input: {
  sessionStatus?: Record<string, SessionStatus | undefined>
  sessions?: ReadonlyArray<{ id: string }>
  derivedStatus?: (sessionID: string) => DerivedSessionStatus | undefined
}): boolean {
  const statuses = input.sessionStatus ?? {}
  const derived = input.derivedStatus ?? (() => undefined)
  for (const sessionID of Object.keys(statuses)) {
    if (sessionIsBusy(statuses[sessionID], derived(sessionID))) return true
  }
  for (const session of input.sessions ?? []) {
    if (sessionIsBusy(statuses[session.id], derived(session.id))) return true
  }
  return false
}
