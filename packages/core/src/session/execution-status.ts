export * as SessionExecutionStatus from "./execution-status"

import { Context, Effect, Layer } from "effect"
import { makeGlobalNode } from "../effect/app-node"
import { SessionSchema } from "./schema"

/**
 * Optional hook so the process-local V2 execution owner can publish
 * busy/idle onto the existing session.status wire contract without
 * depending on the kernel SessionStatus service from core.
 */
export interface Interface {
  readonly setBusy: (sessionID: SessionSchema.ID) => Effect.Effect<void>
  readonly setIdle: (sessionID: SessionSchema.ID) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@spinosa/v2/SessionExecutionStatus") {}

export const noopLayer = Layer.succeed(
  Service,
  Service.of({
    setBusy: () => Effect.void,
    setIdle: () => Effect.void,
  }),
)

/** Default no-op; kernel replaces this with SessionStatus-backed reporting. */
export const node = makeGlobalNode({
  service: Service,
  layer: noopLayer,
  deps: [],
})
