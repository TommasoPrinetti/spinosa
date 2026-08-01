import { LayerNode } from "@spinosa/kernel-core/effect/layer-node"
import { SessionExecutionStatus } from "@spinosa/kernel-core/session/execution-status"
import { SessionSchema } from "@spinosa/kernel-core/session/schema"
import { Effect, Layer } from "effect"
import { SessionStatus } from "./status"
import { SessionID } from "./schema"

/**
 * Publishes V2 SessionExecution busy/idle onto the existing session.status
 * wire contract so TUI ESC/spinner UX stays intact when V2 is the live path.
 */
const layer = Layer.effect(
  SessionExecutionStatus.Service,
  Effect.gen(function* () {
    const status = yield* SessionStatus.Service
    const asSessionID = (sessionID: SessionSchema.ID) => SessionID.make(sessionID)
    return SessionExecutionStatus.Service.of({
      setBusy: (sessionID) => status.set(asSessionID(sessionID), { type: "busy" }),
      setIdle: (sessionID) => status.set(asSessionID(sessionID), { type: "idle" }),
    })
  }),
)

export const node = LayerNode.make({
  service: SessionExecutionStatus.Service,
  layer,
  deps: [SessionStatus.node],
})

export * as SessionExecutionStatusBridge from "./execution-status-bridge"
