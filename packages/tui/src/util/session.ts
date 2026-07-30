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
