export * as SessionLoopControl from "./loop-control"

import { Schema } from "effect"
import type { SessionInput } from "./input"

/**
 * Pi-inspired harness loop-control primitives for the V2 session runner.
 *
 * Status wire contract stays `idle | busy | retry`. Phases are an internal
 * refinement that always maps onto that contract for TUI/SDK consumers.
 *
 * ## Save points vs turn snapshots
 *
 * - `freezeTurn` captures tools/system/model barriers for the *in-flight* provider
 *   turn. Mid-run config mutations must not rewrite that snapshot.
 * - `refreshSavePoint` commits the latest successful-turn barriers so the *next*
 *   turn (including the rebuild after compaction) picks up live changes.
 * - Call `refreshSavePoint` after each successful turn and immediately before
 *   compaction restarts a turn from compacted history.
 *
 * ## Hooks (minimal, callable from SessionRunner)
 *
 * - `prepareNextTurn` — overflow/auto-compaction decision before the LLM call
 * - `shouldStopAfterTurn` — stop after tool terminate or max-steps
 * - `beforeToolCall` — skip/deny a tool before execution; Permission.ask stays
 *   inside tool settlement for allowed calls (permissions stay above this gate)
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
 * When process-local execution owns the session, treat it as a busy `turn` phase
 * for structural-op rejection (fine-grained phase stays runner-internal).
 */
export function phaseForActive(active: boolean): Phase {
  return active ? "turn" : "idle"
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
 * Inter-turn checkpoint. After a successful turn (and before compaction),
 * refresh so the next turn freezes the updated live barriers.
 */
export interface SavePoint {
  readonly snapshot: TurnSnapshot
  readonly refreshedAt: number
}

export function refreshSavePoint(input: {
  readonly snapshot: TurnSnapshot
  readonly previous?: SavePoint
  readonly refreshedAt?: number
}): SavePoint {
  return {
    snapshot: input.snapshot,
    refreshedAt: input.refreshedAt ?? Date.now(),
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

/**
 * Mid-run prompts default to queue (wait for the full run). Idle admits as
 * steer. Prefer `preferSteer` / `requested: "steer"` to break the flow now.
 */
export function resolveDelivery(input: {
  readonly busy: boolean
  readonly requested?: SessionInput.Delivery
  readonly preferQueue?: boolean
  readonly preferSteer?: boolean
}): SessionInput.Delivery {
  if (input.requested) return input.requested
  if (!input.busy) return "steer"
  if (input.preferSteer) return "steer"
  if (input.preferQueue) return "queue"
  return "queue"
}

// --- Turn-loop hooks (Pi agent-loop style; kept sync for unit tests) ---

export type PrepareNextTurnDecision =
  | { readonly action: "continue" }
  | { readonly action: "compact" }
  | { readonly action: "stop"; readonly reason?: string }

export interface PrepareNextTurnInput {
  readonly snapshot: TurnSnapshot
  /** True when SessionCompaction.compactIfNeeded would/did compact. */
  readonly wouldCompact: boolean
}

/**
 * Default prepareNextTurn: route auto-compaction into a compact restart,
 * otherwise continue into the provider turn.
 */
export function prepareNextTurn(input: PrepareNextTurnInput): PrepareNextTurnDecision {
  if (input.wouldCompact) return { action: "compact" }
  return { action: "continue" }
}

export interface ShouldStopAfterTurnInput {
  readonly terminated: boolean
  readonly maxStepsReached: boolean
  readonly needsContinuation: boolean
}

/** Stop after tool terminate or max-steps; otherwise continue while tools remain. */
export function shouldStopAfterTurn(input: ShouldStopAfterTurnInput): boolean {
  if (input.terminated || input.maxStepsReached) return true
  return !input.needsContinuation
}

export type BeforeToolCallDecision =
  | { readonly action: "allow" }
  | { readonly action: "skip"; readonly reason?: string }

export interface BeforeToolCallInput {
  readonly toolName: string
  readonly callID: string
}

/**
 * Gate before tool execution. Default allows; callers may supply a gate that
 * skips/denies without entering Permission.ask (permissions remain above this).
 */
export function beforeToolCall(
  input: BeforeToolCallInput,
  gate?: (input: BeforeToolCallInput) => BeforeToolCallDecision,
): BeforeToolCallDecision {
  return gate?.(input) ?? { action: "allow" }
}

/** Optional runner overrides — keep the extension surface minimal but real. */
export interface TurnHooks {
  readonly prepareNextTurn?: (input: PrepareNextTurnInput) => PrepareNextTurnDecision
  readonly shouldStopAfterTurn?: (input: ShouldStopAfterTurnInput) => boolean
  readonly beforeToolCall?: (input: BeforeToolCallInput) => BeforeToolCallDecision
}

export function resolveTurnHooks(hooks?: TurnHooks): Required<TurnHooks> {
  return {
    prepareNextTurn: hooks?.prepareNextTurn ?? prepareNextTurn,
    shouldStopAfterTurn: hooks?.shouldStopAfterTurn ?? shouldStopAfterTurn,
    beforeToolCall: hooks?.beforeToolCall
      ? (input) => beforeToolCall(input, hooks.beforeToolCall)
      : (input) => beforeToolCall(input),
  }
}
