export * as SessionLoopControl from "./loop-control"

import { Schema } from "effect"
import type { SessionInput } from "./input"

/**
 * Pi-inspired harness loop-control primitives for the V2 session runner.
 *
 * Status wire contract stays `idle | busy | retry`. Phases are an internal
 * refinement that always maps onto that contract for TUI/SDK consumers.
 */

export const Phase = Schema.Literals([
  "idle",
  "turn",
  "tool",
  "compaction",
  "retry",
  "promoting",
]).annotate({ identifier: "SessionLoopControl.Phase" })
export type Phase = typeof Phase.Type

export const Status = Schema.Literals(["idle", "busy", "retry"]).annotate({
  identifier: "SessionLoopControl.Status",
})
export type Status = typeof Status.Type

/** Map an internal phase onto the public session.status contract. */
export function statusForPhase(phase: Phase): Status {
  switch (phase) {
    case "idle":
      return "idle"
    case "retry":
      return "retry"
    case "turn":
    case "tool":
    case "compaction":
    case "promoting":
      return "busy"
  }
}

export function isBusyPhase(phase: Phase): boolean {
  return statusForPhase(phase) !== "idle"
}

export class BusyRejection extends Schema.TaggedErrorClass<BusyRejection>()("SessionLoopControl.BusyRejection", {
  phase: Phase,
  operation: Schema.String,
  message: Schema.String,
}) {}

/** Reject structural ops (model/agent switch, compact, etc.) while a turn is in flight. */
export function rejectIfBusy(phase: Phase, operation: string): BusyRejection | undefined {
  if (!isBusyPhase(phase)) return undefined
  return new BusyRejection({
    phase,
    operation,
    message: `Cannot ${operation} while session phase is ${phase} (status=${statusForPhase(phase)})`,
  })
}

/**
 * Frozen turn barriers. Mid-turn config/tool/system mutations must not affect
 * the in-flight provider request — setters apply on the next turn only.
 */
export interface TurnSnapshot {
  readonly sessionID: string
  readonly step: number
  readonly promotion: SessionInput.Delivery | undefined
  readonly system: ReadonlyArray<string>
  readonly toolNames: ReadonlyArray<string>
  readonly model: {
    readonly id: string
    readonly provider: string
    readonly variant?: string
  }
  readonly createdAt: number
}

export function freezeTurn(input: {
  readonly sessionID: string
  readonly step: number
  readonly promotion?: SessionInput.Delivery
  readonly system: ReadonlyArray<string>
  readonly toolNames: ReadonlyArray<string>
  readonly model: { readonly id: string; readonly provider: string; readonly variant?: string }
  readonly createdAt?: number
}): TurnSnapshot {
  return {
    sessionID: input.sessionID,
    step: input.step,
    promotion: input.promotion,
    system: Object.freeze([...input.system]),
    toolNames: Object.freeze([...input.toolNames]),
    model: Object.freeze({ ...input.model }),
    createdAt: input.createdAt ?? Date.now(),
  }
}

/**
 * Tool settlement may signal that the agent loop should stop without another
 * LLM call (Pi `beforeToolCall` / terminate). Default tools leave this unset.
 */
export interface ToolTerminate {
  readonly terminate: true
  readonly reason?: string
}

export function isToolTerminate(value: unknown): value is ToolTerminate {
  return typeof value === "object" && value !== null && (value as ToolTerminate).terminate === true
}

/** Prefer steer for mid-run user input (Pi default); queue only when explicitly requested. */
export function resolveDelivery(input: {
  readonly busy: boolean
  readonly requested?: SessionInput.Delivery
  readonly preferQueue?: boolean
}): SessionInput.Delivery {
  if (input.requested) return input.requested
  if (!input.busy) return "steer"
  return input.preferQueue ? "queue" : "steer"
}
